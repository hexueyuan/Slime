# 群聊模式设计文档

**日期：** 2026-05-09
**分支：** brave
**范围：** 群聊会话、AgentInvoker、主持人 Agent、独立窗口、后台生成不中断

---

## 背景与目标

现有对话系统是严格的一对一单聊模型（用户 ↔ 单个 Agent）。本次升级引入群聊模式，支持：

1. **群聊会话**：多个 Agent 参与同一会话，用户 @ 触发指定 Agent 回复
2. **AgentInvoker**：每个 Agent 独立执行单元，fire-and-forget 调用，输出推送到指定渠道
3. **主持人**：群聊级开关，用轻量模型分析用户意图，自动路由到相关 Agent（无需手动 @），对用户透明
4. **独立窗口**：双击会话在独立 BrowserWindow 中打开，主窗口保持干净
5. **后台生成不中断**：切换视图不终止 Agent 生成，结果完成后推送到渠道

**原则：现有单聊逻辑完全不动，群聊作为独立入口新增。**

---

## 一、数据层

### 1.1 独立新建两张表

群聊使用独立表，不复用 `agent_sessions` / `agent_messages`，两套数据完全隔离。

```sql
-- 群聊会话表
CREATE TABLE group_chat_sessions (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  participant_agent_ids TEXT NOT NULL,   -- JSON array: ["agent-a", "agent-b"]
  moderator_enabled     INTEGER NOT NULL DEFAULT 0,  -- 0=关闭，1=开启主持人
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

-- 群聊消息表
CREATE TABLE group_chat_messages (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES group_chat_sessions(id) ON DELETE CASCADE,
  order_seq        INTEGER NOT NULL,   -- Date.now() 时间戳，支持并发写入自然排序
  sender_agent_id  TEXT,               -- NULL = 用户，非 NULL = 发言的 Agent id
  role             TEXT NOT NULL,      -- "user" | "assistant"
  content          TEXT NOT NULL,      -- 用户消息为纯文本；Agent 消息为 AssistantMessageBlock[] JSON
  hidden           INTEGER NOT NULL DEFAULT 0,  -- 1 = 主持人注入的隐藏指令，不展示 UI
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_group_chat_messages_session ON group_chat_messages(session_id, order_seq);
```

### 1.2 order_seq 策略

`group_chat_messages.order_seq` 使用 `Date.now()` 毫秒时间戳，多个 Agent 并发写入时按完成时间自然排序，无需预分配序号。

### 1.3 类型定义

```typescript
// src/shared/types/groupChat.d.ts

interface GroupChatSession {
  id: string;
  title: string;
  participantAgentIds: string[];
  moderatorEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface GroupChatMessageRecord {
  id: string;
  sessionId: string;
  orderSeq: number; // Date.now() 时间戳
  senderAgentId: string | null; // null = 用户
  role: "user" | "assistant";
  content: string; // 用户消息为纯文本，Agent 消息为 AssistantMessageBlock[] JSON
  hidden: boolean;
  createdAt: number;
}
```

---

## 二、AgentInvoker

### 2.1 接口设计

新文件：`src/main/presenter/agentChat/agentInvoker.ts`

```typescript
type OutputChannel = {
  type: "group_chat";
  sessionId: string;
};

interface InvokeParams {
  messages: GroupChatMessageRecord[]; // 群聊原始消息，由 Invoker 内部转换为 LLM 格式
  outputChannel: OutputChannel;
  hidden?: boolean; // true = 写入消息时 hidden=1（主持人注入的指令）
}

class AgentInvoker {
  constructor(private agentId: string) {}

  // fire-and-forget，不返回 Promise
  invoke(params: InvokeParams): void;

  // 停止指定渠道上正在进行的生成
  stop(sessionId: string): void;

  isRunning(sessionId: string): boolean;
}
```

### 2.2 消息上下文转换规则

群聊消息 → LLM messages 格式：

| 群聊消息来源                   | LLM role    | content 格式         |
| ------------------------------ | ----------- | -------------------- |
| `senderAgentId = null`（用户） | `user`      | 原始内容             |
| `senderAgentId = 本 Agent`     | `assistant` | 原始内容             |
| `senderAgentId = 其他 Agent`   | `user`      | `[agentId]: 内容`    |
| `hidden = 1`（主持人指令）     | `user`      | 原始内容（不加前缀） |

### 2.3 System Prompt 群聊身份注入

在 Agent 原有 system prompt 基础上，追加：

```
你正在参与一个群聊。群聊中的其他参与者 ID 为：[agentId1, agentId2, ...]。
消息中以 [agentId]: 开头的内容来自其他参与者。
```

### 2.4 执行完成后的输出

Agent 生成完毕（agentic loop 结束）后：

1. 将完整消息写入 `group_chat_messages`（`sender_agent_id = agentId`，`hidden = params.hidden ? 1 : 0`）
2. 推送事件：
   - `GROUP_CHAT_EVENTS.MESSAGE_ADDED` → 前端追加消息
   - `GROUP_CHAT_EVENTS.AGENT_TYPING` `{ isTyping: false }` → 前端清除 typing 状态

### 2.5 AgentInvokerRegistry

```typescript
// src/main/presenter/agentChat/agentInvokerRegistry.ts
class AgentInvokerRegistry {
  private invokers = new Map<string, AgentInvoker>();

  get(agentId: string): AgentInvoker; // 懒加载创建
  stopAll(sessionId: string): void; // 停止某 session 所有 Agent 的生成
}

export const agentInvokerRegistry = new AgentInvokerRegistry();
```

---

## 三、主持人

### 3.1 概述

主持人是群聊级别的开关（`moderator_enabled`），不是一个可见的 Agent 实体，对用户完全透明。开启后，当用户发消息没有手动 @ 任何 Agent 时，由主持人逻辑自动决定路由给哪些 Agent。

### 3.2 触发条件

用户发送消息时：

- **有 @** → 跳过主持人，直接触发被 @ 的 Agent
- **无 @，且 `moderator_enabled = true`** → 触发主持人分析

### 3.2 主持人执行流程

主持人是**单次轻量 LLM 调用**，不走 agentic loop，不产生群聊消息。

```
输入：
  - 群聊参与 Agent 列表（id + name + description）
  - 最近 20 条可见消息
  - 用户新消息

Prompt 要求输出 JSON：
  { "targetAgentIds": ["agent-a"] }

输出：
  对每个 targetAgentId，调用 AgentInvoker.invoke(...)
  主持人本身不写任何消息到群聊
```

使用 Gateway 的 `chat` 分组（便宜模型），temperature=0，不需要工具调用能力。

---

## 四、GroupChatPresenter

新文件：`src/main/presenter/groupChatPresenter.ts`

### 4.1 IPC 接口

```typescript
class GroupChatPresenter {
  // 会话管理
  createSession(
    participantAgentIds: string[],
    moderatorEnabled?: boolean,
  ): Promise<GroupChatSession>;
  getSessions(): Promise<GroupChatSession[]>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;

  // 消息
  getMessages(sessionId: string): Promise<GroupChatMessageRecord[]>;

  // 用户发送消息入口
  sendMessage(sessionId: string, content: string, mentionedAgentIds: string[]): Promise<void>;
  // 流程：
  // 1. 写入用户消息（sender_agent_id=null）
  // 2. 推送 MESSAGE_ADDED 事件
  // 3. 如果 mentionedAgentIds 非空 → 逐个 AgentInvoker.invoke
  //    否则如果有主持人 → 触发主持人路由
  // 4. 对每个将要生成的 Agent 推送 AGENT_TYPING { isTyping: true }

  // 停止指定 session 内某 Agent 的生成
  stopAgent(sessionId: string, agentId: string): Promise<void>;
}
```

### 4.2 会话默认标题

创建时自动生成：`用户、AgentName1、AgentName2`（用顿号连接）。用户可在顶部标题栏双击修改。

### 4.3 事件定义

```typescript
// src/shared/events.ts 追加
export const GROUP_CHAT_EVENTS = {
  MESSAGE_ADDED: "group_chat:message_added", // { sessionId, message: GroupChatMessageRecord }
  AGENT_TYPING: "group_chat:agent_typing", // { sessionId, agentId, isTyping: boolean }
} as const;
```

---

## 五、独立窗口

### 5.1 创建流程

```
用户双击 GroupSessionList 某条会话
    ↓
渲染进程 IPC → main: window.createDetachedWindow(sessionId)
main 检查：该 sessionId 是否已有独立窗口？
  是 → focus 已有窗口
  否 → 创建新 BrowserWindow，加载 ?detached=1&sessionId=xxx
主窗口内存标记 detachedSessionIds.add(sessionId)
主窗口点击该会话 → IPC focus 独立窗口，不切换 ChatView
```

### 5.2 独立窗口布局

```
DetachedGroupChatWindow
├── 顶部栏（会话标题、参与 Agent 头像列表）
├── GroupMessageList
└── GroupChatInput
```

无 SessionList，无导航栏。

### 5.3 关闭流程

```
用户关闭独立窗口
    ↓
BrowserWindow 'closed' 事件
    ↓
main IPC → 主窗口：detached_window_closed { sessionId }
主窗口清除 detachedSessionIds
主窗口重新拉取该 session 消息列表
```

### 5.4 约束

- 同一 sessionId 只允许一个独立窗口
- 独立窗口内不显示 SessionList，无法再开新窗口

---

## 六、前端结构

### 6.1 导航入口

在现有左侧导航栏新增"群聊"入口（图标待定），与"单聊"并列：

```
左侧导航
├── 单聊（现有 ChatroomPanel）
├── 群聊（新增 GroupChatPanel）  ← 新增
├── Gateway
├── Agents
└── Schedule
```

### 6.2 GroupChatPanel 布局

```
GroupChatPanel（flex h-full）
├── 左侧：GroupSessionList（220px）
│   ├── 新建群聊按钮
│   └── 群聊列表（单击切换，双击开独立窗口）
└── 右侧：NewGroupThread 或 GroupChatView
    ├── NewGroupThread（无 activeSessionId 时）
    │   ├── 多选 Agent 卡片（必选 ≥2）
    │   ├── 可选：开启智能路由（主持人）开关
    │   └── 输入第一条消息发送创建
    └── GroupChatView（有 activeSessionId 时）
        ├── 顶部栏（标题可编辑、参与 Agent 头像）
        ├── GroupMessageList
        │   └── 用户消息下方挂载 typing 状态行
        │       示例：「A 正在思考... · C 正在思考...」
        └── GroupChatInput（支持 @ 提及补全）
```

### 6.3 GroupChatInput @ 提及

输入 `@` 时弹出参与 Agent 列表下拉框（显示 Agent 名字），选中后插入 `@AgentName`（展示用），发送时将名字映射回 agentId，解析出 `mentionedAgentIds`。

### 6.4 Pinia Stores

```typescript
// useGroupChatSessionStore
{
  sessions: GroupChatSession[]
  activeSessionId: string | null
  detachedSessionIds: Set<string>   // 已在独立窗口中打开的 session
}

// useGroupChatStore
{
  messages: GroupChatMessageRecord[]
  typingAgentIds: Set<string>       // 当前 session 中正在生成的 Agent id 集合
}
```

---

## 七、不在本次范围内

- 单聊入口改动（保持原样）
- Agent 依赖编排（A 完成后触发 B）
- 群聊消息流式输出
- 主持人的任务编排能力（仅做路由分析）
- 独立窗口内的 ChatFunctionPanel（工具/预览 tab）

---

## 八、文件新增/变更清单

| 文件                                                         | 操作                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `src/main/db/database.ts`                                    | 变更：新建 group_chat_sessions / group_chat_messages 两张表 |
| `src/main/db/models/groupChatSessionDao.ts`                  | 新增：群聊会话 DAO                                          |
| `src/main/db/models/groupChatMessageDao.ts`                  | 新增：群聊消息 DAO                                          |
| `src/shared/types/groupChat.d.ts`                            | 新增：GroupChatSession / GroupChatMessageRecord 类型        |
| `src/shared/events.ts`                                       | 变更：追加 GROUP_CHAT_EVENTS                                |
| `src/main/presenter/agentChat/agentInvoker.ts`               | 新增：AgentInvoker 类                                       |
| `src/main/presenter/agentChat/agentInvokerRegistry.ts`       | 新增：AgentInvokerRegistry 单例                             |
| `src/main/presenter/groupChatPresenter.ts`                   | 新增：GroupChatPresenter                                    |
| `src/main/presenter/index.ts`                                | 变更：注册 GroupChatPresenter                               |
| `src/main/window.ts`                                         | 变更：createDetachedWindow + detached 生命周期 IPC          |
| `src/renderer/src/stores/groupChatSession.ts`                | 新增：useGroupChatSessionStore                              |
| `src/renderer/src/stores/groupChat.ts`                       | 新增：useGroupChatStore                                     |
| `src/renderer/src/stores/groupChatIpc.ts`                    | 新增：GROUP_CHAT_EVENTS IPC 监听                            |
| `src/renderer/src/components/groupchat/GroupSessionList.vue` | 新增                                                        |
| `src/renderer/src/components/groupchat/NewGroupThread.vue`   | 新增                                                        |
| `src/renderer/src/components/groupchat/GroupChatView.vue`    | 新增                                                        |
| `src/renderer/src/components/groupchat/GroupMessageList.vue` | 新增                                                        |
| `src/renderer/src/components/groupchat/GroupChatInput.vue`   | 新增                                                        |
| `src/renderer/src/components/groupchat/GroupMessageItem.vue` | 新增                                                        |
| `src/renderer/src/views/GroupChatPanel.vue`                  | 新增                                                        |
| `src/renderer/src/App.vue`                                   | 变更：新增群聊导航入口                                      |
