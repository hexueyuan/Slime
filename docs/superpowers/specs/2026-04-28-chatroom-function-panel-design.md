# Chatroom 功能区设计

## 背景

Agent 会话视图（Chatroom）目前没有右侧功能区，无法展示工具调用详情和 interaction 预览。EvoLab 已有完整的功能区实现，需将其能力引入 Chatroom，但两者完全独立维护。

## 目标

- Chatroom 增加右侧功能区，包含工具（ToolPanel）和预览（ContentDispatcher）两个 Tab
- 点击消息中的 tool_call block 可在右侧查看详情
- interaction（ask_user）内容通过预览 Tab 展示，提交走 agentChatPresenter

## 不包含

- 历史 Tab（进化历史，与 agent 会话无关）
- 功能区收起/展开切换（与 EvoLab 保持一致，始终展示）

## 布局

```
[SessionList 220px] | [ChatView] [divider] [ChatFunctionPanel min-320px]
```

split pane 复用 `useSplitPane` composable，defaultRatio=0.65，minLeftPx=280，minRightPx=320。

## 新增文件

### `src/renderer/src/components/chat/ChatFunctionPanel.vue`

- 2 个 Tab：工具 / 预览
- Props：`activeTab`、`toolCallBlocks`、`selectedToolCallId`
- Emits：`update:activeTab`、`select-tool-call`
- interaction submit：调用 `agentChatStore.answerQuestion(sessionId, toolCallId, answer)`，sessionId 从 `useAgentSessionStore().activeSessionId` 获取
- progress cancel：调用 `contentPresenter.cancelProgress("current")`
- 子组件：从 `components/function/` 引入 `ToolPanel`、`ContentDispatcher`（纯展示，无 evolab 专属逻辑）

## 改动文件

### `ChatroomPanel.vue`

- 引入 `useSplitPane`、`useAgentChatStore`、`useContentStore`、`setupContentIpc` 等
- 计算 `toolCallBlocks`：遍历 `agentChatStore.messages`（role=assistant）+ `agentChatStore.streamingBlocks`，提取 type=tool_call 的 block，逻辑与 EvolutionCenter 中完全一致
- 增加 `activeTab`、`selectedToolCallId` ref
- `watch(contentStore.content)` → 有新内容时自动切换到预览 Tab
- 模板：左侧 ChatView，右侧 ChatFunctionPanel，中间拖拽分割线

### `ChatView.vue`

- 新增 prop：`selectedToolCallId: string | null`
- 新增 emit：`select-tool-call: [id: string | null]`
- 透传给 ChatMessageList

### `ChatMessageList.vue`

- 新增 prop：`selectedToolCallId: string | null`
- 新增 emit：`select-tool-call: [id: string | null]`
- 透传给 ChatMessageAssistant（isLast 的那条或所有含 tool_call 的消息）

### `ChatMessageAssistant.vue`

- 新增 prop：`selectedToolCallId: string | null`
- 新增 emit：`select-tool-call: [id: string | null]`
- tool_call block 点击时 emit，选中高亮（border 或背景色变化）

## 数据流

```
agentChatStore.messages + streamingBlocks
  → toolCallBlocks（ChatroomPanel computed）
    → ChatFunctionPanel → ToolPanel

click tool_call block in ChatMessageAssistant
  → emit select-tool-call → ChatMessageList → ChatView → ChatroomPanel
    → selectedToolCallId → ChatFunctionPanel → ToolPanel highlight

contentStore.content（由 EvolutionCenter 的 setupContentIpc 统一维护）
  → ChatFunctionPanel → ContentDispatcher
    → interaction submit → agentChatStore.answerQuestion
```

## 注意事项

- `setupContentIpc` 已在 `EvolutionCenter.vue` 中初始化，chatroom 不需重复
- ChatFunctionPanel 与 evolab/FunctionPanel 完全独立，各自维护
- `components/function/` 中的 ToolPanel、ContentDispatcher 等为共享纯展示组件，两边均可引用
