# UI 对齐 DeepChat Dark Mode 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Slime UI 对齐 DeepChat 的 dark mode 视觉风格——增加侧边栏、悬浮输入框、1px 分界线、颜色微调、重命名。

**Architecture:** 就地修改 EvolutionCenter.vue 布局为 `Sidebar | (TopBar + Content)`。新建 AppSidebar.vue 组件。ChatInput 从 sticky 改为 absolute 悬浮。分隔条从 5px 改为 1px。新增 CSS 变量 `--color-sidebar`。

**Tech Stack:** Vue 3 Composition API, TailwindCSS v4, Vitest, Vue Test Utils

---

## File Structure

| Action | File                                                     | Responsibility                           |
| ------ | -------------------------------------------------------- | ---------------------------------------- |
| Create | `src/renderer/src/components/AppSidebar.vue`             | 48px 窄图标侧边栏                        |
| Create | `test/renderer/components/AppSidebar.test.ts`            | 侧边栏测试                               |
| Modify | `src/renderer/src/assets/main.css`                       | 新增 `--color-sidebar` CSS 变量          |
| Modify | `src/renderer/src/views/EvolutionCenter.vue`             | 布局重构：sidebar + topbar + 1px divider |
| Modify | `src/renderer/src/components/chat/ChatInput.vue`         | sticky → absolute 悬浮                   |
| Modify | `src/renderer/src/components/chat/MessageList.vue`       | 底部 padding 补偿                        |
| Modify | `src/renderer/src/components/function/FunctionPanel.vue` | 文案改名                                 |

---

### Task 1: 新增 sidebar CSS 变量

**Files:**

- Modify: `src/renderer/src/assets/main.css:9-55`

- [ ] **Step 1: 在 `:root` 中新增 `--color-sidebar` light 值**

在 `main.css` 的 `:root` 块末尾（第 22 行 `--color-destructive-foreground` 之后）添加：

```css
--color-sidebar: oklch(0.97 0 0);
```

- [ ] **Step 2: 在 `.dark` 中新增 `--color-sidebar` dark 值**

在 `.dark` 块末尾（第 38 行之后）添加：

```css
--color-sidebar: oklch(0.18 0 0);
```

- [ ] **Step 3: 在 `@theme inline` 中注册 sidebar token**

在 `@theme inline` 块末尾（第 54 行之后）添加：

```css
--color-sidebar: var(--color-sidebar);
```

- [ ] **Step 4: 验证无语法错误**

Run: `pnpm run typecheck`
Expected: 无报错

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(css): add --color-sidebar theme variable"
```

---

### Task 2: 创建 AppSidebar 组件

**Files:**

- Create: `src/renderer/src/components/AppSidebar.vue`
- Create: `test/renderer/components/AppSidebar.test.ts`

- [ ] **Step 1: 编写 AppSidebar 测试**

创建 `test/renderer/components/AppSidebar.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppSidebar from "@/components/AppSidebar.vue";

describe("AppSidebar", () => {
  it("should render sidebar with fixed width", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="app-sidebar"]').exists()).toBe(true);
  });

  it("should render evolution center icon button", () => {
    const wrapper = mount(AppSidebar);
    expect(wrapper.find('[data-testid="sidebar-evolution"]').exists()).toBe(true);
  });

  it("should have active state on evolution button by default", () => {
    const wrapper = mount(AppSidebar);
    const btn = wrapper.find('[data-testid="sidebar-evolution"]');
    expect(btn.classes()).toContain("bg-muted");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/renderer/components/AppSidebar.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 AppSidebar 组件**

创建 `src/renderer/src/components/AppSidebar.vue`：

```vue
<template>
  <div
    data-testid="app-sidebar"
    class="flex w-12 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-12"
  >
    <button
      data-testid="sidebar-evolution"
      class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground"
      title="进化中心"
    >
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        <path d="m5.6 5.6 2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" />
      </svg>
    </button>
  </div>
</template>
```

说明：`pt-12` (48px) 为顶部 topbar 等高的留白，给 macOS 红绿灯腾空间。`w-12` = 48px。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/AppSidebar.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AppSidebar.vue test/renderer/components/AppSidebar.test.ts
git commit -m "feat: add AppSidebar component with evolution center icon"
```

---

### Task 3: 重构 EvolutionCenter 布局

**Files:**

- Modify: `src/renderer/src/views/EvolutionCenter.vue`

- [ ] **Step 1: 重构 EvolutionCenter.vue**

将整个 `EvolutionCenter.vue` 改为：

```vue
<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
import { ref } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import { useSplitPane } from "../composables/useSplitPane";

const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, isDragging, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
});
</script>

<template>
  <div class="flex h-full flex-row">
    <!-- Sidebar -->
    <AppSidebar />

    <!-- Right content area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Title Bar -->
      <div
        class="flex h-12 shrink-0 items-center border-b border-border bg-sidebar px-4"
        style="-webkit-app-region: drag"
      >
        <span class="text-[15px] font-semibold">进化中心</span>
        <span class="ml-3 text-xs text-muted-foreground">Slime egg v0.1</span>
      </div>

      <!-- Main Content -->
      <div ref="mainRef" class="flex flex-1 overflow-hidden">
        <!-- Left: Chat Panel -->
        <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
          <ChatPanel />
        </div>

        <!-- Draggable Divider: 1px visual, wider hit area -->
        <div
          class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
          @mousedown="onMouseDown"
          @dblclick="resetToDefault"
        >
          <!-- Invisible wider hit area -->
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>

        <!-- Right: Work Area -->
        <div class="min-w-[320px] flex-1 overflow-hidden">
          <FunctionPanel />
        </div>
      </div>
    </div>
  </div>
</template>
```

关键变更：

- 最外层从 `flex-col` → `flex-row`，加入 `AppSidebar`
- 右侧内容区用 `flex-col` 包裹 TopBar + 主体
- TopBar 加 `bg-sidebar`，去掉 70px spacer（红绿灯空间由 sidebar 承担）
- 分隔条从 `w-[5px]` → `w-px`（1px），用 `absolute -left-1 -right-1` 扩大拖拽热区到 ~8px
- 移除分隔条内的 `h-10 w-px rounded-full bg-border` 小装饰条
- 移除 `isDragging` 相关的动态 class（1px 下不需要高亮反馈）

- [ ] **Step 2: 运行现有测试确认不破坏**

Run: `pnpm test`
Expected: 全部 PASS（如果有 EvolutionCenter 相关测试失败需要对应修复）

- [ ] **Step 3: 手动验证（pnpm run dev）**

Run: `pnpm run dev`
验证：

- 左侧出现 48px 宽侧边栏，背景比主内容区稍亮
- 顶栏背景与侧边栏一致
- 分隔条为 1px，拖拽仍可用
- 红绿灯按钮位于侧边栏顶部区域

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/views/EvolutionCenter.vue
git commit -m "feat: restructure layout with sidebar and 1px divider"
```

---

### Task 4: ChatInput 悬浮定位

**Files:**

- Modify: `src/renderer/src/components/chat/ChatInput.vue:2-6`
- Modify: `src/renderer/src/components/chat/MessageList.vue:3`

- [ ] **Step 1: 修改 ChatInput 定位**

在 `ChatInput.vue` 中，将第 2 行的外层 div class 从：

```html
<div class="sticky bottom-0 z-10 px-6 pb-3"></div>
```

改为：

```html
<div class="absolute bottom-0 left-0 right-0 z-10 px-6 pb-3"></div>
```

- [ ] **Step 2: 删除渐变遮罩**

删除 ChatInput.vue 中第 4-6 行的渐变遮罩 div（absolute 定位后不再需要从 sticky 过渡的遮罩）：

```html
<!-- 渐变遮罩 -->
<div
  class="pointer-events-none absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-background"
/>
```

- [ ] **Step 3: 增加 MessageList 底部 padding**

在 `MessageList.vue` 中，将第 3 行的内层容器 class 从：

```html
<div class="mx-auto w-full space-y-1 px-6 py-6"></div>
```

改为：

```html
<div class="mx-auto w-full space-y-1 px-6 pt-6 pb-24"></div>
```

`pb-24`（96px）补偿悬浮输入框的高度，确保底部消息不被遮挡。

- [ ] **Step 4: 运行现有测试**

Run: `pnpm test -- test/renderer/components/ChatInput.test.ts test/renderer/components/MessageList.test.ts test/renderer/components/ChatPanel.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 手动验证（pnpm run dev）**

验证：

- 输入框固定在对话区底部，不随消息滚动
- 消息可以滚动到输入框下方，透过磨砂背景隐约可见
- 滚到底部时最后一条消息不被输入框遮挡

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/chat/ChatInput.vue src/renderer/src/components/chat/MessageList.vue
git commit -m "feat: make ChatInput float with backdrop blur overlay"
```

---

### Task 5: FunctionPanel 重命名 + 格式化 + 全量测试

**Files:**

- Modify: `src/renderer/src/components/function/FunctionPanel.vue`

- [ ] **Step 1: 修改 FunctionPanel 文案**

将 `FunctionPanel.vue` 中的 "功能区" 改为 "工作区"：

```html
<template>
  <div class="flex h-full items-center justify-center text-muted-foreground">工作区</div>
</template>
```

- [ ] **Step 2: 运行格式化和 lint**

Run: `pnpm run format && pnpm run lint`
Expected: 无报错

- [ ] **Step 3: 运行全量测试**

Run: `pnpm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/function/FunctionPanel.vue
git commit -m "feat: rename FunctionPanel text to 工作区"
```

- [ ] **Step 5: 运行 typecheck 做最终验证**

Run: `pnpm run typecheck`
Expected: 无报错
