# UI 对齐 DeepChat Dark Mode 设计

## 概述

将 Slime UI 对齐 DeepChat 的 dark mode 视觉风格，涉及 5 项变更：增加侧边栏、悬浮输入框、明确分界线、重命名功能区、调整侧边栏/顶栏颜色。

## 变更清单

| #   | 变更                | 方案                                                            |
| --- | ------------------- | --------------------------------------------------------------- |
| 1   | 悬浮输入框          | absolute 定位 + 磨砂透明，消息滚过输入框下方                    |
| 2   | 对话区/工作区分界线 | 1px 实线（border-border），拖拽热区保持 ~8px                    |
| 3   | 功能区→工作区       | FunctionPanel 文案改名                                          |
| 4   | 新增侧边栏          | 窄图标栏 ~48px，仅一个"进化中心"按钮                            |
| 5   | 侧边栏/顶栏颜色     | 微弱色差，`oklch(0.18 0 0)` ≈ #222 vs 内容区 `oklch(0.145 0 0)` |

## 布局结构

当前：

```
+----------------------------------------------------------+
| Title Bar (h-12)                                         |
+----------------------------------------------------------+
| ChatPanel (35%)  | 5px分隔 | FunctionPanel (65%)          |
+----------------------------------------------------------+
```

目标：

```
+------+---------------------------------------------------+
| Side | Title Bar (h-12, bg-sidebar)                      |
| bar  +---------------------------------------------------+
| 48px | ChatPanel (35%) |1px| WorkArea (65%)               |
| bg-  |                 |   |                              |
| side |                 |   |                              |
+------+-----------------+---+------------------------------+
```

## 组件变更

### 1. 新建 `AppSidebar.vue`

- 位置：`src/renderer/src/components/AppSidebar.vue`
- 48px 宽，`bg-sidebar`，flex-col，items-center
- 顶部留出与 topbar 等高的空间（macOS 红绿灯区域）
- 一个图标按钮："进化中心"（active 状态高亮）

### 2. 修改 `EvolutionCenter.vue`

- 最外层从 flex-col 改为 flex-row：`Sidebar | 右侧内容区`
- 右侧内容区保持 flex-col：`TopBar | 主体`
- TopBar 去掉左侧 70px spacer（红绿灯空间由 Sidebar 承担）
- 分隔条视觉宽度从 5px 改为 1px

### 3. 修改 `ChatInput.vue`

- `sticky bottom-0` → `absolute bottom-0 left-0 right-0`
- ChatPanel 确保 `position: relative`
- 保留现有 `bg-card/30 backdrop-blur-lg` 磨砂效果
- 保留现有 SVG 回形针附件图标，不改动

### 4. 修改 `MessageList.vue`

- 底部 padding 增大至 ~80px，补偿悬浮输入框遮挡区域

### 5. 修改 `useSplitPane.ts` / 分隔条

- 视觉宽度：5px → 1px
- 拖拽热区：通过 padding 或伪元素保持 ~8px 可点击区域
- cursor 保持 `col-resize`

### 6. 修改 `main.css`

- 新增 CSS 变量 `--color-sidebar`：`:root` 中为亮色值，`.dark` 中为 `oklch(0.18 0 0)`
- 在 `@theme inline` 中注册 `--color-sidebar: var(--color-sidebar)` 使 `bg-sidebar` 可用

### 7. 修改 `FunctionPanel.vue`

- 文案 "功能区" → "工作区"

## 实现方案

就地修改现有组件，不抽取 AppShell 布局组件。理由：v0.1 只有一个页面（进化中心），提前抽象无实际收益，未来需要时再提取。

## 不做的事情

- 不实现侧边栏展开/折叠
- 不实现多页面路由
- 不修改现有消息组件样式
- 不改动附件图标或发送按钮样式
