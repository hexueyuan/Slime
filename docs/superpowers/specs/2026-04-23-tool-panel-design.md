# 工具面板设计 — 工具调用格式化展示

## 概述

在右侧功能区（FunctionPanel）新增"工具"tab，将对话中工具调用的详情从对话区抽离到独立面板展示。对话区保留精简的工具调用卡片，点击后右侧面板展示格式化的参数和响应。不同工具类型有定制化的展示渲染器。

## 动机

当前对话中工具调用展开后显示原始 JSON（`JSON.stringify(…, null, 2)`），exec 工具的 stdout 等长文本可读性差。将详情移到右侧面板：

1. 保持对话流干净
2. 详情有更多展示空间
3. 可按工具类型定制渲染

## 组件结构

```
FunctionPanel.vue (改造，新增 tab 切换)
├── Tab Bar: ["流程", "工具"]
├── WorkflowPanel.vue (现有，tab="流程")
└── ToolPanel.vue (新建，tab="工具")
      ├── 列表视图: ToolCallList.vue
      │     └── ToolCallListItem.vue
      └── 详情视图: ToolCallDetail.vue
            ├── ToolDetailExec.vue
            ├── ToolDetailRead.vue
            ├── ToolDetailEdit.vue
            ├── ToolDetailWrite.vue
            └── ToolDetailGeneric.vue
```

## FunctionPanel 改造

顶部新增 tab bar，包含"流程"和"工具"两个标签。默认显示"流程"tab（即现有 WorkflowPanel）。

Tab 状态 `activeTab: 'workflow' | 'tools'` 由父组件 EvolutionCenter 通过 props 传入，支持外部切换（对话区点击工具调用时自动切到"工具"tab）。

## ToolPanel 列表/详情两级导航

### 列表视图（ToolCallList）

显示当前会话所有工具调用，每行包含：

- 状态图标：loading=spinner, success=绿勾, error=红X
- 工具名称（粗体）
- 参数摘要（第一个参数值前 60 字符，灰色）

点击列表项 → 进入详情视图。

### 详情视图（ToolCallDetail）

顶部：`←` 返回按钮 + 状态图标 + 工具名 + 关键参数摘要。

根据 `block.tool_call.name` 分发到对应渲染器：

| 工具名 | 渲染器            | 展示方式                                                             |
| ------ | ----------------- | -------------------------------------------------------------------- |
| exec   | ToolDetailExec    | 命令代码块（蓝色左边线）+ stdout/stderr 分区滚动，隐藏 timeout_ms    |
| read   | ToolDetailRead    | 顶栏文件路径+行范围，内容带行号显示                                  |
| edit   | ToolDetailEdit    | 顶栏文件路径，红绿 diff 展示 old_text→new_text 变更                  |
| write  | ToolDetailWrite   | 顶栏文件路径+"新建/覆盖"标记，内容带行号（绿色左边线），底部写入结果 |
| 其余   | ToolDetailGeneric | 参数和响应分区显示格式化 JSON                                        |

### 各渲染器数据提取

从 `tool_call.params`（JSON 字符串）parse 后提取字段：

**exec**: `params.command` → 代码块；`response.stdout` / `response.stderr` → 分区文本输出。

**read**: `params.path` → 顶栏路径；`params.offset`/`params.limit` → 行范围标注；响应文本按行号显示。

**edit**: `params.path` → 顶栏路径；`params.old_text`/`params.new_text` → 计算行级 diff，红色标删除行，绿色标新增行；响应显示 success/fail。

**write**: `params.path` → 顶栏路径；`params.content` → 带行号全文显示（绿色左边线标记为新增）；响应显示写入结果状态。

v0.1 不做语法高亮，纯等宽文本展示。

## 状态管理与数据流

### 数据源

不新建 store。数据源复用现有 `chatStore`：

- 流式期间：`chatStore.streamingBlocks`
- 历史消息：`message.content` 解析后的 blocks

ToolPanel 展示的工具调用范围：当前正在流式生成的消息的 tool_call blocks。具体来说：

- 流式期间：从 `streamingBlocks` 过滤 `type === 'tool_call'`
- 流式结束后：从最后一条 assistant 消息的 parsed blocks 中过滤
- 用户发送新消息后：清空，等待新的工具调用出现

ToolPanel 通过 props 接收已过滤的 toolCallBlocks，不自己访问 store。数据过滤在 EvolutionCenter 中完成。

### 选中状态

在 EvolutionCenter 中维护：

- `activeTab: Ref<'workflow' | 'tools'>` — 当前 tab
- `selectedToolCallId: Ref<string | null>` — 选中的 tool call ID，null 时显示列表

通过 props 向下传递给 FunctionPanel → ToolPanel。

### 对话区 → 右侧面板通信

MessageBlockToolCall 点击 → emit `select-tool-call(blockId)` → 冒泡到 EvolutionCenter → 设置 `selectedToolCallId = blockId` + `activeTab = 'tools'`。

### 流式更新

流式期间 streamingBlocks 持续更新，ToolPanel 的 computed 自动响应。新工具调用出现时列表自动增长，正在执行的工具 status=loading 显示 spinner。

## 对话区改造

### MessageBlockToolCall 变更

- 移除展开/折叠逻辑（删除 `expanded` ref 和展开区 `<div v-if="expanded">`）
- 保留折叠卡片：状态图标 + 工具名 + 参数摘要 + 右侧箭头改为外部链接图标
- 点击整个卡片 → emit `select-tool-call(block.id)`
- 选中态：卡片高亮边框（`border-primary`）

### 选中态传递

MessageItemAssistant 接收 `selectedToolCallId` prop，传递给每个 MessageBlockToolCall 用于高亮判断。

## 涉及文件

### 新建

- `src/renderer/src/components/function/ToolPanel.vue`
- `src/renderer/src/components/function/ToolCallList.vue`
- `src/renderer/src/components/function/ToolCallListItem.vue`
- `src/renderer/src/components/function/ToolCallDetail.vue`
- `src/renderer/src/components/function/details/ToolDetailExec.vue`
- `src/renderer/src/components/function/details/ToolDetailRead.vue`
- `src/renderer/src/components/function/details/ToolDetailEdit.vue`
- `src/renderer/src/components/function/details/ToolDetailWrite.vue`
- `src/renderer/src/components/function/details/ToolDetailGeneric.vue`

### 修改

- `src/renderer/src/components/function/FunctionPanel.vue` — 加 tab 切换
- `src/renderer/src/components/message/MessageBlockToolCall.vue` — 移除展开，加点击 emit
- `src/renderer/src/components/message/MessageItemAssistant.vue` — 传递 selectedToolCallId
- `src/renderer/src/components/chat/MessageList.vue` — 传递 selectedToolCallId
- `src/renderer/src/components/chat/ChatPanel.vue` — 传递 selectedToolCallId + emit 冒泡
- `src/renderer/src/views/EvolutionCenter.vue` — 维护 activeTab + selectedToolCallId 状态

### 测试

- 新建对应的 `test/renderer/components/` 测试文件
- 修改 `MessageBlockToolCall.test.ts` 适配新行为
