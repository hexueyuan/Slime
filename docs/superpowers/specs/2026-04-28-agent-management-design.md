# Agent 管理 UX 设计

**日期**: 2026-04-28
**状态**: 已批准

## 背景

当前 Chatroom 中 Agent 管理入口分散且不完整：NewThread 有"新建 Agent"按钮，但没有查看已有 Agent 列表、编辑或删除的地方。需要将 Agent 管理统一收口到 Settings。

## 目标

- Settings 新增 Agent tab，支持新建/编辑/删除 Agent
- 移除 NewThread 中的"新建 Agent"按钮，保持 NewThread 职责单一（选择 Agent 发起对话）

## 改动范围

### 1. `SettingsDialog.vue`

- 左侧 nav 新增"Agent"tab 按钮，位于"通用"之后
- `activeTab` 类型扩展：`"profile" | "gateway" | "general" | "agents"`
- 右侧 content 区新增 `<AgentSettings v-else-if="activeTab === 'agents'" />`
- 对话框高度从 `h-[480px]` 调整为 `h-[560px]`，以容纳 Agent 列表

### 2. `AgentSettings.vue`（新建）

路径：`src/renderer/src/components/settings/AgentSettings.vue`

**布局**：
- 顶部：标题"Agent 管理" + 右侧"新建 Agent"按钮（Icon `lucide:plus`）
- 列表：每行包含：
  - `AgentAvatar` 组件（复用现有）
  - 名称（`text-sm text-foreground`）
  - 描述（`text-xs text-muted-foreground truncate`，无描述时显示"-"）
  - 内置标签（`agent.protected` 时显示"内置"badge，与 AgentEditDialog 风格一致）
  - 操作区：编辑按钮（`lucide:pencil`）+ 删除按钮（`lucide:trash-2`，protected agent 不显示）

**交互**：
- 点击编辑 → 打开 `AgentEditDialog`，传入 `agentId`
- 点击新建 → 打开 `AgentEditDialog`，不传 `agentId`
- 点击删除 → `window.confirm("确定删除该 Agent？")` → `agentStore.deleteAgent(id)` → `agentStore.fetchAgents()`
- `AgentEditDialog` `saved` 事件 → `agentStore.fetchAgents()`

**数据**：直接使用 `agentStore.agents`（含 disabled 的也显示，与 NewThread 只显示 enabledAgents 不同）

### 3. `NewThread.vue`

- 删除"新建 Agent"按钮及对应的 `$emit('openAgentEdit')` 调用
- 删除 `defineEmits` 中的 `openAgentEdit` 事件（若无其他使用方）
- `ChatroomPanel.vue` 中 `openAgentEdit` 相关调用同步移除

## 不改动

- `AgentEditDialog.vue`：完全复用，无需修改
- `agentStore`：`deleteAgent` 方法已存在，无需修改
- SessionList、ChatView、ChatFunctionPanel：不涉及

## 边界条件

- protected agent（HalAI）：可编辑（名称 disabled），不可删除
- Agent 列表为空时：显示"暂无 Agent"提示 + 新建按钮仍可用
- AgentSettings 内嵌 AgentEditDialog，通过局部 `ref` 控制 open/agentId 状态
