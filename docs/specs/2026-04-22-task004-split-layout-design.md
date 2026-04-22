# TASK-004 设计文档：进化中心左右分栏布局

## 概述

实现进化中心的整体布局骨架：顶部标题栏 + 左侧对话区(35%) + 可拖拽分割线 + 右侧功能区(65%)。这是进化中心 UI 的基础框架，后续 TASK-005/006 将分别填充对话区和功能区的实际内容。

## 布局结构

```
┌──────────────────────────────────────────────────┐
│ [🔴🟡🟢 70px]  进化中心  Slime egg v0.1         │ ← 标题栏 48px
├────────────────┬─┬───────────────────────────────┤
│                │║│                               │
│    对话区      │║│         功能区                 │
│    35%         │║│         flex:1 (65%)           │
│  min 280px     │║│         min 320px              │
│                │║│                               │
└────────────────┴─┴───────────────────────────────┘
                  ↑ 可拖拽分割线（视觉1px，热区5px）
```

### 标题栏（48px）

- 左侧 70px 空白：为 macOS `hiddenInset` 红绿灯按钮预留空间
- 主标题：**进化中心**，15px，font-weight 600
- 副标题：**Slime egg v0.1**，12px，muted 颜色
- 整栏设置 `-webkit-app-region: drag` 实现窗口拖拽
- 底部 1px 边框分隔

### 主体区域（flex 水平布局）

- **左侧对话区**：默认宽度 35%，min-width 280px
- **分割线**：5px 宽拖拽热区，内部 1px 视觉线条
- **右侧功能区**：flex:1 占据剩余空间，min-width 320px

### 响应式行为

- 窗口 minWidth 已设为 900px（window.ts），布局不会低于此尺寸
- 拖拽约束：左侧 >= 280px，右侧 >= 320px（通过 useSplitPane 强制）

## 文件变更

### 改造：`src/renderer/src/views/EvolutionCenter.vue`

将占位页替换为真实布局容器：

- 顶部标题栏区域
- flex 主体：ChatPanel + 分割线 div + FunctionPanel
- 分割线绑定 `useSplitPane` 返回的事件和样式
- 左侧面板通过 `style.width = leftWidth + 'px'` 控制宽度

### 新建：`src/renderer/src/components/chat/ChatPanel.vue`

占位组件，居中显示"对话区"文字。满屏高度，等待 TASK-005 填充。

### 新建：`src/renderer/src/components/function/FunctionPanel.vue`

占位组件，居中显示"功能区"文字。满屏高度，等待 TASK-006 填充。

### 新建：`src/renderer/src/composables/useSplitPane.ts`

可拖拽分割线逻辑 composable：

**输入**：

- `containerRef: Ref<HTMLElement | null>` — 主体容器元素
- `defaultRatio: number` — 默认左侧比例（0.35）
- `minLeftPx: number` — 左侧最小宽度（280）
- `minRightPx: number` — 右侧最小宽度（320）

**输出**：

- `leftWidth: Ref<number>` — 左侧面板当前宽度（px）
- `isDragging: Ref<boolean>` — 是否正在拖拽
- `onMouseDown: (e: MouseEvent) => void` — 分割线 mousedown 处理
- `resetToDefault: () => void` — 双击重置为默认比例

**实现要点**：

- mousedown 在分割线上触发，mousemove/mouseup 监听在 document 上（避免鼠标移出分割线时丢失事件）
- 拖拽时设置 `user-select: none` 和 `cursor: col-resize` 到 body 上
- 拖拽结束恢复 body 样式
- 使用 `onUnmounted` 清理事件监听
- 窗口 resize 时重新计算约束（防止左侧宽度超出新容器范围）

## 样式方案

使用 TailwindCSS 类 + 少量内联 style（仅 `width` 动态绑定）：

- 标题栏：`h-12 flex items-center border-b border-border px-4`
- 主体：`flex flex-1 overflow-hidden`
- 分割线：`w-[5px] cursor-col-resize flex items-center justify-center hover:bg-border transition-colors`
- 占位面板：`flex h-full items-center justify-center text-muted-foreground`

亮/暗主题通过 Tailwind 语义色（`border-border`、`text-muted-foreground`、`bg-background`）自动兼容。

## 验收标准

1. 左右分栏布局正确：左侧默认 35%，右侧 65%
2. 标题栏显示"进化中心" + "Slime egg v0.1"，macOS 下可拖拽移动窗口
3. 分割线可拖拽调整左右比例，双击重置默认比例
4. 拖拽约束生效：左侧 >= 280px，右侧 >= 320px
5. 窗口缩放时布局自适应，不出现溢出或错乱
6. 亮/暗主题下视觉正常
7. 占位组件正确显示"对话区"/"功能区"
