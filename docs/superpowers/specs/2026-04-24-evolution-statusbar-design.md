# Evolution StatusBar 设计

## 概述

将进化流程从功能面板"流程"tab 搬到对话区上方的独立横条，提供更直观的进化状态展示。同时增加"丢弃进化"重置功能，支持回退代码并清空对话。

## 变更范围

### 新增

- `EvolutionStatusBar.vue`：横向进化状态条组件
- `SessionPresenter.clearMessages(sessionId)`：清空指定会话消息的后端方法
- `messageStore.clearAll()`：前端清空消息状态

### 删除

- `SessionBar.vue`：不再需要标题栏
- `GeneratingIndicator.vue`：不再需要生成阶段指示器
- `EvolutionPanel.vue`：功能完全由 EvolutionStatusBar 接管
- FunctionPanel 的"流程"tab

### 修改

- `EvolutionCenter.vue`：引入 EvolutionStatusBar，移除 SessionBar
- `FunctionPanel.vue`：去掉"流程"tab，只保留"工具"和"预览"
- `ChatPanel.vue`：移除 SessionBar 引用和 generating phase 逻辑

## EvolutionStatusBar 组件

### 可见性规则

| 条件                               | 横条状态     |
| ---------------------------------- | ------------ |
| stage 为 discuss/coding/applying   | 显示进行中态 |
| stage 为 idle 且 completedTag 存在 | 显示完成态   |
| stage 为 idle 且无 completedTag    | 完全隐藏     |

### 进行中态

横向 stepper 展示三个阶段：需求澄清(discuss) → 执行进化(coding) → 应用变更(applying)。

- 已完成阶段：绿色实心 dot + 绿色连接线 + 绿色文字
- 当前阶段：primary 色实心 dot（带 glow）+ 加粗文字
- 未到达阶段：灰色空心 dot + 灰色连接线 + 灰色文字
- 右侧显示"丢弃进化"按钮（红色描边）

### 完成态

三步全绿 + "✓ 进化完成" 标签 + tag 文字（monospace）+ 右侧"重启以生效"按钮。

### 丢弃进化流程

1. 用户点击"丢弃进化"按钮
2. 弹出确认 Dialog："确认丢弃进化？此操作将丢弃本次进化的所有代码修改，回退到进化开始前的状态，并清空当前对话记录。此操作不可恢复。"
3. 用户点击"确认丢弃"
4. 调用 `evolutionPresenter.cancel()`（内部执行 git rollback 到 startCommit）
5. 调用 `sessionPresenter.clearMessages(activeSessionId)`
6. 前端调用 `messageStore.clearAll()` 清空消息状态

## 布局结构

```
EvolutionCenter.vue
├── drag area (h-9)
└── flex row
    ├── AppSidebar
    └── mainRef container
        ├── EvolutionStatusBar (条件显示)
        └── split area (flex row)
            ├── ChatPanel (无 SessionBar)
            ├── divider
            └── FunctionPanel (工具 | 预览)
```

## 后端改动

### SessionPresenter.clearMessages(sessionId: string)

清空指定会话的所有消息记录。实现方式：将 `messages/{sessionId}.json` 写为空数组。

## FunctionPanel 精简

移除"流程"tab，`activeTab` 类型从 `"workflow" | "tools" | "preview"` 改为 `"tools" | "preview"`，默认 tab 改为 `"tools"`。

## 删除文件

- `src/renderer/src/components/chat/SessionBar.vue`
- `src/renderer/src/components/chat/GeneratingIndicator.vue`（如存在）
- `src/renderer/src/components/function/EvolutionPanel.vue`
- 相关测试文件
