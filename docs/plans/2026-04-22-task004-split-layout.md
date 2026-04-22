# TASK-004 进化中心左右分栏布局 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 EvolutionCenter 从占位页改造为左右分栏布局骨架，含标题栏、可拖拽分割线和两个占位面板。

**Architecture:** EvolutionCenter.vue 作为布局容器，引用 ChatPanel/FunctionPanel 占位组件。拖拽逻辑抽取到 useSplitPane composable 中，通过 mousedown/mousemove/mouseup 事件实现，返回响应式的 leftWidth 值驱动布局。

**Tech Stack:** Vue 3 Composition API, TailwindCSS, Vitest + jsdom + Vue Test Utils

---

## 文件结构

| 操作 | 文件                                                     | 职责                           |
| ---- | -------------------------------------------------------- | ------------------------------ |
| 新建 | `src/renderer/src/composables/useSplitPane.ts`           | 可拖拽分割线逻辑 composable    |
| 新建 | `src/renderer/src/components/chat/ChatPanel.vue`         | 左侧对话区占位                 |
| 新建 | `src/renderer/src/components/function/FunctionPanel.vue` | 右侧功能区占位                 |
| 改造 | `src/renderer/src/views/EvolutionCenter.vue`             | 布局容器（标题栏+分栏+分割线） |
| 新建 | `test/renderer/composables/useSplitPane.test.ts`         | useSplitPane 单测              |
| 改造 | `test/renderer/App.test.ts`                              | 更新为分栏布局断言             |

---

### Task 1: useSplitPane composable

**Files:**

- Create: `src/renderer/src/composables/useSplitPane.ts`
- Create: `test/renderer/composables/useSplitPane.test.ts`

- [ ] **Step 1: Write failing tests for useSplitPane**

```ts
// test/renderer/composables/useSplitPane.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { useSplitPane } from "@/composables/useSplitPane";

function createMockContainer(width: number) {
  return ref({
    clientWidth: width,
  } as unknown as HTMLElement);
}

describe("useSplitPane", () => {
  it("should initialize leftWidth based on defaultRatio", () => {
    const container = createMockContainer(1000);
    const { leftWidth } = useSplitPane({ containerRef: container, defaultRatio: 0.35 });
    expect(leftWidth.value).toBe(350);
  });

  it("should return 0 when container is null", () => {
    const container = ref(null);
    const { leftWidth } = useSplitPane({ containerRef: container, defaultRatio: 0.35 });
    expect(leftWidth.value).toBe(0);
  });

  it("should clamp to minLeftPx", () => {
    const container = createMockContainer(500);
    const { leftWidth } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.1,
      minLeftPx: 280,
    });
    expect(leftWidth.value).toBe(280);
  });

  it("should clamp to respect minRightPx", () => {
    const container = createMockContainer(500);
    const { leftWidth } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.9,
      minRightPx: 320,
    });
    // 500 - 320 = 180
    expect(leftWidth.value).toBe(180);
  });

  it("should not be dragging initially", () => {
    const container = createMockContainer(1000);
    const { isDragging } = useSplitPane({ containerRef: container });
    expect(isDragging.value).toBe(false);
  });

  it("should update leftWidth on mouse drag", async () => {
    const container = createMockContainer(1000);
    const { leftWidth, isDragging, onMouseDown } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });
    expect(leftWidth.value).toBe(350);

    // Start drag
    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));
    expect(isDragging.value).toBe(true);

    // Move mouse to x=400 (delta +50)
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    await nextTick();
    expect(leftWidth.value).toBe(400);

    // Release
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(isDragging.value).toBe(false);
  });

  it("should clamp during drag", async () => {
    const container = createMockContainer(1000);
    const { leftWidth, onMouseDown } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });

    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));

    // Drag far left — should clamp to minLeftPx
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }));
    await nextTick();
    expect(leftWidth.value).toBe(280);

    // Drag far right — should clamp to containerWidth - minRightPx
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 900 }));
    await nextTick();
    expect(leftWidth.value).toBe(680);

    document.dispatchEvent(new MouseEvent("mouseup"));
  });

  it("should reset to default ratio", () => {
    const container = createMockContainer(1000);
    const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
      containerRef: container,
      defaultRatio: 0.35,
      minLeftPx: 280,
      minRightPx: 320,
    });

    // Simulate drag to change width
    onMouseDown(new MouseEvent("mousedown", { clientX: 350 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(leftWidth.value).toBe(500);

    // Reset
    resetToDefault();
    expect(leftWidth.value).toBe(350);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- --project renderer --run test/renderer/composables/useSplitPane.test.ts`
Expected: FAIL — module `@/composables/useSplitPane` not found

- [ ] **Step 3: Implement useSplitPane**

```ts
// src/renderer/src/composables/useSplitPane.ts
import { ref, watch, onUnmounted, type Ref } from "vue";

interface UseSplitPaneOptions {
  containerRef: Ref<HTMLElement | null>;
  defaultRatio?: number;
  minLeftPx?: number;
  minRightPx?: number;
}

export function useSplitPane(options: UseSplitPaneOptions) {
  const { containerRef, defaultRatio = 0.35, minLeftPx = 280, minRightPx = 320 } = options;

  const leftWidth = ref(0);
  const isDragging = ref(false);

  function clamp(value: number): number {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) return 0;
    const max = containerWidth - minRightPx;
    return Math.min(Math.max(value, minLeftPx), max);
  }

  function recalc() {
    const containerWidth = containerRef.value?.clientWidth ?? 0;
    if (containerWidth === 0) {
      leftWidth.value = 0;
      return;
    }
    leftWidth.value = clamp(containerWidth * defaultRatio);
  }

  // Init + watch container changes
  watch(containerRef, () => recalc(), { immediate: true });

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    leftWidth.value = clamp(startWidth + delta);
  }

  function onMouseUp() {
    isDragging.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startWidth = leftWidth.value;
    isDragging.value = true;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resetToDefault() {
    recalc();
  }

  // Handle window resize
  function onResize() {
    leftWidth.value = clamp(leftWidth.value);
  }

  window.addEventListener("resize", onResize);
  onUnmounted(() => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  });

  return { leftWidth, isDragging, onMouseDown, resetToDefault };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- --project renderer --run test/renderer/composables/useSplitPane.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/composables/useSplitPane.ts test/renderer/composables/useSplitPane.test.ts
git commit -m "feat: add useSplitPane composable with tests"
```

---

### Task 2: ChatPanel 和 FunctionPanel 占位组件

**Files:**

- Create: `src/renderer/src/components/chat/ChatPanel.vue`
- Create: `src/renderer/src/components/function/FunctionPanel.vue`

- [ ] **Step 1: Create ChatPanel.vue**

```vue
<!-- src/renderer/src/components/chat/ChatPanel.vue -->
<template>
  <div class="flex h-full items-center justify-center text-muted-foreground">对话区</div>
</template>
```

- [ ] **Step 2: Create FunctionPanel.vue**

```vue
<!-- src/renderer/src/components/function/FunctionPanel.vue -->
<template>
  <div class="flex h-full items-center justify-center text-muted-foreground">功能区</div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatPanel.vue src/renderer/src/components/function/FunctionPanel.vue
git commit -m "feat: add ChatPanel and FunctionPanel placeholder components"
```

---

### Task 3: 改造 EvolutionCenter.vue

**Files:**

- Modify: `src/renderer/src/views/EvolutionCenter.vue`

- [ ] **Step 1: Rewrite EvolutionCenter.vue**

Replace entire file content with:

```vue
<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
import { ref } from "vue";
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
  <div class="flex h-full flex-col">
    <!-- Title Bar -->
    <div
      class="flex h-12 shrink-0 items-center border-b border-border px-4"
      style="-webkit-app-region: drag"
    >
      <div class="w-[70px] shrink-0" />
      <span class="text-[15px] font-semibold">进化中心</span>
      <span class="ml-3 text-xs text-muted-foreground">Slime egg v0.1</span>
    </div>

    <!-- Main Content -->
    <div ref="mainRef" class="flex flex-1 overflow-hidden">
      <!-- Left: Chat Panel -->
      <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
        <ChatPanel />
      </div>

      <!-- Draggable Divider -->
      <div
        class="flex w-[5px] shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-border"
        :class="{ 'bg-border': isDragging }"
        @mousedown="onMouseDown"
        @dblclick="resetToDefault"
      >
        <div class="h-10 w-px rounded-full bg-border" />
      </div>

      <!-- Right: Function Panel -->
      <div class="min-w-[320px] flex-1 overflow-hidden">
        <FunctionPanel />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Run format and lint**

```bash
pnpm run format
pnpm run lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/EvolutionCenter.vue
git commit -m "feat: implement split layout for EvolutionCenter"
```

---

### Task 4: 更新 App.test.ts

**Files:**

- Modify: `test/renderer/App.test.ts`

- [ ] **Step 1: Update test to match new layout**

Replace entire file content with:

```ts
// test/renderer/App.test.ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import EvolutionCenter from "@/views/EvolutionCenter.vue";

// Mock window.addEventListener/removeEventListener for resize handler in useSplitPane
vi.stubGlobal("addEventListener", vi.fn());
vi.stubGlobal("removeEventListener", vi.fn());

describe("EvolutionCenter", () => {
  it("should render title bar with main title and subtitle", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain("进化中心");
    expect(wrapper.text()).toContain("Slime egg v0.1");
  });

  it("should render chat and function panels", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain("对话区");
    expect(wrapper.text()).toContain("功能区");
  });

  it("should render draggable divider", () => {
    const wrapper = mount(EvolutionCenter, {
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    });
    const divider = wrapper.find(".cursor-col-resize");
    expect(divider.exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm test -- --run
```

Expected: all tests PASS

- [ ] **Step 3: Run format and lint**

```bash
pnpm run format
pnpm run lint
```

- [ ] **Step 4: Commit**

```bash
git add test/renderer/App.test.ts
git commit -m "test: update App.test for split layout"
```

---

### Task 5: 最终验证

- [ ] **Step 1: Run full test suite**

```bash
pnpm test -- --run
```

Expected: all tests PASS (main + renderer projects)

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

Expected: no type errors

- [ ] **Step 3: Run dev server and visual verification**

```bash
pnpm run dev
```

Verify in the running app:

1. 标题栏显示"进化中心" + "Slime egg v0.1"
2. 左侧 35% 显示"对话区"，右侧 65% 显示"功能区"
3. 拖拽分割线可调整比例
4. 双击分割线重置为 35/65
5. macOS 标题栏可拖拽移动窗口
6. 窗口缩至 900px 最小宽度时布局不错乱
