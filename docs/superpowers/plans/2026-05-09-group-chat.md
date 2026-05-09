# Group Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现群聊模式，支持多 Agent 参与同一会话、主持人自动路由、独立窗口和后台生成不中断。

**Architecture:** 独立建两张表（`group_chat_sessions` / `group_chat_messages`）与现有单聊完全隔离；新增 `AgentInvoker` 作为每个 Agent 的独立 fire-and-forget 执行单元，输出推送到群聊渠道；前端新增 `GroupChatPanel` 视图，与现有 `ChatroomPanel` 并列。

**Tech Stack:** TypeScript + better-sqlite3 + Vue 3 + Pinia + Electron BrowserWindow IPC

---

## 文件清单

### 新增

- `src/shared/types/groupChat.d.ts` — GroupChatSession / GroupChatMessageRecord 类型
- `src/shared/types/presenters/groupChat.presenter.d.ts` — IPC 接口类型
- `src/main/db/models/groupChatSessionDao.ts` — 群聊会话 DAO
- `src/main/db/models/groupChatMessageDao.ts` — 群聊消息 DAO
- `src/main/presenter/agentChat/agentInvoker.ts` — AgentInvoker（per-agent 执行单元）
- `src/main/presenter/agentChat/agentInvokerRegistry.ts` — 注册表单例
- `src/main/presenter/groupChatPresenter.ts` — GroupChatPresenter
- `src/renderer/src/stores/groupChatSession.ts` — useGroupChatSessionStore
- `src/renderer/src/stores/groupChat.ts` — useGroupChatStore
- `src/renderer/src/stores/groupChatIpc.ts` — GROUP_CHAT_EVENTS IPC 监听
- `src/renderer/src/components/groupchat/GroupSessionList.vue`
- `src/renderer/src/components/groupchat/NewGroupThread.vue`
- `src/renderer/src/components/groupchat/GroupChatView.vue`
- `src/renderer/src/components/groupchat/GroupMessageList.vue`
- `src/renderer/src/components/groupchat/GroupChatInput.vue`
- `src/renderer/src/components/groupchat/GroupMessageItem.vue`
- `src/renderer/src/views/GroupChatPanel.vue`

### 修改

- `src/main/db/database.ts` — 新增两张表的 DDL + migrate()
- `src/shared/events.ts` — 追加 GROUP_CHAT_EVENTS
- `src/main/presenter/index.ts` — 注册 groupChatPresenter
- `src/main/window.ts` — createDetachedWindow + detached 生命周期 IPC
- `src/renderer/src/App.vue` — 新增 groupchat 视图
- `src/renderer/src/components/AppSidebar.vue` — 新增群聊导航入口

---

## Task 1: 数据层 — 建表 + DDL + DAO

**Files:**

- Modify: `src/main/db/database.ts`
- Create: `src/main/db/models/groupChatSessionDao.ts`
- Create: `src/main/db/models/groupChatMessageDao.ts`
- Create: `src/shared/types/groupChat.d.ts`

- [x] **Step 1: 在 DDL 字符串末尾添加两张新表**

在 `database.ts` 的 `DDL` 字符串（第 256 行 `\`;\`` 之前）追加：

```typescript
// 在 DDL 字符串的最后 `; 之前追加（紧接 notes 表后面）
CREATE TABLE IF NOT EXISTS group_chat_sessions (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  participant_agent_ids TEXT NOT NULL,
  moderator_enabled     INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES group_chat_sessions(id) ON DELETE CASCADE,
  order_seq        INTEGER NOT NULL,
  sender_agent_id  TEXT,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  hidden           INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_session ON group_chat_messages(session_id, order_seq);
```

- [x] **Step 2: 在 migrate() 中添加升级迁移**

在 `migrate()` 函数末尾（`}` 之前）追加：

```typescript
// Group chat tables migration (v0.9)
const groupChatTable = instance
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_chat_sessions'")
  .get();
if (!groupChatTable) {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS group_chat_sessions (
      id                    TEXT PRIMARY KEY,
      title                 TEXT NOT NULL,
      participant_agent_ids TEXT NOT NULL,
      moderator_enabled     INTEGER NOT NULL DEFAULT 0,
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_chat_messages (
      id               TEXT PRIMARY KEY,
      session_id       TEXT NOT NULL REFERENCES group_chat_sessions(id) ON DELETE CASCADE,
      order_seq        INTEGER NOT NULL,
      sender_agent_id  TEXT,
      role             TEXT NOT NULL,
      content          TEXT NOT NULL,
      hidden           INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL
    );
  `);
  instance.exec(
    `CREATE INDEX IF NOT EXISTS idx_group_chat_messages_session ON group_chat_messages(session_id, order_seq);`,
  );
}
```

- [x] **Step 3: 创建类型定义文件**

创建 `src/shared/types/groupChat.d.ts`：

```typescript
export interface GroupChatSession {
  id: string;
  title: string;
  participantAgentIds: string[];
  moderatorEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GroupChatMessageRecord {
  id: string;
  sessionId: string;
  orderSeq: number; // Date.now() 时间戳
  senderAgentId: string | null; // null = 用户
  role: "user" | "assistant";
  content: string; // 用户消息为纯文本；Agent 消息为 AssistantMessageBlock[] JSON
  hidden: boolean;
  createdAt: number;
}
```

- [x] **Step 4: 创建 groupChatSessionDao.ts**

创建 `src/main/db/models/groupChatSessionDao.ts`：

```typescript
import type BetterSqlite3 from "better-sqlite3";
import type { GroupChatSession } from "@shared/types/groupChat";

interface SessionRow {
  id: string;
  title: string;
  participant_agent_ids: string;
  moderator_enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToSession(row: SessionRow): GroupChatSession {
  return {
    id: row.id,
    title: row.title,
    participantAgentIds: JSON.parse(row.participant_agent_ids) as string[],
    moderatorEnabled: !!row.moderator_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSession(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    title: string;
    participantAgentIds: string[];
    moderatorEnabled?: boolean;
  },
): GroupChatSession {
  const now = Date.now();
  db.prepare(
    `INSERT INTO group_chat_sessions (id, title, participant_agent_ids, moderator_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.title,
    JSON.stringify(data.participantAgentIds),
    data.moderatorEnabled ? 1 : 0,
    now,
    now,
  );
  return getSessionById(db, data.id)!;
}

export function listSessions(db: BetterSqlite3.Database): GroupChatSession[] {
  const rows = db
    .prepare("SELECT * FROM group_chat_sessions ORDER BY updated_at DESC")
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function getSessionById(
  db: BetterSqlite3.Database,
  id: string,
): GroupChatSession | undefined {
  const row = db.prepare("SELECT * FROM group_chat_sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return row ? rowToSession(row) : undefined;
}

export function updateTitle(db: BetterSqlite3.Database, id: string, title: string): void {
  db.prepare("UPDATE group_chat_sessions SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function touchUpdatedAt(db: BetterSqlite3.Database, id: string): void {
  db.prepare("UPDATE group_chat_sessions SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}

export function deleteSession(db: BetterSqlite3.Database, id: string): void {
  db.prepare("DELETE FROM group_chat_sessions WHERE id = ?").run(id);
}
```

- [x] **Step 5: 创建 groupChatMessageDao.ts**

创建 `src/main/db/models/groupChatMessageDao.ts`：

```typescript
import type BetterSqlite3 from "better-sqlite3";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

interface MessageRow {
  id: string;
  session_id: string;
  order_seq: number;
  sender_agent_id: string | null;
  role: string;
  content: string;
  hidden: number;
  created_at: number;
}

function rowToMessage(row: MessageRow): GroupChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderSeq: row.order_seq,
    senderAgentId: row.sender_agent_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    hidden: !!row.hidden,
    createdAt: row.created_at,
  };
}

export function createMessage(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    sessionId: string;
    senderAgentId?: string | null;
    role: "user" | "assistant";
    content: string;
    hidden?: boolean;
  },
): GroupChatMessageRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO group_chat_messages (id, session_id, order_seq, sender_agent_id, role, content, hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.sessionId,
    now, // order_seq = Date.now() 时间戳
    data.senderAgentId ?? null,
    data.role,
    data.content,
    data.hidden ? 1 : 0,
    now,
  );
  return getMessageById(db, data.id)!;
}

export function listBySession(
  db: BetterSqlite3.Database,
  sessionId: string,
): GroupChatMessageRecord[] {
  const rows = db
    .prepare("SELECT * FROM group_chat_messages WHERE session_id = ? ORDER BY order_seq ASC")
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageById(
  db: BetterSqlite3.Database,
  id: string,
): GroupChatMessageRecord | undefined {
  const row = db.prepare("SELECT * FROM group_chat_messages WHERE id = ?").get(id) as
    | MessageRow
    | undefined;
  return row ? rowToMessage(row) : undefined;
}

export function listVisibleBySession(
  db: BetterSqlite3.Database,
  sessionId: string,
): GroupChatMessageRecord[] {
  const rows = db
    .prepare(
      "SELECT * FROM group_chat_messages WHERE session_id = ? AND hidden = 0 ORDER BY order_seq ASC",
    )
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}
```

- [x] **Step 6: 验证类型检查通过**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

Expected: 无新增错误

- [x] **Step 7: Commit**

```bash
git add src/main/db/database.ts src/main/db/models/groupChatSessionDao.ts src/main/db/models/groupChatMessageDao.ts src/shared/types/groupChat.d.ts
git commit -m "feat(group-chat): add db tables and DAOs"
```

---

## Task 2: 事件 + AgentInvoker + AgentInvokerRegistry

**Files:**

- Modify: `src/shared/events.ts`
- Create: `src/main/presenter/agentChat/agentInvoker.ts`
- Create: `src/main/presenter/agentChat/agentInvokerRegistry.ts`

- [x] **Step 1: 在 events.ts 追加 GROUP_CHAT_EVENTS**

在 `src/shared/events.ts` 末尾追加：

```typescript
export const GROUP_CHAT_EVENTS = {
  MESSAGE_ADDED: "group_chat:message_added", // { sessionId, message: GroupChatMessageRecord }
  AGENT_TYPING: "group_chat:agent_typing", // { sessionId, agentId, isTyping: boolean }
} as const;
```

- [x] **Step 2: 创建 agentInvoker.ts**

创建 `src/main/presenter/agentChat/agentInvoker.ts`：

```typescript
import { z } from "zod";
import { getDb } from "@/db";
import * as groupMsgDao from "@/db/models/groupChatMessageDao";
import * as groupSessionDao from "@/db/models/groupChatSessionDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { eventBus } from "@/eventbus";
import { GROUP_CHAT_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import { buildSystemBlocks } from "./contextBuilder";
import { createLLMClient } from "@/llm";
import type { LLMClient, Tool } from "@/llm";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { AssistantMessageBlock } from "@shared/types/agent";
import type { CoreMessage } from "./contextBuilder";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";

const MAX_STEPS = 128;

interface InvokeParams {
  messages: GroupChatMessageRecord[];
  outputChannel: { type: "group_chat"; sessionId: string };
  hidden?: boolean;
}

export class AgentInvoker {
  // per-sessionId abort controllers
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private agentId: string,
    private gatewayPresenter: GatewayPresenter,
    private toolPresenter: ToolPresenter,
  ) {}

  isRunning(sessionId: string): boolean {
    return this.abortControllers.has(sessionId);
  }

  stop(sessionId: string): void {
    const ctrl = this.abortControllers.get(sessionId);
    if (ctrl) {
      ctrl.abort();
      this.abortControllers.delete(sessionId);
    }
  }

  invoke(params: InvokeParams): void {
    // fire-and-forget
    this._run(params).catch((err) => {
      logger.error("[AgentInvoker] invoke error", { agentId: this.agentId, err: String(err) });
    });
  }

  private buildLLMMessages(
    agentId: string,
    groupMessages: GroupChatMessageRecord[],
    agent: { id: string; name: string; mbti?: any; gender?: any; birthday?: string },
    participantAgentIds: string[],
  ): CoreMessage[] {
    // System blocks: identity + constraints + group chat context
    const systemBlocks = buildSystemBlocks(agent);
    const otherIds = participantAgentIds.filter((id) => id !== agentId);
    const groupContext =
      otherIds.length > 0
        ? `\n你正在参与一个群聊。群聊中的其他参与者 ID 为：[${otherIds.join(", ")}]。消息中以 [agentId]: 开头的内容来自其他参与者。`
        : "";
    if (groupContext) {
      systemBlocks[systemBlocks.length - 1] = {
        ...systemBlocks[systemBlocks.length - 1],
        text: systemBlocks[systemBlocks.length - 1].text + groupContext,
      };
    }

    const messages: CoreMessage[] = [{ role: "system", content: systemBlocks }];

    // Convert group chat messages to LLM messages
    for (const msg of groupMessages) {
      if (msg.hidden) {
        // 主持人注入的隐藏指令：直接作为 user 消息，不加前缀
        messages.push({ role: "user", content: msg.content });
      } else if (msg.senderAgentId === null) {
        // 用户消息
        messages.push({ role: "user", content: msg.content });
      } else if (msg.senderAgentId === agentId) {
        // 本 Agent 之前的回复
        messages.push({ role: "assistant", content: msg.content });
      } else {
        // 其他 Agent 的消息
        messages.push({ role: "user", content: `[${msg.senderAgentId}]: ${msg.content}` });
      }
    }

    return messages;
  }

  private async _run(params: InvokeParams): Promise<void> {
    const { outputChannel, hidden } = params;
    const { sessionId } = outputChannel;

    if (this.abortControllers.has(sessionId)) return; // already running

    const db = getDb();
    const session = groupSessionDao.getSessionById(db, sessionId);
    if (!session) return;

    const agent = agentRegistry.getById(this.agentId);
    if (!agent) return;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    // Notify typing start
    eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
      sessionId,
      agentId: this.agentId,
      isTyping: true,
    });

    const selectResult = this.gatewayPresenter.select(
      (agent.config?.capabilityRequirements ?? ["reasoning"]) as any,
    );
    const capReqs = agent.config?.capabilityRequirements ?? ["reasoning"];
    const firstCap = capReqs[0];
    const capKey = Array.isArray(firstCap) ? firstCap[0] : (firstCap ?? "reasoning");
    const groupName = selectResult.matched[capKey]?.groupName;
    if (!groupName) {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
        sessionId,
        agentId: this.agentId,
        isTyping: false,
      });
      return;
    }

    const client = createLLMClient("anthropic", {
      baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}`,
      apiKey: this.gatewayPresenter.getInternalKey(),
    });

    // Get tools (use enabledTools whitelist)
    const enabledTools = agent.config?.enabledTools ?? [];
    const allTools = await this.toolPresenter.getToolSet(sessionId);
    const filteredTools =
      enabledTools.length > 0
        ? Object.fromEntries(Object.entries(allTools).filter(([k]) => enabledTools.includes(k)))
        : {};
    const tools: Record<string, Tool> = {};
    for (const [name, t] of Object.entries(filteredTools)) {
      const jsonSchema = (t as any).inputSchema
        ? z.toJSONSchema((t as any).inputSchema)
        : { type: "object", properties: {} };
      tools[name] = {
        description: (t as any).description,
        parameters: jsonSchema as Record<string, unknown>,
      };
    }

    const llmMessages = this.buildLLMMessages(
      this.agentId,
      params.messages,
      {
        id: agent.id,
        name: agent.name,
        mbti: agent.mbti as any,
        gender: agent.gender,
        birthday: agent.birthday,
      },
      session.participantAgentIds,
    );

    const blocks: AssistantMessageBlock[] = [];
    let stepCount = 0;

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const stream = client.chat(
          llmMessages,
          tools,
          { model: groupName },
          abortController.signal,
        );

        let textContent = "";
        const toolCalls: Array<{ id: string; name: string; args: string }> = [];
        const pendingTCs = new Map<string, { id: string; name: string; inputJson: string }>();

        for await (const event of stream) {
          if (abortController.signal.aborted) break;
          if (event.type === "text") {
            textContent += event.text;
            const lastContent = blocks.findLast((b) => b.type === "content");
            if (lastContent) {
              lastContent.content = (lastContent.content ?? "") + event.text;
            } else {
              blocks.push({
                type: "content",
                content: event.text,
                status: "loading",
                timestamp: Date.now(),
              });
            }
          } else if (event.type === "tool_call_start") {
            pendingTCs.set(event.id, { id: event.id, name: event.name, inputJson: "" });
          } else if (event.type === "tool_call_delta") {
            const tc = pendingTCs.get(event.id);
            if (tc) tc.inputJson += event.delta;
          } else if (event.type === "tool_call_end") {
            const tc = pendingTCs.get(event.id);
            if (tc) {
              let argsObj: unknown;
              try {
                argsObj = event.input ?? JSON.parse(tc.inputJson || "{}");
              } catch {
                argsObj = {};
              }
              toolCalls.push({ id: tc.id, name: tc.name, args: JSON.stringify(argsObj) });
              blocks.push({
                type: "tool_call",
                id: tc.id,
                content: "",
                status: "loading",
                timestamp: Date.now(),
                tool_call: { id: tc.id, name: tc.name, input: argsObj },
              });
              pendingTCs.delete(event.id);
            }
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }

        if (toolCalls.length === 0) break;

        // Append assistant turn to llmMessages for next iteration
        const assistantParts: any[] = [];
        if (textContent) assistantParts.push({ type: "text", text: textContent });
        for (const tc of toolCalls) {
          assistantParts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.name,
            input: JSON.parse(tc.args),
          });
        }
        llmMessages.push({ role: "assistant", content: assistantParts });

        // Execute tools
        const toolResultParts: any[] = [];
        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;
          try {
            const result = await this.toolPresenter.callTool(
              sessionId,
              tc.name,
              JSON.parse(tc.args),
            );
            const block = blocks.find((b) => b.type === "tool_call" && b.id === tc.id);
            if (block && block.tool_call) {
              block.status = "success";
              block.tool_call.output = result;
            }
            toolResultParts.push({
              type: "tool-result",
              toolCallId: tc.id,
              toolName: tc.name,
              output: {
                type: "text",
                value: typeof result === "string" ? result : JSON.stringify(result),
              },
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const block = blocks.find((b) => b.type === "tool_call" && b.id === tc.id);
            if (block && block.tool_call) {
              block.status = "error";
              block.tool_call.output = `Error: ${errMsg}`;
            }
            toolResultParts.push({
              type: "tool-result",
              toolCallId: tc.id,
              toolName: tc.name,
              output: { type: "text", value: `Error: ${errMsg}` },
            });
          }
        }
        llmMessages.push({ role: "tool", content: toolResultParts });
      }

      // Finalize blocks
      for (const b of blocks) if (b.status === "loading") b.status = "success";

      // Write message to DB
      const msgId = crypto.randomUUID();
      const msg = groupMsgDao.createMessage(db, {
        id: msgId,
        sessionId,
        senderAgentId: this.agentId,
        role: "assistant",
        content: JSON.stringify(blocks),
        hidden: hidden ?? false,
      });

      groupSessionDao.touchUpdatedAt(db, sessionId);

      // Push events
      if (!hidden) {
        eventBus.sendToRenderer(GROUP_CHAT_EVENTS.MESSAGE_ADDED, { sessionId, message: msg });
      }
    } catch (err) {
      logger.error("[AgentInvoker] run error", { agentId: this.agentId, err: String(err) });
    } finally {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
        sessionId,
        agentId: this.agentId,
        isTyping: false,
      });
    }
  }
}
```

- [x] **Step 3: 创建 agentInvokerRegistry.ts**

创建 `src/main/presenter/agentChat/agentInvokerRegistry.ts`：

```typescript
import { AgentInvoker } from "./agentInvoker";
import type { GatewayPresenter } from "../gatewayPresenter";
import type { ToolPresenter } from "../toolPresenter";

export class AgentInvokerRegistry {
  private invokers = new Map<string, AgentInvoker>();
  private gatewayPresenter!: GatewayPresenter;
  private toolPresenter!: ToolPresenter;

  init(gatewayPresenter: GatewayPresenter, toolPresenter: ToolPresenter): void {
    this.gatewayPresenter = gatewayPresenter;
    this.toolPresenter = toolPresenter;
  }

  get(agentId: string): AgentInvoker {
    if (!this.invokers.has(agentId)) {
      this.invokers.set(
        agentId,
        new AgentInvoker(agentId, this.gatewayPresenter, this.toolPresenter),
      );
    }
    return this.invokers.get(agentId)!;
  }

  stopAll(sessionId: string): void {
    for (const invoker of this.invokers.values()) {
      invoker.stop(sessionId);
    }
  }
}

export const agentInvokerRegistry = new AgentInvokerRegistry();
```

- [x] **Step 4: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 5: Commit**

```bash
git add src/shared/events.ts src/main/presenter/agentChat/agentInvoker.ts src/main/presenter/agentChat/agentInvokerRegistry.ts
git commit -m "feat(group-chat): add AgentInvoker and events"
```

---

## Task 3: GroupChatPresenter

**Files:**

- Create: `src/main/presenter/groupChatPresenter.ts`
- Modify: `src/main/presenter/index.ts`

- [x] **Step 1: 创建 GroupChatPresenter**

创建 `src/main/presenter/groupChatPresenter.ts`：

```typescript
import { getDb } from "@/db";
import * as sessionDao from "@/db/models/groupChatSessionDao";
import * as messageDao from "@/db/models/groupChatMessageDao";
import { agentRegistry } from "@/agents/agentRegistry";
import { agentInvokerRegistry } from "./agentChat/agentInvokerRegistry";
import { eventBus } from "@/eventbus";
import { GROUP_CHAT_EVENTS } from "@shared/events";
import { logger } from "@/utils";
import type { GroupChatSession, GroupChatMessageRecord } from "@shared/types/groupChat";
import type { GatewayPresenter } from "./gatewayPresenter";
import type { ToolPresenter } from "./toolPresenter";

export class GroupChatPresenter {
  constructor(
    private gatewayPresenter: GatewayPresenter,
    private toolPresenter: ToolPresenter,
  ) {}

  async createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession> {
    const db = getDb();
    const id = crypto.randomUUID();
    // Default title: 用户、AgentName1、AgentName2
    const agentNames = participantAgentIds.map((aid) => agentRegistry.getById(aid)?.name ?? aid);
    const title = ["用户", ...agentNames].join("、");
    const session = sessionDao.createSession(db, {
      id,
      title,
      participantAgentIds,
      moderatorEnabled: moderatorEnabled ?? false,
    });
    return session;
  }

  async getSessions(): Promise<GroupChatSession[]> {
    const db = getDb();
    return sessionDao.listSessions(db);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = getDb();
    sessionDao.deleteSession(db, sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const db = getDb();
    sessionDao.updateTitle(db, sessionId, title);
  }

  async getMessages(sessionId: string): Promise<GroupChatMessageRecord[]> {
    const db = getDb();
    return messageDao.listVisibleBySession(db, sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string,
    mentionedAgentIds: string[],
  ): Promise<void> {
    const db = getDb();
    const session = sessionDao.getSessionById(db, sessionId);
    if (!session) return;

    // Write user message
    const userMsgId = crypto.randomUUID();
    const userMsg = messageDao.createMessage(db, {
      id: userMsgId,
      sessionId,
      senderAgentId: null,
      role: "user",
      content,
    });
    sessionDao.touchUpdatedAt(db, sessionId);
    eventBus.sendToRenderer(GROUP_CHAT_EVENTS.MESSAGE_ADDED, { sessionId, message: userMsg });

    // Load all messages (including just-created user message) for context
    const allMessages = messageDao.listBySession(db, sessionId);

    // Determine target agents
    let targetAgentIds: string[] = mentionedAgentIds;

    if (targetAgentIds.length === 0 && session.moderatorEnabled) {
      // Use moderator to route
      targetAgentIds = await this.routeWithModerator(session, allMessages, content);
    }

    // Notify typing + invoke each agent
    for (const agentId of targetAgentIds) {
      eventBus.sendToRenderer(GROUP_CHAT_EVENTS.AGENT_TYPING, {
        sessionId,
        agentId,
        isTyping: true,
      });
      const invoker = agentInvokerRegistry.get(agentId);
      invoker.invoke({
        messages: allMessages,
        outputChannel: { type: "group_chat", sessionId },
      });
    }
  }

  async stopAgent(sessionId: string, agentId: string): Promise<void> {
    const invoker = agentInvokerRegistry.get(agentId);
    invoker.stop(sessionId);
  }

  private async routeWithModerator(
    session: GroupChatSession,
    recentMessages: GroupChatMessageRecord[],
    newContent: string,
  ): Promise<string[]> {
    let selectResult = this.gatewayPresenter.select(["chat"] as any);
    let groupName = selectResult.matched["chat"]?.groupName;
    if (!groupName) {
      // fallback to first agent's capability
      return [];
    }

    const agentDescriptions = session.participantAgentIds
      .map((id) => {
        const agent = agentRegistry.getById(id);
        return `- ${id}: ${agent?.name ?? id}${agent?.description ? " — " + agent.description : ""}`;
      })
      .join("\n");

    const recentContext = recentMessages
      .filter((m) => !m.hidden)
      .slice(-20)
      .map((m) => {
        const sender = m.senderAgentId ?? "用户";
        return `${sender}: ${m.content.slice(0, 200)}`;
      })
      .join("\n");

    const prompt = `你是群聊路由助手。根据用户最新消息，判断应该由哪些 Agent 回复。

群聊参与 Agent：
${agentDescriptions}

最近消息：
${recentContext}

用户最新消息：${newContent}

请以 JSON 格式输出：{"targetAgentIds": ["agent-id-1"]}
只输出 JSON，不要其他内容。`;

    try {
      const port = this.gatewayPresenter.getPort();
      const apiKey = this.gatewayPresenter.getInternalKey();
      const resp = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: groupName,
          max_tokens: 100,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as any;
      const textBlock = (data?.content as any[])?.find((b: any) => b.type === "text");
      const json = JSON.parse((textBlock?.text ?? "{}").trim()) as { targetAgentIds?: string[] };
      return (json.targetAgentIds ?? []).filter((id) => session.participantAgentIds.includes(id));
    } catch (err) {
      logger.warn("[GroupChatPresenter] moderator routing failed", { err: String(err) });
      return [];
    }
  }
}
```

- [x] **Step 2: 在 presenter/index.ts 注册 GroupChatPresenter**

在 `src/main/presenter/index.ts` 中：

1. 在 import 区块末尾添加：

```typescript
import { GroupChatPresenter } from "./groupChatPresenter";
import { agentInvokerRegistry } from "./agentChat/agentInvokerRegistry";
```

2. 在 `Presenter` class 中添加字段（在 `devPresenter` 后）：

```typescript
groupChatPresenter: GroupChatPresenter;
```

3. 在 `private constructor()` 末尾添加（在 `agentPresenter` 构造之后）：

```typescript
agentInvokerRegistry.init(this.gatewayPresenter, this.toolPresenter);
this.groupChatPresenter = new GroupChatPresenter(this.gatewayPresenter, this.toolPresenter);
```

4. 在 `DISPATCHABLE` Set 中添加：

```typescript
"groupChatPresenter",
```

- [x] **Step 3: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 4: Commit**

```bash
git add src/main/presenter/groupChatPresenter.ts src/main/presenter/index.ts
git commit -m "feat(group-chat): add GroupChatPresenter and register"
```

---

## Task 4: 独立窗口 IPC

**Files:**

- Modify: `src/main/window.ts`
- Modify: `src/main/index.ts` (检查 index.ts 位置)

- [x] **Step 1: 修改 window.ts 新增 createDetachedWindow**

在 `src/main/window.ts` 中追加：

```typescript
import { ipcMain } from "electron";

// Map: sessionId -> BrowserWindow
const detachedWindows = new Map<string, BrowserWindow>();

export function createDetachedWindow(sessionId: string): BrowserWindow {
  // 如果已存在，focus 它
  const existing = detachedWindows.get(sessionId);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    title: "群聊",
  });

  const query = `detached=1&sessionId=${encodeURIComponent(sessionId)}`;
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${query}`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { detached: "1", sessionId },
    });
  }

  detachedWindows.set(sessionId, win);

  win.on("closed", () => {
    detachedWindows.delete(sessionId);
    // Notify main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("detached_window_closed", { sessionId });
    }
  });

  return win;
}

// IPC handler: open detached window
ipcMain.handle("group_chat:open_detached", (_event, sessionId: string) => {
  createDetachedWindow(sessionId);
});

// IPC handler: focus detached window
ipcMain.handle("group_chat:focus_detached", (_event, sessionId: string) => {
  const win = detachedWindows.get(sessionId);
  if (win && !win.isDestroyed()) win.focus();
});

export function isSessionDetached(sessionId: string): boolean {
  const win = detachedWindows.get(sessionId);
  return !!win && !win.isDestroyed();
}
```

- [x] **Step 2: 在 src/main/index.ts 导入 window.ts 的 IPC handlers**

检查 `src/main/index.ts` 是否已导入 `window.ts`：

```bash
grep -n "window" /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime/src/main/index.ts | head -10
```

确保 `createMainWindow` 被导入。IPC handlers 在 `createDetachedWindow` 函数调用时自动注册。

- [x] **Step 3: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 4: Commit**

```bash
git add src/main/window.ts
git commit -m "feat(group-chat): add detached window IPC"
```

---

## Task 5: 前端 Stores

**Files:**

- Create: `src/renderer/src/stores/groupChatSession.ts`
- Create: `src/renderer/src/stores/groupChat.ts`
- Create: `src/renderer/src/stores/groupChatIpc.ts`

- [x] **Step 1: 创建 groupChatSession.ts**

创建 `src/renderer/src/stores/groupChatSession.ts`：

```typescript
import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { GroupChatSession } from "@shared/types/groupChat";

export const useGroupChatSessionStore = defineStore("groupChatSession", () => {
  const groupChatPresenter = usePresenter("groupChatPresenter");

  const sessions = ref<GroupChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  const detachedSessionIds = ref<Set<string>>(new Set());

  async function fetchSessions() {
    const result = await groupChatPresenter.getSessions();
    sessions.value = (Array.isArray(result) ? result : []) as GroupChatSession[];
  }

  function setActiveSession(id: string | null) {
    activeSessionId.value = id;
  }

  async function createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession> {
    const session = (await groupChatPresenter.createSession(
      participantAgentIds,
      moderatorEnabled,
    )) as GroupChatSession;
    await fetchSessions();
    activeSessionId.value = session.id;
    return session;
  }

  async function deleteSession(id: string) {
    await groupChatPresenter.deleteSession(id);
    if (activeSessionId.value === id) activeSessionId.value = null;
    await fetchSessions();
  }

  async function updateTitle(id: string, title: string) {
    await groupChatPresenter.updateSessionTitle(id, title);
    await fetchSessions();
  }

  function markDetached(sessionId: string) {
    detachedSessionIds.value = new Set([...detachedSessionIds.value, sessionId]);
  }

  function unmarkDetached(sessionId: string) {
    const next = new Set(detachedSessionIds.value);
    next.delete(sessionId);
    detachedSessionIds.value = next;
  }

  function isDetached(sessionId: string): boolean {
    return detachedSessionIds.value.has(sessionId);
  }

  return {
    sessions,
    activeSessionId,
    detachedSessionIds,
    fetchSessions,
    setActiveSession,
    createSession,
    deleteSession,
    updateTitle,
    markDetached,
    unmarkDetached,
    isDetached,
  };
});
```

- [x] **Step 2: 创建 groupChat.ts**

创建 `src/renderer/src/stores/groupChat.ts`：

```typescript
import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

export const useGroupChatStore = defineStore("groupChat", () => {
  const groupChatPresenter = usePresenter("groupChatPresenter");

  const messages = ref<GroupChatMessageRecord[]>([]);
  const typingAgentIds = ref<Set<string>>(new Set());
  const error = ref<string | null>(null);

  async function fetchMessages(sessionId: string) {
    const result = await groupChatPresenter.getMessages(sessionId);
    messages.value = (Array.isArray(result) ? result : []) as GroupChatMessageRecord[];
    error.value = null;
  }

  async function sendMessage(sessionId: string, content: string, mentionedAgentIds: string[]) {
    error.value = null;
    try {
      await groupChatPresenter.sendMessage(sessionId, content, mentionedAgentIds);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  async function stopAgent(sessionId: string, agentId: string) {
    await groupChatPresenter.stopAgent(sessionId, agentId);
  }

  function addMessage(msg: GroupChatMessageRecord) {
    messages.value = [...messages.value, msg];
  }

  function setTyping(agentId: string, isTyping: boolean) {
    const next = new Set(typingAgentIds.value);
    if (isTyping) next.add(agentId);
    else next.delete(agentId);
    typingAgentIds.value = next;
  }

  function clearMessages() {
    messages.value = [];
    typingAgentIds.value = new Set();
    error.value = null;
  }

  return {
    messages,
    typingAgentIds,
    error,
    fetchMessages,
    sendMessage,
    stopAgent,
    addMessage,
    setTyping,
    clearMessages,
  };
});
```

- [x] **Step 3: 创建 groupChatIpc.ts**

创建 `src/renderer/src/stores/groupChatIpc.ts`：

```typescript
import { GROUP_CHAT_EVENTS } from "@shared/events";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { useGroupChatStore } from "./groupChat";
import type { useGroupChatSessionStore } from "./groupChatSession";

interface MessageAddedData {
  sessionId: string;
  message: GroupChatMessageRecord;
}

interface AgentTypingData {
  sessionId: string;
  agentId: string;
  isTyping: boolean;
}

export function setupGroupChatIpc(
  chatStore: ReturnType<typeof useGroupChatStore>,
  sessionStore: ReturnType<typeof useGroupChatSessionStore>,
  activeSessionId: () => string | null,
): () => void {
  const unsubs: Array<() => void> = [];

  const unsubMessage = window.electron.ipcRenderer.on(
    GROUP_CHAT_EVENTS.MESSAGE_ADDED,
    (data: unknown) => {
      const d = data as MessageAddedData;
      if (d.sessionId === activeSessionId()) {
        chatStore.addMessage(d.message);
      }
    },
  );
  unsubs.push(unsubMessage);

  const unsubTyping = window.electron.ipcRenderer.on(
    GROUP_CHAT_EVENTS.AGENT_TYPING,
    (data: unknown) => {
      const d = data as AgentTypingData;
      if (d.sessionId === activeSessionId()) {
        chatStore.setTyping(d.agentId, d.isTyping);
      }
    },
  );
  unsubs.push(unsubTyping);

  const unsubDetachedClosed = window.electron.ipcRenderer.on(
    "detached_window_closed",
    (data: unknown) => {
      const d = data as { sessionId: string };
      sessionStore.unmarkDetached(d.sessionId);
      // Refresh messages if this session is now active
      if (d.sessionId === activeSessionId()) {
        chatStore.fetchMessages(d.sessionId);
      }
    },
  );
  unsubs.push(unsubDetachedClosed);

  return () => unsubs.forEach((fn) => fn());
}
```

- [x] **Step 4: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/stores/groupChatSession.ts src/renderer/src/stores/groupChat.ts src/renderer/src/stores/groupChatIpc.ts
git commit -m "feat(group-chat): add frontend stores and IPC"
```

---

## Task 6: 前端组件 — GroupMessageItem + GroupMessageList

**Files:**

- Create: `src/renderer/src/components/groupchat/GroupMessageItem.vue`
- Create: `src/renderer/src/components/groupchat/GroupMessageList.vue`

- [x] **Step 1: 创建 GroupMessageItem.vue**

创建 `src/renderer/src/components/groupchat/GroupMessageItem.vue`：

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useAgentStore } from "@/stores/agent";
import AgentAvatar from "../chat/AgentAvatar.vue";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";
import type { AssistantMessageBlock } from "@shared/types/agent";

const props = defineProps<{
  message: GroupChatMessageRecord;
  typingAgentIds?: Set<string>;
}>();

const agentStore = useAgentStore();

const senderAgent = computed(() => {
  if (!props.message.senderAgentId) return null;
  return agentStore.agents.find((a) => a.id === props.message.senderAgentId) ?? null;
});

const isUser = computed(() => props.message.senderAgentId === null);

// Parse assistant blocks and extract text content for display
const displayContent = computed(() => {
  if (isUser.value) return props.message.content;
  try {
    const blocks = JSON.parse(props.message.content) as AssistantMessageBlock[];
    return blocks
      .filter((b) => b.type === "content" && b.content)
      .map((b) => b.content ?? "")
      .join("");
  } catch {
    return props.message.content;
  }
});

// Typing agents that belong to the participant list, shown under user messages
const typingAgentNames = computed(() => {
  if (!isUser.value || !props.typingAgentIds || props.typingAgentIds.size === 0) return [];
  return [...props.typingAgentIds].map((id) => {
    const agent = agentStore.agents.find((a) => a.id === id);
    return agent?.name ?? id;
  });
});

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <!-- User message -->
  <div v-if="isUser" class="flex flex-col items-end gap-1 px-4 py-2">
    <div class="flex items-end gap-2">
      <div class="max-w-[70%] rounded-2xl rounded-br-sm bg-violet-600 px-3 py-2 text-sm text-white">
        {{ displayContent }}
      </div>
    </div>
    <div class="text-[10px] text-muted-foreground">{{ formatTime(message.createdAt) }}</div>
    <!-- Typing indicator under user message -->
    <div v-if="typingAgentNames.length > 0" class="text-[11px] text-muted-foreground">
      {{ typingAgentNames.join(" · ") }} 正在思考...
    </div>
  </div>

  <!-- Agent message -->
  <div v-else class="flex items-start gap-2 px-4 py-2">
    <AgentAvatar :avatar="senderAgent?.avatar ?? undefined" size="sm" />
    <div class="flex max-w-[70%] flex-col gap-1">
      <div class="text-xs text-muted-foreground">
        {{ senderAgent?.name ?? message.senderAgentId }}
      </div>
      <div class="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-foreground">
        {{ displayContent }}
      </div>
      <div class="text-[10px] text-muted-foreground">{{ formatTime(message.createdAt) }}</div>
    </div>
  </div>
</template>
```

- [x] **Step 2: 创建 GroupMessageList.vue**

创建 `src/renderer/src/components/groupchat/GroupMessageList.vue`：

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import GroupMessageItem from "./GroupMessageItem.vue";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

const props = defineProps<{
  messages: GroupChatMessageRecord[];
  typingAgentIds: Set<string>;
}>();

const listRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight;
    }
  });
}

watch(() => props.messages.length, scrollToBottom);
watch(() => props.typingAgentIds.size, scrollToBottom);
</script>

<template>
  <div ref="listRef" class="flex flex-1 flex-col overflow-y-auto py-2">
    <GroupMessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
      :typing-agent-ids="msg === messages[messages.length - 1] ? typingAgentIds : undefined"
    />
    <div
      v-if="messages.length === 0"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      发送消息开始群聊
    </div>
  </div>
</template>
```

- [x] **Step 3: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/components/groupchat/GroupMessageItem.vue src/renderer/src/components/groupchat/GroupMessageList.vue
git commit -m "feat(group-chat): add GroupMessageItem and GroupMessageList"
```

---

## Task 7: 前端组件 — GroupChatInput

**Files:**

- Create: `src/renderer/src/components/groupchat/GroupChatInput.vue`

- [x] **Step 1: 创建 GroupChatInput.vue**

创建 `src/renderer/src/components/groupchat/GroupChatInput.vue`：

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import type { Agent } from "@shared/types/agent";

const props = defineProps<{
  participantAgentIds: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string, mentionedAgentIds: string[]];
}>();

const agentStore = useAgentStore();
const inputRef = ref<HTMLTextAreaElement | null>(null);
const inputValue = ref("");
const showMentionDropdown = ref(false);
const mentionQuery = ref("");
const mentionStartIndex = ref(-1);

// Agents available for @mention
const participantAgents = computed(
  () =>
    props.participantAgentIds
      .map((id) => agentStore.agents.find((a) => a.id === id))
      .filter(Boolean) as Agent[],
);

const filteredMentionAgents = computed(() =>
  mentionQuery.value
    ? participantAgents.value.filter((a) =>
        a.name.toLowerCase().includes(mentionQuery.value.toLowerCase()),
      )
    : participantAgents.value,
);

function onInput(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  inputValue.value = el.value;
  const cursorPos = el.selectionStart ?? 0;
  const textBefore = el.value.slice(0, cursorPos);
  const atIndex = textBefore.lastIndexOf("@");

  if (atIndex !== -1 && (atIndex === 0 || textBefore[atIndex - 1] === " ")) {
    const query = textBefore.slice(atIndex + 1);
    if (!query.includes(" ")) {
      mentionQuery.value = query;
      mentionStartIndex.value = atIndex;
      showMentionDropdown.value = true;
      return;
    }
  }
  showMentionDropdown.value = false;
}

function selectMention(agent: Agent) {
  if (mentionStartIndex.value === -1) return;
  const before = inputValue.value.slice(0, mentionStartIndex.value);
  const after = inputValue.value.slice(mentionStartIndex.value + 1 + mentionQuery.value.length);
  inputValue.value = `${before}@${agent.name} ${after}`;
  showMentionDropdown.value = false;
  mentionStartIndex.value = -1;
  inputRef.value?.focus();
}

function parseMentions(text: string): string[] {
  const regex = /@(\S+)/g;
  const agentIds: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].replace(/,$/, "");
    const agent = participantAgents.value.find((a) => a.name === name);
    if (agent) agentIds.push(agent.id);
  }
  return [...new Set(agentIds)];
}

function onSend() {
  const content = inputValue.value.trim();
  if (!content) return;
  const mentionedAgentIds = parseMentions(content);
  emit("send", content, mentionedAgentIds);
  inputValue.value = "";
  showMentionDropdown.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
  if (e.key === "Escape") showMentionDropdown.value = false;
}
</script>

<template>
  <div class="relative border-t border-border p-3">
    <!-- @ mention dropdown -->
    <div
      v-if="showMentionDropdown && filteredMentionAgents.length > 0"
      class="absolute bottom-full left-3 right-3 mb-1 rounded-md border border-border bg-neutral-900 py-1 shadow-lg"
    >
      <button
        v-for="agent in filteredMentionAgents"
        :key="agent.id"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        @mousedown.prevent="selectMention(agent)"
      >
        <span class="font-medium">{{ agent.name }}</span>
        <span v-if="agent.description" class="truncate text-xs text-muted-foreground">
          {{ agent.description }}
        </span>
      </button>
    </div>

    <div class="flex items-end gap-2">
      <textarea
        ref="inputRef"
        v-model="inputValue"
        :disabled="disabled"
        placeholder="输入消息，@ 提及 Agent..."
        rows="1"
        class="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
        style="field-sizing: content"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        :disabled="disabled || !inputValue.trim()"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
        @click="onSend"
      >
        <Icon icon="lucide:send" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
```

- [x] **Step 2: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/components/groupchat/GroupChatInput.vue
git commit -m "feat(group-chat): add GroupChatInput with @ mention"
```

---

## Task 8: 前端组件 — GroupChatView + GroupSessionList + NewGroupThread

**Files:**

- Create: `src/renderer/src/components/groupchat/GroupChatView.vue`
- Create: `src/renderer/src/components/groupchat/GroupSessionList.vue`
- Create: `src/renderer/src/components/groupchat/NewGroupThread.vue`

- [x] **Step 1: 创建 GroupChatView.vue**

创建 `src/renderer/src/components/groupchat/GroupChatView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from "vue";
import GroupMessageList from "./GroupMessageList.vue";
import GroupChatInput from "./GroupChatInput.vue";
import { useGroupChatStore } from "@/stores/groupChat";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";

const chatStore = useGroupChatStore();
const sessionStore = useGroupChatSessionStore();

const session = computed(
  () => sessionStore.sessions.find((s) => s.id === sessionStore.activeSessionId) ?? null,
);

const participantAgentIds = computed(() => session.value?.participantAgentIds ?? []);

const isEditingTitle = defineModel<boolean>("editingTitle", { default: false });
const titleInput = defineModel<string>("titleInput", { default: "" });

async function onSend(content: string, mentionedAgentIds: string[]) {
  if (!sessionStore.activeSessionId) return;
  await chatStore.sendMessage(sessionStore.activeSessionId, content, mentionedAgentIds);
}

async function onTitleBlur() {
  if (session.value && titleInput.value.trim() && titleInput.value !== session.value.title) {
    await sessionStore.updateTitle(session.value.id, titleInput.value.trim());
  }
  isEditingTitle.value = false;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Top bar -->
    <div class="flex items-center gap-2 border-b border-border px-4 py-2">
      <div v-if="isEditingTitle" class="flex-1">
        <input
          v-model="titleInput"
          class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
          @blur="onTitleBlur"
          @keydown.enter="onTitleBlur"
          @keydown.escape="isEditingTitle = false"
        />
      </div>
      <div
        v-else
        class="flex-1 cursor-pointer truncate text-sm font-medium text-foreground"
        @dblclick="
          () => {
            titleInput = session?.title ?? '';
            isEditingTitle = true;
          }
        "
      >
        {{ session?.title ?? "群聊" }}
      </div>
    </div>

    <!-- Messages -->
    <GroupMessageList :messages="chatStore.messages" :typing-agent-ids="chatStore.typingAgentIds" />

    <!-- Input -->
    <GroupChatInput :participant-agent-ids="participantAgentIds" @send="onSend" />
  </div>
</template>
```

- [x] **Step 2: 创建 GroupSessionList.vue**

创建 `src/renderer/src/components/groupchat/GroupSessionList.vue`：

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";

const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();

const emit = defineEmits<{
  select: [id: string];
  newSession: [];
  openDetached: [id: string];
}>();

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

// Rename
const renaming = ref<string | null>(null);
const renameInput = ref("");

function onRenameStart(sessionId: string) {
  const session = sessionStore.sessions.find((s) => s.id === sessionId);
  renaming.value = sessionId;
  renameInput.value = session?.title ?? "";
}

async function onRenameConfirm() {
  if (renaming.value && renameInput.value.trim()) {
    await sessionStore.updateTitle(renaming.value, renameInput.value.trim());
  }
  renaming.value = null;
}

// Context menu
const contextMenuSessionId = ref<string | null>(null);
const contextMenuPos = ref({ x: 0, y: 0 });
const showContextMenu = ref(false);

function onContextMenu(e: MouseEvent, sessionId: string) {
  e.preventDefault();
  contextMenuSessionId.value = sessionId;
  contextMenuPos.value = {
    x: Math.min(e.clientX, window.innerWidth - 160),
    y: Math.min(e.clientY, window.innerHeight - 100),
  };
  showContextMenu.value = true;
}

function closeContextMenu() {
  showContextMenu.value = false;
  contextMenuSessionId.value = null;
}

async function onDelete() {
  if (contextMenuSessionId.value) {
    await sessionStore.deleteSession(contextMenuSessionId.value);
    chatStore.clearMessages();
  }
  closeContextMenu();
}

function onNewSession() {
  sessionStore.setActiveSession(null);
  chatStore.clearMessages();
  emit("newSession");
}

function onSessionClick(sessionId: string) {
  if (sessionStore.isDetached(sessionId)) {
    window.electron.ipcRenderer.invoke("group_chat:focus_detached", sessionId);
    return;
  }
  sessionStore.setActiveSession(sessionId);
  chatStore.fetchMessages(sessionId);
  emit("select", sessionId);
}

function onSessionDblclick(sessionId: string) {
  sessionStore.markDetached(sessionId);
  window.electron.ipcRenderer.invoke("group_chat:open_detached", sessionId);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <span class="text-sm font-medium text-foreground">群聊</span>
      <button
        class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="新建群聊"
        @click="onNewSession"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-1">
      <div
        v-for="session in sessionStore.sessions"
        :key="session.id"
        :class="[
          'mb-0.5 cursor-pointer rounded-md px-2.5 py-2 transition-colors',
          session.id === sessionStore.activeSessionId && !sessionStore.isDetached(session.id)
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        ]"
        @click="onSessionClick(session.id)"
        @dblclick="onSessionDblclick(session.id)"
        @contextmenu="onContextMenu($event, session.id)"
      >
        <input
          v-if="renaming === session.id"
          v-model="renameInput"
          class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
          @blur="onRenameConfirm"
          @keydown.enter="onRenameConfirm"
          @keydown.escape="renaming = null"
          @click.stop
        />
        <template v-else>
          <div class="flex items-center gap-1">
            <Icon
              v-if="sessionStore.isDetached(session.id)"
              icon="lucide:external-link"
              class="h-3 w-3 text-violet-400"
            />
            <div class="truncate text-sm">{{ session.title }}</div>
          </div>
          <div class="mt-0.5 text-[10px] text-muted-foreground">
            {{ formatTime(session.updatedAt) }}
          </div>
        </template>
      </div>

      <div
        v-if="sessionStore.sessions.length === 0"
        class="py-4 text-center text-xs text-muted-foreground"
      >
        暂无群聊
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="fixed z-50 min-w-[140px] rounded-md border border-border bg-neutral-900 py-1 shadow-lg"
        :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        @click.stop
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          @click="
            () => {
              onRenameStart(contextMenuSessionId!);
              closeContextMenu();
            }
          "
        >
          <Icon icon="lucide:pencil" class="h-3 w-3" />
          重命名
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-muted"
          @click="onDelete"
        >
          <Icon icon="lucide:trash-2" class="h-3 w-3" />
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>
```

- [x] **Step 3: 创建 NewGroupThread.vue**

创建 `src/renderer/src/components/groupchat/NewGroupThread.vue`：

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import AgentAvatar from "../chat/AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";
import { getMBTIColor } from "@shared/constants/mbti";
import type { Agent } from "@shared/types/agent";

const agentStore = useAgentStore();
const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();

const selectedAgentIds = ref<string[]>([]);
const moderatorEnabled = ref(false);
const inputValue = ref("");

const canCreate = computed(() => selectedAgentIds.value.length >= 2 && inputValue.value.trim());

function toggleAgent(agentId: string) {
  const idx = selectedAgentIds.value.indexOf(agentId);
  if (idx === -1) {
    selectedAgentIds.value = [...selectedAgentIds.value, agentId];
  } else {
    selectedAgentIds.value = selectedAgentIds.value.filter((id) => id !== agentId);
  }
}

function agentColor(agent: Agent): string {
  return getMBTIColor(agent.mbti ?? "INTJ");
}

async function onSend() {
  if (!canCreate.value) return;
  const content = inputValue.value.trim();
  const session = await sessionStore.createSession(selectedAgentIds.value, moderatorEnabled.value);
  await chatStore.sendMessage(session.id, content, []);
  inputValue.value = "";
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <h2 class="mb-1 text-lg font-medium text-foreground">创建群聊</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择 2 个或更多 Agent</p>

      <!-- Agent cards -->
      <div class="mb-6 flex flex-wrap justify-center gap-3">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :style="{
            '--agent-color': agentColor(agent),
            borderColor: selectedAgentIds.includes(agent.id) ? agentColor(agent) : undefined,
            backgroundColor: selectedAgentIds.includes(agent.id)
              ? agentColor(agent) + '1a'
              : undefined,
          }"
          :class="[
            'flex w-36 flex-col items-center gap-2 rounded-xl border px-3 py-3 text-sm transition-colors',
            selectedAgentIds.includes(agent.id)
              ? 'text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="toggleAgent(agent.id)"
        >
          <AgentAvatar :avatar="agent.avatar" size="md" />
          <span class="font-medium text-foreground">{{ agent.name }}</span>
        </button>
      </div>

      <!-- Moderator toggle -->
      <label class="mb-6 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input v-model="moderatorEnabled" type="checkbox" class="rounded" />
        <span>启用智能路由（主持人）</span>
        <span class="text-xs text-muted-foreground">— 无需 @ 时自动判断回复者</span>
      </label>

      <!-- Hint -->
      <p v-if="selectedAgentIds.length < 2" class="text-xs text-muted-foreground">
        已选 {{ selectedAgentIds.length }} 个，至少选 2 个
      </p>
    </div>

    <!-- Input -->
    <div class="border-t border-border p-3">
      <div class="flex items-end gap-2">
        <textarea
          v-model="inputValue"
          :disabled="selectedAgentIds.length < 2"
          placeholder="输入第一条消息，发送后创建群聊..."
          rows="1"
          class="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
          style="field-sizing: content"
          @keydown="onKeydown"
        />
        <button
          :disabled="!canCreate"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
          @click="onSend"
        >
          <Icon icon="lucide:send" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 4: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/components/groupchat/
git commit -m "feat(group-chat): add GroupChatView, GroupSessionList, NewGroupThread"
```

---

## Task 9: GroupChatPanel 视图 + 导航入口

**Files:**

- Create: `src/renderer/src/views/GroupChatPanel.vue`
- Modify: `src/renderer/src/App.vue`
- Modify: `src/renderer/src/components/AppSidebar.vue`

- [x] **Step 1: 创建 GroupChatPanel.vue**

创建 `src/renderer/src/views/GroupChatPanel.vue`：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import GroupSessionList from "../components/groupchat/GroupSessionList.vue";
import NewGroupThread from "../components/groupchat/NewGroupThread.vue";
import GroupChatView from "../components/groupchat/GroupChatView.vue";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";
import { useAgentStore } from "@/stores/agent";
import { setupGroupChatIpc } from "@/stores/groupChatIpc";
import { AGENT_EVENTS } from "@shared/events";

const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();
const agentStore = useAgentStore();

const cleanupGroupChatIpc = setupGroupChatIpc(
  chatStore,
  sessionStore,
  () => sessionStore.activeSessionId,
);

const cleanupAgentChanged = window.electron.ipcRenderer.on(AGENT_EVENTS.CHANGED, () => {
  agentStore.fetchAgents();
});

onMounted(async () => {
  await Promise.all([agentStore.fetchAgents(), sessionStore.fetchSessions()]);
});

onUnmounted(() => {
  cleanupGroupChatIpc();
  cleanupAgentChanged();
});
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <GroupSessionList />
    </div>

    <!-- Right: Content -->
    <div class="min-w-0 flex-1 overflow-hidden">
      <NewGroupThread v-if="!sessionStore.activeSessionId" />
      <GroupChatView v-else />
    </div>
  </div>
</template>
```

- [x] **Step 2: 修改 App.vue 添加 groupchat 视图**

在 `src/renderer/src/App.vue` 中：

1. 添加 import：

```typescript
import GroupChatPanel from "./views/GroupChatPanel.vue";
```

2. 在 `viewComponents` 对象中添加：

```typescript
groupchat: markRaw(GroupChatPanel),
```

3. 更新 `activeView` 类型：

```typescript
const activeView = ref<"chatroom" | "schedule" | "gateway" | "evolab" | "agents" | "groupchat">(
  "chatroom",
);
```

- [x] **Step 3: 修改 AppSidebar.vue 添加群聊入口**

在 `src/renderer/src/components/AppSidebar.vue` 中：

1. 在 `defineProps` 类型中添加 `'groupchat'`：

```typescript
defineProps<{
  activeView: "chatroom" | "schedule" | "gateway" | "evolab" | "agents" | "groupchat";
}>();
defineEmits<{
  "update:activeView": [
    view: "chatroom" | "schedule" | "gateway" | "evolab" | "agents" | "groupchat",
  ];
}>();
```

2. 在 chatroom 按钮后面添加群聊按钮：

```html
<button
  data-testid="sidebar-groupchat"
  :class="[
    'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
    activeView === 'groupchat'
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  ]"
  title="群聊"
  @click="$emit('update:activeView', 'groupchat')"
>
  <Icon icon="lucide:users" class="h-5 w-5" />
</button>
```

- [x] **Step 4: 验证类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/views/GroupChatPanel.vue src/renderer/src/App.vue src/renderer/src/components/AppSidebar.vue
git commit -m "feat(group-chat): add GroupChatPanel view and sidebar entry"
```

---

## Task 10: 独立窗口渲染端 + Lint + Format

**Files:**

- Modify: `src/renderer/src/main.ts` 或 `src/renderer/src/App.vue`（读取 URL 参数检测 detached 模式）

- [x] **Step 1: 检查 renderer 入口**

```bash
cat /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime/src/renderer/src/main.ts
```

- [x] **Step 2: 在 App.vue 中处理 detached 模式**

在 `App.vue` 的 `onMounted` 中读取 URL 参数：

```typescript
// 在 onMounted 中
const urlParams = new URLSearchParams(window.location.search);
const isDetached = urlParams.get("detached") === "1";
const detachedSessionId = urlParams.get("sessionId");

if (isDetached && detachedSessionId) {
  // 独立窗口模式：直接切换到群聊视图并加载指定 session
  activeView.value = "groupchat";
  needsOnboarding.value = false;
  // 等待 groupchat store 初始化后设置 activeSessionId
  // 由 GroupChatPanel onMounted 处理 fetchSessions 后再 setActiveSession
  // 通过 provide/inject 或 URL 参数传递 sessionId
}
```

实际上对于独立窗口，最简单的方案是 GroupChatPanel 在 `onMounted` 时检查 URL 参数并自动激活对应 session：

在 `GroupChatPanel.vue` 的 `onMounted` 中追加：

```typescript
// Check if this is a detached window
const urlParams = new URLSearchParams(window.location.search);
const detachedSessionId = urlParams.get("sessionId");
if (urlParams.get("detached") === "1" && detachedSessionId) {
  sessionStore.setActiveSession(detachedSessionId);
  chatStore.fetchMessages(detachedSessionId);
}
```

同时在 `App.vue` 检测到 detached 模式时跳过 onboarding 并切换视图：

在 `App.vue` 的 `onMounted` 中，在 `const onboarded = await configPresenter.get('app.onboarded')` 之前检查：

```typescript
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("detached") === "1") {
  activeView.value = "groupchat";
  needsOnboarding.value = false;
  return;
}
```

- [x] **Step 3: 运行 format + lint**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run format && pnpm run lint
```

Expected: 无错误（可能有 warning，可以忽略）

- [x] **Step 4: 最终类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(group-chat): detached window support + format/lint"
```

---

## 自审记录

### Spec 覆盖检查

| Spec 要求                                              | 对应 Task                        |
| ------------------------------------------------------ | -------------------------------- |
| 独立两张表 group_chat_sessions / group_chat_messages   | Task 1                           |
| AgentInvoker fire-and-forget                           | Task 2                           |
| 上下文转换规则（其他Agent→user role，[agentId]: 前缀） | Task 2 Step 2                    |
| GROUP_CHAT_EVENTS 事件                                 | Task 2 Step 1                    |
| GroupChatPresenter sendMessage 流程                    | Task 3                           |
| 主持人开关 moderator_enabled 路由                      | Task 3 Step 1 routeWithModerator |
| 会话默认标题 用户、AgentName1...                       | Task 3 Step 1 createSession      |
| 独立窗口 createDetachedWindow                          | Task 4                           |
| detached_window_closed IPC                             | Task 4 + Task 5                  |
| typing 状态行挂在用户消息下方                          | Task 6 GroupMessageItem          |
| @ 提及补全                                             | Task 7 GroupChatInput            |
| 双击开独立窗口                                         | Task 8 GroupSessionList          |
| 群聊导航入口                                           | Task 9                           |
| detached 模式自动加载 session                          | Task 10                          |

### 类型一致性确认

- `GroupChatSession.participantAgentIds` 在 DAO、Presenter、Store 中均为 `string[]`
- `GroupChatMessageRecord.senderAgentId` 在所有层均为 `string | null`
- `GROUP_CHAT_EVENTS` 事件名在 IPC 发送端（主进程）和接收端（渲染进程）均引用同一常量
- `AgentInvoker` 中 `groupMsgDao.createMessage` 调用参数与 DAO 函数签名一致
