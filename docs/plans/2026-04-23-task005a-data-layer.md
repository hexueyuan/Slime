# TASK-005a: 数据层 + 基础对话 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立聊天功能的数据层基础设施——类型定义、IPC 事件、Presenter（AgentPresenter 对接 Vercel AI SDK + SessionPresenter）、JSON 持久化、渲染进程 Store。

**Architecture:** Block-based 消息模型（参考 deepchat），主进程通过 Vercel AI SDK 调用 LLM，流式 blocks 通过 EventBus 推送到渲染进程。会话/消息数据以 JSON 文件最简持久化。

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`), Pinia, Electron IPC

---

### Task 1: 安装依赖

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 安装 Vercel AI SDK**

```bash
pnpm add ai @ai-sdk/openai @ai-sdk/anthropic
```

- [ ] **Step 2: 验证安装**

Run: `pnpm ls ai @ai-sdk/openai @ai-sdk/anthropic`
Expected: 三个包均已安装，版本号显示正常

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vercel ai sdk deps"
```

---

### Task 2: 聊天类型定义

**Files:**

- Create: `src/shared/types/chat.d.ts`
- Test: 无独立测试（类型文件，由 typecheck 验证）

- [ ] **Step 1: 创建 chat 类型定义文件**

```typescript
// src/shared/types/chat.d.ts

export type BlockType = "content" | "reasoning_content" | "tool_call" | "error" | "image";
export type BlockStatus = "success" | "loading" | "error" | "cancel";

export interface AssistantMessageBlock {
  type: BlockType;
  id?: string;
  content?: string;
  status: BlockStatus;
  timestamp: number;
  tool_call?: { name: string; params: string; response?: string };
  image_data?: { data: string; mimeType: string };
  reasoning_time?: { start: number; end: number };
}

export interface MessageFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface UserMessageContent {
  text: string;
  files: MessageFile[];
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string; // JSON serialized UserMessageContent | AssistantMessageBlock[]
  status: "sent" | "pending" | "error";
  createdAt: number;
  updatedAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS（无新增错误）

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/chat.d.ts
git commit -m "feat: add chat type definitions"
```

---

### Task 3: 扩展 IPC 事件常量

**Files:**

- Modify: `src/shared/events.ts`
- Test: 无独立测试（常量定义）

- [ ] **Step 1: 添加 STREAM_EVENTS 和 SESSION_EVENTS**

在 `src/shared/events.ts` 末尾追加：

```typescript
export const STREAM_EVENTS = {
  RESPONSE: "stream:response",
  END: "stream:end",
  ERROR: "stream:error",
} as const;

export const SESSION_EVENTS = {
  LIST_UPDATED: "session:list-updated",
  ACTIVATED: "session:activated",
} as const;
```

- [ ] **Step 2: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/events.ts
git commit -m "feat: add stream and session event constants"
```

---

### Task 4: Presenter 接口更新

**Files:**

- Modify: `src/shared/types/presenters/agent.presenter.d.ts`
- Create: `src/shared/types/presenters/session.presenter.d.ts`
- Modify: `src/shared/types/presenters/index.d.ts`

- [ ] **Step 1: 重写 agent.presenter.d.ts**

替换 `src/shared/types/presenters/agent.presenter.d.ts` 的全部内容：

```typescript
import type { UserMessageContent } from "../chat";

export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
}
```

- [ ] **Step 2: 创建 session.presenter.d.ts**

```typescript
// src/shared/types/presenters/session.presenter.d.ts
import type { ChatSession, ChatMessageRecord } from "../chat";

export interface ISessionPresenter {
  getSessions(): Promise<ChatSession[]>;
  createSession(title?: string): Promise<ChatSession>;
  deleteSession(id: string): Promise<boolean>;
  getMessages(sessionId: string): Promise<ChatMessageRecord[]>;
}
```

- [ ] **Step 3: 更新 index.d.ts**

替换 `src/shared/types/presenters/index.d.ts` 的全部内容：

```typescript
import type { IAppPresenter } from "./app.presenter";
import type { IConfigPresenter } from "./config.presenter";
import type { IAgentPresenter } from "./agent.presenter";
import type { ISessionPresenter } from "./session.presenter";
import type { IFilePresenter } from "./file.presenter";
import type { IGitPresenter } from "./git.presenter";

export type { IAppPresenter } from "./app.presenter";
export type { IConfigPresenter } from "./config.presenter";
export type { IAgentPresenter } from "./agent.presenter";
export type { ISessionPresenter } from "./session.presenter";
export type { IFilePresenter } from "./file.presenter";
export type { IGitPresenter } from "./git.presenter";

export interface IPresenter {
  appPresenter: IAppPresenter;
  configPresenter: IConfigPresenter;
  agentPresenter: IAgentPresenter;
  sessionPresenter: ISessionPresenter;
  filePresenter: IFilePresenter;
  gitPresenter: IGitPresenter;
  init(): void;
  destroy(): Promise<void>;
}
```

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: FAIL — Presenter 类尚未实现 sessionPresenter，agentPresenter 接口已变。后续 Task 修复。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/presenters/
git commit -m "feat: update presenter interfaces for chat"
```

---

### Task 5: JSON 持久化工具

**Files:**

- Create: `src/main/utils/jsonStore.ts`
- Modify: `src/main/utils/paths.ts` — 添加 `dataDir`
- Modify: `src/main/utils/index.ts` — 导出 jsonStore
- Test: `test/main/jsonStore.test.ts`

- [ ] **Step 1: 在 paths.ts 添加 dataDir**

在 `src/main/utils/paths.ts` 的 `paths` 对象内添加：

```typescript
  get dataDir() {
    return join(this.slimeDir, 'data')
  },
```

- [ ] **Step 2: 写测试**

```typescript
// test/main/jsonStore.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// 必须在 import jsonStore 之前 mock paths
const testDir = join(tmpdir(), `slime-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

const { JsonStore } = await import("@/utils/jsonStore");

describe("JsonStore", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return default value when file does not exist", async () => {
    const store = new JsonStore<string[]>("test-missing.json", []);
    const data = await store.read();
    expect(data).toEqual([]);
  });

  it("should write and read data", async () => {
    const store = new JsonStore<{ name: string }>("test-rw.json", { name: "" });
    await store.write({ name: "slime" });
    const data = await store.read();
    expect(data).toEqual({ name: "slime" });
  });

  it("should create directories if missing", async () => {
    const store = new JsonStore<number[]>("sub/nested.json", []);
    await store.write([1, 2, 3]);
    const data = await store.read();
    expect(data).toEqual([1, 2, 3]);
  });

  it("should return default on corrupt JSON", async () => {
    const filePath = join(testDir, "corrupt.json");
    mkdirSync(join(testDir), { recursive: true });
    require("fs").writeFileSync(filePath, "{{{invalid");
    const store = new JsonStore<string[]>("corrupt.json", ["fallback"]);
    const data = await store.read();
    expect(data).toEqual(["fallback"]);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/jsonStore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 实现 JsonStore**

```typescript
// src/main/utils/jsonStore.ts
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { paths } from "./paths";
import { logger } from "./logger";

export class JsonStore<T> {
  private filePath: string;

  constructor(
    relativePath: string,
    private defaultValue: T,
  ) {
    this.filePath = join(paths.dataDir, relativePath);
  }

  async read(): Promise<T> {
    try {
      if (!existsSync(this.filePath)) return this.defaultValue;
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      logger.warn("JsonStore read failed, returning default", { path: this.filePath });
      return this.defaultValue;
    }
  }

  async write(data: T): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
```

- [ ] **Step 5: 在 utils/index.ts 中导出**

在 `src/main/utils/index.ts` 末尾追加：

```typescript
export { JsonStore } from "./jsonStore";
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/jsonStore.test.ts`
Expected: 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/utils/jsonStore.ts src/main/utils/paths.ts src/main/utils/index.ts test/main/jsonStore.test.ts
git commit -m "feat: add JsonStore utility for JSON persistence"
```

---

### Task 6: SessionPresenter 实现

**Files:**

- Create: `src/main/presenter/sessionPresenter.ts`
- Test: `test/main/sessionPresenter.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/main/sessionPresenter.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `slime-session-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

const { SessionPresenter } = await import("@/presenter/sessionPresenter");

describe("SessionPresenter", () => {
  let presenter: InstanceType<typeof SessionPresenter>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    presenter = new SessionPresenter();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should return empty sessions initially", async () => {
    const sessions = await presenter.getSessions();
    expect(sessions).toEqual([]);
  });

  it("should create a session", async () => {
    const session = await presenter.createSession("test chat");
    expect(session.id).toBeDefined();
    expect(session.title).toBe("test chat");
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it("should create session with default title", async () => {
    const session = await presenter.createSession();
    expect(session.title).toBe("新对话");
  });

  it("should list created sessions", async () => {
    await presenter.createSession("first");
    await presenter.createSession("second");
    const sessions = await presenter.getSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].title).toBe("first");
  });

  it("should delete a session", async () => {
    const session = await presenter.createSession("to delete");
    const result = await presenter.deleteSession(session.id);
    expect(result).toBe(true);
    const sessions = await presenter.getSessions();
    expect(sessions).toHaveLength(0);
  });

  it("should return false when deleting non-existent session", async () => {
    const result = await presenter.deleteSession("non-existent-id");
    expect(result).toBe(false);
  });

  it("should return empty messages for new session", async () => {
    const session = await presenter.createSession("test");
    const messages = await presenter.getMessages(session.id);
    expect(messages).toEqual([]);
  });

  it("should save and load a message", async () => {
    const session = await presenter.createSession("test");
    const msg = {
      id: "msg-1",
      sessionId: session.id,
      role: "user" as const,
      content: JSON.stringify({ text: "hello", files: [] }),
      status: "sent" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await presenter.saveMessage(msg);
    const messages = await presenter.getMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("msg-1");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/sessionPresenter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 SessionPresenter**

```typescript
// src/main/presenter/sessionPresenter.ts
import type { ISessionPresenter } from "@shared/types/presenters";
import type { ChatSession, ChatMessageRecord } from "@shared/types/chat";
import { JsonStore } from "@/utils";
import { logger } from "@/utils";

export class SessionPresenter implements ISessionPresenter {
  private sessionsStore = new JsonStore<ChatSession[]>("sessions.json", []);

  private messageStore(sessionId: string) {
    return new JsonStore<ChatMessageRecord[]>(`messages/${sessionId}.json`, []);
  }

  async getSessions(): Promise<ChatSession[]> {
    return this.sessionsStore.read();
  }

  async createSession(title?: string): Promise<ChatSession> {
    const sessions = await this.sessionsStore.read();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title: title || "新对话",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.push(session);
    await this.sessionsStore.write(sessions);
    logger.info("Session created", { id: session.id, title: session.title });
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    const sessions = await this.sessionsStore.read();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    sessions.splice(idx, 1);
    await this.sessionsStore.write(sessions);
    // 清理消息文件（可选，暂不删文件）
    logger.info("Session deleted", { id });
    return true;
  }

  async getMessages(sessionId: string): Promise<ChatMessageRecord[]> {
    return this.messageStore(sessionId).read();
  }

  async saveMessage(message: ChatMessageRecord): Promise<void> {
    const store = this.messageStore(message.sessionId);
    const messages = await store.read();
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      messages[idx] = message;
    } else {
      messages.push(message);
    }
    await store.write(messages);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/sessionPresenter.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/sessionPresenter.ts test/main/sessionPresenter.test.ts
git commit -m "feat: implement SessionPresenter with JSON persistence"
```

---

### Task 7: AgentPresenter 重写 — 对接 Vercel AI SDK

**Files:**

- Modify: `src/main/presenter/agentPresenter.ts`
- Test: `test/main/agentPresenter.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/main/agentPresenter.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock paths
const testDir = join(tmpdir(), `slime-agent-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

// Mock eventBus
const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: {
    sendToRenderer: mockSendToRenderer,
  },
}));

// Mock Vercel AI SDK streamText
const mockStreamText = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

// Mock provider
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-model")),
}));

// Mock configPresenter
const mockConfigGet = vi.fn();
vi.mock("@/presenter/configPresenter", () => ({
  ConfigPresenter: vi.fn(() => ({
    get: mockConfigGet,
  })),
}));

const { AgentPresenter } = await import("@/presenter/agentPresenter");
const { SessionPresenter } = await import("@/presenter/sessionPresenter");

describe("AgentPresenter", () => {
  let agent: InstanceType<typeof AgentPresenter>;
  let sessionPresenter: InstanceType<typeof SessionPresenter>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    sessionPresenter = new SessionPresenter();
    agent = new AgentPresenter(sessionPresenter);
    mockConfigGet.mockResolvedValue(null);
    mockSendToRenderer.mockClear();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should call streamText and emit stream events", async () => {
    // 模拟 streamText 返回异步迭代器
    const chunks = [
      { type: "text-delta", textDelta: "Hello" },
      { type: "text-delta", textDelta: " world" },
      { type: "finish", finishReason: "stop", usage: { promptTokens: 10, completionTokens: 5 } },
    ];
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    });
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === "ai.provider") return "openai";
      if (key === "ai.apiKey") return "test-key";
      if (key === "ai.model") return "gpt-4o";
      return null;
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    // 应该至少发了 RESPONSE 和 END
    const responseCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:response");
    expect(responseCall).toBeDefined();

    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });

  it("should emit error event on streamText failure", async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        throw new Error("API error");
      })(),
    });
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === "ai.provider") return "openai";
      if (key === "ai.apiKey") return "test-key";
      if (key === "ai.model") return "gpt-4o";
      return null;
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    const errorCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:error");
    expect(errorCall).toBeDefined();
  });

  it("should stop generation", async () => {
    // 创建一个永远不结束的流
    let aborted = false;
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", textDelta: "Hello" };
        await new Promise((_, reject) => {
          // 模拟 abort
          setTimeout(() => {
            aborted = true;
            reject(new Error("aborted"));
          }, 50);
        });
      })(),
    });
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === "ai.provider") return "openai";
      if (key === "ai.apiKey") return "test-key";
      if (key === "ai.model") return "gpt-4o";
      return null;
    });

    const session = await sessionPresenter.createSession("test");
    // 启动 chat（不等待完成）
    const chatPromise = agent.chat(session.id, { text: "hi", files: [] });
    // stopGeneration
    await agent.stopGeneration(session.id);
    await chatPromise;
    // 应该发了 END 事件（cancel 状态）
    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/agentPresenter.test.ts`
Expected: FAIL — 接口不匹配

- [ ] **Step 3: 实现 AgentPresenter**

替换 `src/main/presenter/agentPresenter.ts` 的全部内容：

```typescript
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { IAgentPresenter } from "@shared/types/presenters";
import type {
  UserMessageContent,
  AssistantMessageBlock,
  ChatMessageRecord,
} from "@shared/types/chat";
import { STREAM_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger } from "@/utils";
import type { SessionPresenter } from "./sessionPresenter";

export class AgentPresenter implements IAgentPresenter {
  private abortControllers = new Map<string, AbortController>();

  constructor(private sessionPresenter: SessionPresenter) {}

  private async getConfig(): Promise<{ provider: string; apiKey: string; model: string }> {
    // 直接从环境变量或后续 configPresenter 读取
    // v0.1 暂时支持环境变量 + 硬编码 fallback
    return {
      provider: process.env.SLIME_AI_PROVIDER || "openai",
      apiKey: process.env.SLIME_AI_API_KEY || "",
      model: process.env.SLIME_AI_MODEL || "gpt-4o-mini",
    };
  }

  private createModel(config: { provider: string; apiKey: string; model: string }) {
    if (config.provider === "anthropic") {
      const provider = createAnthropic({ apiKey: config.apiKey });
      return provider(config.model);
    }
    // 默认 openai（也兼容 openai-compatible）
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: process.env.SLIME_AI_BASE_URL || undefined,
    });
    return provider(config.model);
  }

  private async buildMessages(
    sessionId: string,
    content: UserMessageContent,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const records = await this.sessionPresenter.getMessages(sessionId);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const record of records) {
      if (record.role === "user") {
        const parsed = JSON.parse(record.content) as UserMessageContent;
        messages.push({ role: "user", content: parsed.text });
      } else {
        const blocks = JSON.parse(record.content) as AssistantMessageBlock[];
        const text = blocks
          .filter((b) => b.type === "content")
          .map((b) => b.content || "")
          .join("");
        if (text) messages.push({ role: "assistant", content: text });
      }
    }
    // 追加当前消息
    messages.push({ role: "user", content: content.text });
    return messages;
  }

  async chat(sessionId: string, content: UserMessageContent): Promise<void> {
    const config = await this.getConfig();
    if (!config.apiKey) {
      eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, "API key not configured");
      return;
    }

    // 保存用户消息
    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: JSON.stringify(content),
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionPresenter.saveMessage(userMessage);

    // 构建消息历史
    const messages = await this.buildMessages(sessionId, content);
    const model = this.createModel(config);
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();

    try {
      const result = streamText({
        model,
        messages,
        abortSignal: abortController.signal,
      });

      let currentContentBlock: AssistantMessageBlock | null = null;
      let currentReasoningBlock: AssistantMessageBlock | null = null;

      for await (const event of result.fullStream) {
        if (abortController.signal.aborted) break;

        if (event.type === "text-delta") {
          if (!currentContentBlock) {
            currentContentBlock = {
              type: "content",
              content: "",
              status: "loading",
              timestamp: Date.now(),
            };
            blocks.push(currentContentBlock);
          }
          currentContentBlock.content += event.textDelta;
          eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, assistantMessageId, [
            ...blocks,
          ]);
        } else if (event.type === "reasoning") {
          if (!currentReasoningBlock) {
            currentReasoningBlock = {
              type: "reasoning_content",
              content: "",
              status: "loading",
              timestamp: Date.now(),
              reasoning_time: { start: Date.now(), end: 0 },
            };
            // reasoning 插到 content 前面
            blocks.unshift(currentReasoningBlock);
          }
          currentReasoningBlock.content += event.textDelta;
          eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, assistantMessageId, [
            ...blocks,
          ]);
        } else if (event.type === "finish") {
          // 标记所有 block 为 success
          for (const block of blocks) {
            block.status = "success";
          }
          if (currentReasoningBlock?.reasoning_time) {
            currentReasoningBlock.reasoning_time.end = Date.now();
          }
        }
      }

      // 保存助手消息
      const assistantMessage: ChatMessageRecord = {
        id: assistantMessageId,
        sessionId,
        role: "assistant",
        content: JSON.stringify(blocks),
        status: "sent",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.sessionPresenter.saveMessage(assistantMessage);
      eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
    } catch (err) {
      if (abortController.signal.aborted) {
        // 用户主动停止
        for (const block of blocks) block.status = "cancel";
        eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("AgentPresenter chat error", { sessionId, error: errorMsg });
        eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, errorMsg);
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  async stopGeneration(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
      logger.info("Generation stopped", { sessionId });
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/agentPresenter.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentPresenter.ts test/main/agentPresenter.test.ts
git commit -m "feat: rewrite AgentPresenter with Vercel AI SDK streaming"
```

---

### Task 8: 注册 sessionPresenter 到 Presenter 单例

**Files:**

- Modify: `src/main/presenter/index.ts`
- Modify: `test/main/presenter.test.ts`

- [ ] **Step 1: 更新测试**

替换 `test/main/presenter.test.ts` 的全部内容：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ipcMain } from "electron";

const mockHandle = vi.mocked(ipcMain.handle);

describe("Presenter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should register presenter:call handler on import", async () => {
    await import("@/presenter/index");
    expect(mockHandle).toHaveBeenCalledWith("presenter:call", expect.any(Function));
  });

  it("should dispatch to appPresenter.getVersion", async () => {
    const { Presenter } = await import("@/presenter/index");
    const presenter = Presenter.getInstance();
    const result = presenter.appPresenter.getVersion();
    expect(result).toBe("0.1.0");
  });

  it("should have sessionPresenter registered", async () => {
    const { Presenter } = await import("@/presenter/index");
    const presenter = Presenter.getInstance();
    expect(presenter.sessionPresenter).toBeDefined();
    expect(typeof presenter.sessionPresenter.getSessions).toBe("function");
  });

  it("should dispatch to sessionPresenter via IPC", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    // sessionPresenter.getSessions should be dispatchable
    const result = await handler({} as any, "sessionPresenter", "getSessions");
    expect(Array.isArray(result)).toBe(true);
  });

  it("should reject non-dispatchable presenter names", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    await expect(handler({} as any, "notReal", "method")).rejects.toThrow("not dispatchable");
  });

  it("should reject non-existent methods", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    await expect(handler({} as any, "appPresenter", "noSuchMethod")).rejects.toThrow("not found");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project main test/main/presenter.test.ts`
Expected: FAIL — sessionPresenter 未注册

- [ ] **Step 3: 更新 Presenter 单例**

替换 `src/main/presenter/index.ts` 的全部内容：

```typescript
import { ipcMain } from "electron";
import type { IPresenter } from "@shared/types/presenters";
import { AppPresenter } from "./appPresenter";
import { ConfigPresenter } from "./configPresenter";
import { AgentPresenter } from "./agentPresenter";
import { SessionPresenter } from "./sessionPresenter";
import { FilePresenter } from "./filePresenter";
import { GitPresenter } from "./gitPresenter";
import { logger } from "@/utils";

type DispatchableKey = Exclude<keyof IPresenter, "init" | "destroy">;

export class Presenter implements IPresenter {
  appPresenter: AppPresenter;
  configPresenter: ConfigPresenter;
  agentPresenter: AgentPresenter;
  sessionPresenter: SessionPresenter;
  filePresenter: FilePresenter;
  gitPresenter: GitPresenter;

  private static instance: Presenter | null = null;

  private constructor() {
    this.appPresenter = new AppPresenter();
    this.configPresenter = new ConfigPresenter();
    this.sessionPresenter = new SessionPresenter();
    this.agentPresenter = new AgentPresenter(this.sessionPresenter);
    this.filePresenter = new FilePresenter();
    this.gitPresenter = new GitPresenter();
  }

  static getInstance(): Presenter {
    if (!Presenter.instance) {
      Presenter.instance = new Presenter();
    }
    return Presenter.instance;
  }

  /** Test only: reset singleton */
  static _resetForTest(): void {
    Presenter.instance = null;
  }

  static readonly DISPATCHABLE = new Set<DispatchableKey>([
    "appPresenter",
    "configPresenter",
    "agentPresenter",
    "sessionPresenter",
    "filePresenter",
    "gitPresenter",
  ]);

  init(): void {
    logger.info("Presenter initialized");
  }

  async destroy(): Promise<void> {
    logger.info("Presenter destroyed");
  }
}

ipcMain.handle(
  "presenter:call",
  async (_event, name: string, method: string, ...args: unknown[]) => {
    if (!Presenter.DISPATCHABLE.has(name as DispatchableKey)) {
      throw new Error(`Presenter '${name}' is not dispatchable`);
    }
    const presenter = Presenter.getInstance();
    const target = presenter[name as DispatchableKey] as unknown as Record<string, unknown>;
    if (typeof target[method] !== "function") {
      throw new Error(`Method '${method}' not found on '${name}'`);
    }
    return (target[method] as Function)(...args);
  },
);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project main test/main/presenter.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/index.ts test/main/presenter.test.ts
git commit -m "feat: register sessionPresenter in Presenter singleton"
```

---

### Task 9: Session Store（渲染进程）

**Files:**

- Create: `src/renderer/src/stores/session.ts`
- Test: `test/renderer/stores/session.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/stores/session.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);

// usePresenter 会调用 window.electron.ipcRenderer.invoke
(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: vi.fn(), removeAllListeners: vi.fn() } },
};

import { useSessionStore } from "@/stores/session";

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
  });

  it("should start with empty sessions and no active session", () => {
    const store = useSessionStore();
    expect(store.sessions).toEqual([]);
    expect(store.activeSessionId).toBeNull();
  });

  it("should fetch sessions via IPC", async () => {
    const mockSessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    mockInvoke.mockResolvedValueOnce(mockSessions);

    const store = useSessionStore();
    await store.fetchSessions();

    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "sessionPresenter", "getSessions");
    expect(store.sessions).toEqual(mockSessions);
  });

  it("should create session via IPC and set as active", async () => {
    const newSession = { id: "s1", title: "新对话", createdAt: 1, updatedAt: 1 };
    mockInvoke.mockResolvedValueOnce(newSession);

    const store = useSessionStore();
    await store.createSession();

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "createSession",
      undefined,
    );
    expect(store.sessions).toContainEqual(newSession);
    expect(store.activeSessionId).toBe("s1");
  });

  it("should select session", () => {
    const store = useSessionStore();
    store.sessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    store.selectSession("s1");
    expect(store.activeSessionId).toBe("s1");
  });

  it("should delete session via IPC", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const store = useSessionStore();
    store.sessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    store.activeSessionId = "s1";

    await store.deleteSession("s1");

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "deleteSession",
      "s1",
    );
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/stores/session.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 Session Store**

```typescript
// src/renderer/src/stores/session.ts
import { defineStore } from "pinia";
import { ref } from "vue";
import type { ChatSession } from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useSessionStore = defineStore("session", () => {
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");

  async function fetchSessions(): Promise<void> {
    sessions.value = (await sessionPresenter.getSessions()) as ChatSession[];
  }

  async function createSession(title?: string): Promise<ChatSession> {
    const session = (await sessionPresenter.createSession(title)) as ChatSession;
    sessions.value.push(session);
    activeSessionId.value = session.id;
    return session;
  }

  function selectSession(id: string): void {
    activeSessionId.value = id;
  }

  async function deleteSession(id: string): Promise<void> {
    await sessionPresenter.deleteSession(id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id ?? null;
    }
  }

  return {
    sessions,
    activeSessionId,
    fetchSessions,
    createSession,
    selectSession,
    deleteSession,
  };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/stores/session.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/session.ts test/renderer/stores/session.test.ts
git commit -m "feat: add session store"
```

---

### Task 10: Message Store 重写（渲染进程）

**Files:**

- Modify: `src/renderer/src/stores/chat.ts`
- Modify: `test/renderer/stores/chat.test.ts`

- [ ] **Step 1: 重写测试**

替换 `test/renderer/stores/chat.test.ts` 的全部内容：

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);
const mockOn = vi.fn(() => vi.fn()); // 返回 unsubscribe 函数

(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() } },
};

import { useMessageStore } from "@/stores/chat";
import type { AssistantMessageBlock, ChatMessageRecord } from "@shared/types/chat";

describe("messageStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockOn.mockClear();
  });

  it("should start with empty state", () => {
    const store = useMessageStore();
    expect(store.messageIds).toEqual([]);
    expect(store.isStreaming).toBe(false);
    expect(store.streamingBlocks).toEqual([]);
  });

  it("should load messages via IPC", async () => {
    const mockMessages: ChatMessageRecord[] = [
      {
        id: "m1",
        sessionId: "s1",
        role: "user",
        content: JSON.stringify({ text: "hello", files: [] }),
        status: "sent",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    mockInvoke.mockResolvedValueOnce(mockMessages);

    const store = useMessageStore();
    await store.loadMessages("s1");

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "getMessages",
      "s1",
    );
    expect(store.messageIds).toEqual(["m1"]);
    expect(store.getMessage("m1")).toEqual(mockMessages[0]);
  });

  it("should add optimistic user message", () => {
    const store = useMessageStore();
    store.addOptimisticUserMessage("s1", { text: "hello", files: [] });
    expect(store.messageIds).toHaveLength(1);
    const msg = store.getMessage(store.messageIds[0]);
    expect(msg?.role).toBe("user");
    expect(msg?.status).toBe("sent");
  });

  it("should set streaming blocks", () => {
    const store = useMessageStore();
    const blocks: AssistantMessageBlock[] = [
      { type: "content", content: "Hello", status: "loading", timestamp: Date.now() },
    ];
    store.setStreamingState("s1", "msg-1", blocks);
    expect(store.isStreaming).toBe(true);
    expect(store.streamingBlocks).toEqual(blocks);
    expect(store.currentStreamMessageId).toBe("msg-1");
  });

  it("should clear streaming state", () => {
    const store = useMessageStore();
    store.setStreamingState("s1", "msg-1", []);
    store.clearStreamingState();
    expect(store.isStreaming).toBe(false);
    expect(store.streamingBlocks).toEqual([]);
    expect(store.currentStreamMessageId).toBeNull();
  });

  it("should send message via IPC", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const store = useMessageStore();
    await store.sendMessage("s1", { text: "hello", files: [] });
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "agentPresenter", "chat", "s1", {
      text: "hello",
      files: [],
    });
  });

  it("should stop generation via IPC", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const store = useMessageStore();
    await store.stopGeneration("s1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "agentPresenter",
      "stopGeneration",
      "s1",
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/stores/chat.test.ts`
Expected: FAIL — useMessageStore not found

- [ ] **Step 3: 重写 Message Store**

替换 `src/renderer/src/stores/chat.ts` 的全部内容：

```typescript
import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  UserMessageContent,
} from "@shared/types/chat";
import { usePresenter } from "@/composables/usePresenter";

export const useMessageStore = defineStore("message", () => {
  const messageIds = ref<string[]>([]);
  const messageCache = ref<Map<string, ChatMessageRecord>>(new Map());
  const isStreaming = ref(false);
  const streamingBlocks = ref<AssistantMessageBlock[]>([]);
  const currentStreamMessageId = ref<string | null>(null);
  const currentStreamSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");
  const agentPresenter = usePresenter("agentPresenter");

  function getMessage(id: string): ChatMessageRecord | undefined {
    return messageCache.value.get(id);
  }

  async function loadMessages(sessionId: string): Promise<void> {
    const messages = (await sessionPresenter.getMessages(sessionId)) as ChatMessageRecord[];
    messageIds.value = messages.map((m) => m.id);
    messageCache.value = new Map(messages.map((m) => [m.id, m]));
  }

  function addOptimisticUserMessage(sessionId: string, content: UserMessageContent): string {
    const id = crypto.randomUUID();
    const message: ChatMessageRecord = {
      id,
      sessionId,
      role: "user",
      content: JSON.stringify(content),
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    messageIds.value.push(id);
    messageCache.value.set(id, message);
    return id;
  }

  function setStreamingState(
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
  ): void {
    isStreaming.value = true;
    currentStreamSessionId.value = sessionId;
    currentStreamMessageId.value = messageId;
    streamingBlocks.value = blocks;
  }

  function clearStreamingState(): void {
    isStreaming.value = false;
    currentStreamSessionId.value = null;
    currentStreamMessageId.value = null;
    streamingBlocks.value = [];
  }

  async function sendMessage(sessionId: string, content: UserMessageContent): Promise<void> {
    addOptimisticUserMessage(sessionId, content);
    await agentPresenter.chat(sessionId, content);
  }

  async function stopGeneration(sessionId: string): Promise<void> {
    await agentPresenter.stopGeneration(sessionId);
  }

  return {
    messageIds,
    messageCache,
    isStreaming,
    streamingBlocks,
    currentStreamMessageId,
    currentStreamSessionId,
    getMessage,
    loadMessages,
    addOptimisticUserMessage,
    setStreamingState,
    clearStreamingState,
    sendMessage,
    stopGeneration,
  };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/stores/chat.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chat.ts test/renderer/stores/chat.test.ts
git commit -m "feat: rewrite message store with block-based model"
```

---

### Task 11: IPC 事件监听绑定（渲染进程）

**Files:**

- Create: `src/renderer/src/stores/messageIpc.ts`
- Test: `test/renderer/stores/messageIpc.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/stores/messageIpc.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);
const eventHandlers: Record<string, Function> = {};
const mockOn = vi.fn((channel: string, handler: Function) => {
  eventHandlers[channel] = handler;
  return vi.fn(); // unsubscribe
});

(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: mockOn, removeAllListeners: vi.fn() } },
};

import { useMessageStore } from "@/stores/chat";
import { setupMessageIpc } from "@/stores/messageIpc";
import { STREAM_EVENTS } from "@shared/events";

describe("messageIpc", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    mockOn.mockClear();
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key];
  });

  it("should register stream event listeners", () => {
    const store = useMessageStore();
    setupMessageIpc(store);
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.RESPONSE, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.END, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(STREAM_EVENTS.ERROR, expect.any(Function));
  });

  it("should update streaming state on RESPONSE event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    const blocks = [{ type: "content", content: "Hi", status: "loading", timestamp: 1 }];
    eventHandlers[STREAM_EVENTS.RESPONSE]("s1", "msg-1", blocks);

    expect(store.isStreaming).toBe(true);
    expect(store.streamingBlocks).toEqual(blocks);
  });

  it("should clear streaming state on END event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    // First set streaming
    store.setStreamingState("s1", "msg-1", []);
    // Then end
    mockInvoke.mockResolvedValue([]); // loadMessages will be called
    eventHandlers[STREAM_EVENTS.END]("s1", "msg-1");

    expect(store.isStreaming).toBe(false);
  });

  it("should clear streaming state on ERROR event", () => {
    const store = useMessageStore();
    setupMessageIpc(store);

    store.setStreamingState("s1", "msg-1", []);
    eventHandlers[STREAM_EVENTS.ERROR]("s1", "some error");

    expect(store.isStreaming).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/stores/messageIpc.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 messageIpc**

```typescript
// src/renderer/src/stores/messageIpc.ts
import { STREAM_EVENTS } from "@shared/events";
import type { AssistantMessageBlock } from "@shared/types/chat";
import type { useMessageStore } from "./chat";

export function setupMessageIpc(store: ReturnType<typeof useMessageStore>): () => void {
  const unsubs: Array<() => void> = [];

  const unsubResponse = window.electron.ipcRenderer.on(
    STREAM_EVENTS.RESPONSE,
    (sessionId: unknown, messageId: unknown, blocks: unknown) => {
      store.setStreamingState(
        sessionId as string,
        messageId as string,
        blocks as AssistantMessageBlock[],
      );
    },
  );
  unsubs.push(unsubResponse);

  const unsubEnd = window.electron.ipcRenderer.on(
    STREAM_EVENTS.END,
    (sessionId: unknown, _messageId: unknown) => {
      store.clearStreamingState();
      // 重新加载消息以获取最终状态
      store.loadMessages(sessionId as string);
    },
  );
  unsubs.push(unsubEnd);

  const unsubError = window.electron.ipcRenderer.on(
    STREAM_EVENTS.ERROR,
    (_sessionId: unknown, _error: unknown) => {
      store.clearStreamingState();
    },
  );
  unsubs.push(unsubError);

  return () => unsubs.forEach((fn) => fn());
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/stores/messageIpc.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/messageIpc.ts test/renderer/stores/messageIpc.test.ts
git commit -m "feat: add IPC event binding for stream events"
```

---

### Task 12: 全量测试 + 格式化 + Lint

**Files:** 无新文件

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试 PASS

- [ ] **Step 2: 格式化**

Run: `pnpm run format`

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: 无错误

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: 修复任何问题**

如果上述步骤有失败，修复后重新运行直到全部通过。

- [ ] **Step 6: Commit（如有格式化改动）**

```bash
git add -A
git commit -m "chore: format and lint pass for 005a"
```
