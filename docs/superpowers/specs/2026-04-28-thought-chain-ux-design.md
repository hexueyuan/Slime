# 思考链 UX 优化设计

**日期：** 2026-04-28
**分支：** brave
**目标：** Agent 对话区只展示最终答案，中间思考/工具调用折叠进"思考链"面板，按需查阅。

---

## 背景

当前 agentic loop 产生多条 assistant 消息（中间思考文字 + 工具调用 block + 最终答案），全部平铺在主聊天区，信息噪音大。优化后聊天区只保留最终答案，思考过程通过"思考链"按钮在右侧预览区查看。

---

## 数据层

### DB Schema 变更

`agent_messages` 表新增两列：

```sql
ALTER TABLE agent_messages ADD COLUMN turn_id TEXT;
ALTER TABLE agent_messages ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0;
```

- `turn_id`：同一次用户提问触发的整个 agentic loop 共享同一个 nanoid
- `is_final`：`1` = 该轮最终 assistant 消息（loop 结束时不含 tool_call 的那条），`0` = 中间步骤

**存量数据迁移：** 每条现有 assistant 消息 `turn_id = id`，`is_final = 1`，各自独立成轮，向后兼容。

### AgentChatPresenter 变更

- agentic loop 入口生成 `turnId = nanoid()`，注入所有本轮 `saveMessage` 调用
- loop 正常退出（最后一次 streamText 完成，无 tool_call）时，对最后保存的 assistant 消息执行 `UPDATE agent_messages SET is_final = 1 WHERE id = ?`

### 类型声明

`AgentMessage`（shared types）新增：

```ts
turn_id?: string
is_final?: 0 | 1
```

---

## Store 层

### MessageTurn 概念

```ts
interface MessageTurn {
  turnId: string;
  intermediates: ChatMessageRecord[]; // is_final = 0，按时间排序
  final: ChatMessageRecord | null; // is_final = 1
}
```

`AgentChatStore` 新增 `turns: MessageTurn[]` computed，将 `messages` 按 `turn_id` 聚合（user 消息不参与分组）。渲染层消费 `turns`，不直接遍历 `messages`。

### 流式状态

流式阶段（`isGenerating = true`）：当前 turn 的 `currentTurnId` 由 store 记录，流式 turn 作为 `turns` 末尾的特殊条目暴露（`final = null`，`intermediates` 随 `streamingBlocks` 更新）。

### toolCallBlocks（ChatroomPanel）

聚合所有 turn 的 intermediates + final 中的所有 tool_call blocks，保持对 ToolPanel 的格式转换兼容。

---

## UI 层

### ChatMessageList

遍历 `turns`：

- `role = 'user'`：照常渲染
- assistant turn 有 `final`：只渲染 `final` 消息（`ChatMessageAssistant`），intermediates 不出现在主聊天区
- assistant turn 无 `final`（流式进行中）：渲染"思考中..."气泡

### "思考中..."气泡

`ChatMessageAssistant` 的加载状态变体：

- 内容：紫色脉冲点 + "思考中..."
- 右下角：始终可见的"查看进度"按钮（不依赖 hover，用户等待时随时可点）
- 点击：将当前 `streamingBlocks` 作为思考链内容推送到预览 Tab

### 最终消息 Toolbar

hover 工具栏（复制 / 重试旁）新增"思考链"按钮（`ListTree` 图标）：

- 仅当 `turn.intermediates.length > 0` 时渲染（纯单轮对话不出现）
- 点击：`selectedTurnId.value = turn.turnId`，预览 Tab 切换并展示 `ThoughtChainPanel`

### ThoughtChainPanel（新组件）

`src/renderer/src/components/chat/ThoughtChainPanel.vue`

props: `intermediates: ChatMessageRecord[]`

渲染步骤时间线：

```
① [content block]   让我来查一下今天的日期！     灰色编号
② [tool_call block] ⚙ exec            ✓         紫色编号，可点击
③ [tool_call block] ⚙ read_file       ✗         紫色编号，可点击
```

- 工具行点击：`emit('select-tool-call', blockId)` + 自动切换到 Tools Tab（复用 `selectedToolCallId` 机制）
- 工具行只显示工具名 + 状态图标，详情在 Tools Tab 展示

### ChatFunctionPanel 预览 Tab

根据激活内容类型分发：

- `selectedTurnId` 有值 → `ThoughtChainPanel`（传入对应 turn 的 intermediates）
- 否则 → 原有 `ContentDispatcher`（ask_user / md / progress / html）

---

## 改动范围

| 文件                                                        | 类型                                      |
| ----------------------------------------------------------- | ----------------------------------------- |
| `src/main/db/agentDb.ts`                                    | 修改：migration 增加两列                  |
| `src/main/presenter/agentChat/agentChatPresenter.ts`        | 修改：生成 turnId，标记 is_final          |
| `src/shared/types/agent.d.ts`                               | 修改：AgentMessage 新增字段               |
| `src/renderer/src/stores/agentChatStore.ts`                 | 修改：新增 turns computed，currentTurnId  |
| `src/renderer/src/components/chat/ChatMessageList.vue`      | 修改：遍历 turns                          |
| `src/renderer/src/components/chat/ChatMessageAssistant.vue` | 修改：加载态、思考链按钮                  |
| `src/renderer/src/components/chat/ThoughtChainPanel.vue`    | 新增                                      |
| `src/renderer/src/components/chat/ChatFunctionPanel.vue`    | 修改：预览 Tab 分发逻辑                   |
| `src/renderer/src/components/ChatroomPanel.vue`             | 修改：selectedTurnId，toolCallBlocks 聚合 |
