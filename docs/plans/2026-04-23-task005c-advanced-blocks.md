# TASK-005c 高级内容块 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为助手消息添加 reasoning、tool_call、error、image block 渲染和消息工具栏

**Architecture:** 在 MessageItemAssistant 的 v-for 分发中新增 4 个 block 组件 + 1 个 toolbar 组件，均为纯展示组件，props 驱动，无 store 依赖

**Tech Stack:** Vue 3 + TypeScript + TailwindCSS v4 + markstream-vue + lucide 图标（内联 SVG）

---

### Task 1: MessageBlockReasoning 组件

**Files:**

- Create: `src/renderer/src/components/message/MessageBlockReasoning.vue`
- Test: `test/renderer/components/MessageBlockReasoning.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/MessageBlockReasoning.test.ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("markstream-vue", () => ({
  default: {
    name: "NodeRenderer",
    props: ["content", "customId", "isDark"],
    template: '<div class="mock-node-renderer">{{ content }}</div>',
  },
}));

import MessageBlockReasoning from "@/components/message/MessageBlockReasoning.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockReasoning", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "reasoning_content",
    content: "thinking about the problem...",
    status: "success",
    timestamp: Date.now(),
    reasoning_time: { start: 1000, end: 4500 },
    ...overrides,
  });

  it("should render collapsed by default with duration", () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("3.5");
    expect(wrapper.find(".mock-node-renderer").exists()).toBe(false);
  });

  it("should expand on click to show content", async () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="reasoning-toggle"]').trigger("click");
    expect(wrapper.find(".mock-node-renderer").exists()).toBe(true);
    expect(wrapper.text()).toContain("thinking about the problem...");
  });

  it("should show loading state with pulse animation", () => {
    const wrapper = mount(MessageBlockReasoning, {
      props: {
        block: makeBlock({ status: "loading", reasoning_time: { start: Date.now(), end: 0 } }),
      },
    });
    expect(wrapper.find(".animate-pulse").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockReasoning.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/message/MessageBlockReasoning.vue -->
<template>
  <div class="w-full">
    <!-- 折叠/展开头部 -->
    <button
      data-testid="reasoning-toggle"
      class="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
      @click="expanded = !expanded"
    >
      <!-- 图标 -->
      <svg
        v-if="isLoading"
        class="h-3.5 w-3.5 animate-pulse"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
      <svg
        v-else
        class="h-3.5 w-3.5 transition-transform"
        :class="{ 'rotate-90': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span>{{ headerText }}</span>
    </button>
    <!-- 展开内容 -->
    <div v-if="expanded" class="mt-2 pl-5">
      <div class="prose prose-sm dark:prose-invert max-w-none text-xs leading-4 text-white/50">
        <NodeRenderer
          :content="block.content || ''"
          :custom-id="`reasoning-${block.timestamp}`"
          :is-dark="true"
        />
      </div>
      <!-- loading 尾部脉冲 -->
      <div v-if="isLoading" class="mt-1">
        <svg class="h-3 w-3 text-white/30 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import NodeRenderer from "markstream-vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const expanded = ref(false);

const isLoading = computed(() => props.block.status === "loading");

const durationSeconds = computed(() => {
  const rt = props.block.reasoning_time;
  if (!rt) return 0;
  const end = rt.end || Date.now();
  return ((end - rt.start) / 1000).toFixed(1);
});

const headerText = computed(() => {
  if (isLoading.value) return `正在思考... ${durationSeconds.value}秒`;
  return `已深度思考（用时 ${durationSeconds.value} 秒）`;
});
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockReasoning.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageBlockReasoning.vue test/renderer/components/MessageBlockReasoning.test.ts
git commit -m "feat: add MessageBlockReasoning with collapse/expand"
```

---

### Task 2: MessageBlockToolCall 组件

**Files:**

- Create: `src/renderer/src/components/message/MessageBlockToolCall.vue`
- Test: `test/renderer/components/MessageBlockToolCall.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/MessageBlockToolCall.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockToolCall from "@/components/message/MessageBlockToolCall.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockToolCall", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "tool_call",
    content: "",
    status: "success",
    timestamp: Date.now(),
    tool_call: { name: "search", params: '{"query":"hello"}', response: '{"result":"found"}' },
    ...overrides,
  });

  it("should render tool name", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("search");
  });

  it("should show loading spinner when status is loading", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock({ status: "loading" }) },
    });
    expect(wrapper.find(".animate-spin").exists()).toBe(true);
  });

  it("should show success icon when status is success", () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    expect(wrapper.find('[data-testid="tool-status-success"]').exists()).toBe(true);
  });

  it("should expand to show params on click", async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    });
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger("click");
    expect(wrapper.text()).toContain('"query"');
    expect(wrapper.text()).toContain('"hello"');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockToolCall.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/message/MessageBlockToolCall.vue -->
<template>
  <div class="w-full max-w-3xl">
    <!-- Pill 触发器 -->
    <button
      data-testid="tool-call-toggle"
      class="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      @click="expanded = !expanded"
    >
      <!-- 状态图标 -->
      <svg
        v-if="block.status === 'loading'"
        class="h-3.5 w-3.5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <svg
        v-else-if="block.status === 'error'"
        data-testid="tool-status-error"
        class="h-3.5 w-3.5 text-destructive"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
      <svg
        v-else
        data-testid="tool-status-success"
        class="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <!-- 工具名 -->
      <span class="font-medium">{{ block.tool_call?.name || "unknown" }}</span>
      <!-- 参数摘要 -->
      <span class="truncate text-muted-foreground/70">{{ paramsSummary }}</span>
      <!-- 展开箭头 -->
      <svg
        class="ml-auto h-3 w-3 shrink-0 transition-transform"
        :class="{ 'rotate-90': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
    <!-- 展开详情 -->
    <div v-if="expanded" class="mt-1.5 space-y-1.5 pl-3">
      <!-- 参数 -->
      <div v-if="block.tool_call?.params" class="rounded-md border border-border bg-muted/30 p-2">
        <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">参数</div>
        <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{
          formattedParams
        }}</pre>
      </div>
      <!-- 响应 -->
      <div v-if="block.tool_call?.response" class="rounded-md border border-border bg-muted/30 p-2">
        <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">响应</div>
        <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{
          formattedResponse
        }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const expanded = ref(false);

const paramsSummary = computed(() => {
  try {
    const params = JSON.parse(props.block.tool_call?.params || "{}");
    const firstValue = Object.values(params)[0];
    if (typeof firstValue === "string") return firstValue.slice(0, 60);
    return JSON.stringify(firstValue).slice(0, 60);
  } catch {
    return "";
  }
});

const formattedParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.params || "{}"), null, 2);
  } catch {
    return props.block.tool_call?.params || "";
  }
});

const formattedResponse = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.response || ""), null, 2);
  } catch {
    return props.block.tool_call?.response || "";
  }
});
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockToolCall.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageBlockToolCall.vue test/renderer/components/MessageBlockToolCall.test.ts
git commit -m "feat: add MessageBlockToolCall with collapsible params"
```

---

### Task 3: MessageBlockError 组件

**Files:**

- Create: `src/renderer/src/components/message/MessageBlockError.vue`
- Test: `test/renderer/components/MessageBlockError.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/MessageBlockError.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockError from "@/components/message/MessageBlockError.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockError", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "error",
    content: "API rate limit exceeded",
    status: "error",
    timestamp: Date.now(),
    ...overrides,
  });

  it("should render error message", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock() },
    });
    expect(wrapper.text()).toContain("API rate limit exceeded");
  });

  it("should have red styling", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock() },
    });
    expect(wrapper.find(".border-red-500").exists()).toBe(true);
  });

  it("should render cancel state with muted style", () => {
    const wrapper = mount(MessageBlockError, {
      props: { block: makeBlock({ status: "cancel", content: "已取消" }) },
    });
    expect(wrapper.find(".text-muted-foreground").exists()).toBe(true);
    expect(wrapper.text()).toContain("已取消");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockError.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/message/MessageBlockError.vue -->
<template>
  <!-- Cancel 状态 -->
  <div
    v-if="block.status === 'cancel'"
    class="flex items-center gap-1.5 text-sm text-muted-foreground"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L3.34 4.74A9.75 9.75 0 0 0 3 12" />
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L20.66 19.26A9.75 9.75 0 0 0 21 12" />
    </svg>
    <span>{{ block.content || "已取消" }}</span>
  </div>
  <!-- Error 状态 -->
  <div v-else class="w-full rounded-md border-l-2 border-red-500 bg-red-500/5 px-3 py-2">
    <div class="text-xs font-medium text-red-500">请求失败</div>
    <div class="mt-1 text-xs text-red-400 break-all whitespace-pre-wrap leading-5">
      {{ block.content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";

defineProps<{
  block: AssistantMessageBlock;
}>();
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockError.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageBlockError.vue test/renderer/components/MessageBlockError.test.ts
git commit -m "feat: add MessageBlockError with red styling"
```

---

### Task 4: MessageBlockImage 组件

**Files:**

- Create: `src/renderer/src/components/message/MessageBlockImage.vue`
- Test: `test/renderer/components/MessageBlockImage.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/MessageBlockImage.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageBlockImage from "@/components/message/MessageBlockImage.vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

describe("MessageBlockImage", () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: "image",
    content: "",
    status: "success",
    timestamp: Date.now(),
    image_data: { data: "iVBORw0KGgo=", mimeType: "image/png" },
    ...overrides,
  });

  it("should render image with base64 src", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock() },
    });
    const img = wrapper.find("img");
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toContain("data:image/png;base64,");
  });

  it("should show loading state", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock({ status: "loading", image_data: undefined }) },
    });
    expect(wrapper.find(".animate-spin").exists()).toBe(true);
  });

  it("should show error text when image_data is missing and not loading", () => {
    const wrapper = mount(MessageBlockImage, {
      props: { block: makeBlock({ image_data: undefined }) },
    });
    expect(wrapper.text()).toContain("无法加载图片");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockImage.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/message/MessageBlockImage.vue -->
<template>
  <div class="w-fit rounded-lg border border-border bg-card p-2">
    <!-- Loading -->
    <div
      v-if="block.status === 'loading' && !imageSrc"
      class="flex h-32 w-48 items-center justify-center"
    >
      <svg
        class="h-5 w-5 animate-spin text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
    <!-- Image -->
    <img
      v-else-if="imageSrc"
      :src="imageSrc"
      class="max-w-[300px] rounded-md"
      alt="generated image"
    />
    <!-- Error -->
    <div v-else class="text-sm text-red-500 p-2">无法加载图片</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const imageSrc = computed(() => {
  const data = props.block.image_data;
  if (!data?.data) return null;
  if (data.data.startsWith("data:")) return data.data;
  return `data:${data.mimeType || "image/png"};base64,${data.data}`;
});
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageBlockImage.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageBlockImage.vue test/renderer/components/MessageBlockImage.test.ts
git commit -m "feat: add MessageBlockImage with base64 rendering"
```

---

### Task 5: MessageToolbar 组件

**Files:**

- Create: `src/renderer/src/components/message/MessageToolbar.vue`
- Test: `test/renderer/components/MessageToolbar.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/MessageToolbar.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MessageToolbar from "@/components/message/MessageToolbar.vue";

describe("MessageToolbar", () => {
  it("should render copy button", () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    expect(wrapper.find('[data-testid="toolbar-copy"]').exists()).toBe(true);
  });

  it("should render retry button for assistant", () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    expect(wrapper.find('[data-testid="toolbar-retry"]').exists()).toBe(true);
  });

  it("should emit copy on click", async () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    await wrapper.find('[data-testid="toolbar-copy"]').trigger("click");
    expect(wrapper.emitted("copy")).toBeTruthy();
  });

  it("should emit retry on click", async () => {
    const wrapper = mount(MessageToolbar, {
      props: { isAssistant: true },
    });
    await wrapper.find('[data-testid="toolbar-retry"]').trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageToolbar.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/message/MessageToolbar.vue -->
<template>
  <div
    class="flex items-center gap-1 h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <!-- 复制 -->
    <button
      data-testid="toolbar-copy"
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors"
      title="复制"
      @click="$emit('copy')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
    <!-- 重试（仅助手消息） -->
    <button
      v-if="isAssistant"
      data-testid="toolbar-retry"
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors"
      title="重试"
      @click="$emit('retry')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isAssistant: boolean;
}>();

defineEmits<{
  copy: [];
  retry: [];
}>();
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageToolbar.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageToolbar.vue test/renderer/components/MessageToolbar.test.ts
git commit -m "feat: add MessageToolbar with copy and retry"
```

---

### Task 6: 集成到 MessageItemAssistant + MessageItemUser

**Files:**

- Modify: `src/renderer/src/components/message/MessageItemAssistant.vue`
- Modify: `src/renderer/src/components/message/MessageItemUser.vue`
- Modify: `test/renderer/components/MessageItemAssistant.test.ts`

- [ ] **Step 1: 更新 MessageItemAssistant 测试**

在 `test/renderer/components/MessageItemAssistant.test.ts` 末尾添加新测试:

```typescript
it("should render reasoning block", () => {
  const blocks: AssistantMessageBlock[] = [
    {
      type: "reasoning_content",
      content: "thinking...",
      status: "success",
      timestamp: Date.now(),
      reasoning_time: { start: 1000, end: 3000 },
    },
  ];
  const wrapper = mount(MessageItemAssistant, {
    props: { message: makeMessage(blocks) },
  });
  expect(wrapper.find('[data-testid="reasoning-toggle"]').exists()).toBe(true);
});

it("should render error block", () => {
  const blocks: AssistantMessageBlock[] = [
    { type: "error", content: "Something went wrong", status: "error", timestamp: Date.now() },
  ];
  const wrapper = mount(MessageItemAssistant, {
    props: { message: makeMessage(blocks) },
  });
  expect(wrapper.text()).toContain("Something went wrong");
});

it("should render toolbar on hover", () => {
  const blocks: AssistantMessageBlock[] = [
    { type: "content", content: "hello", status: "success", timestamp: Date.now() },
  ];
  const wrapper = mount(MessageItemAssistant, {
    props: { message: makeMessage(blocks) },
  });
  expect(wrapper.find('[data-testid="toolbar-copy"]').exists()).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/MessageItemAssistant.test.ts`
Expected: 新增的 3 个测试 FAIL

- [ ] **Step 3: 更新 MessageItemAssistant.vue**

替换 `src/renderer/src/components/message/MessageItemAssistant.vue` 全部内容:

```vue
<template>
  <div class="group flex flex-col pt-5 pl-4 pr-11 gap-1.5 w-full">
    <template v-for="block in displayBlocks" :key="block.timestamp">
      <MessageBlockReasoning v-if="block.type === 'reasoning_content'" :block="block" />
      <MessageBlockContent
        v-else-if="block.type === 'content'"
        :content="block.content || ''"
        :block-id="`${message.id}-${block.timestamp}`"
      />
      <MessageBlockToolCall v-else-if="block.type === 'tool_call'" :block="block" />
      <MessageBlockError v-else-if="block.type === 'error'" :block="block" />
      <MessageBlockImage v-else-if="block.type === 'image'" :block="block" />
    </template>
    <!-- Toolbar -->
    <MessageToolbar :is-assistant="true" @copy="onCopy" @retry="$emit('retry')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";
import MessageBlockContent from "./MessageBlockContent.vue";
import MessageBlockReasoning from "./MessageBlockReasoning.vue";
import MessageBlockToolCall from "./MessageBlockToolCall.vue";
import MessageBlockError from "./MessageBlockError.vue";
import MessageBlockImage from "./MessageBlockImage.vue";
import MessageToolbar from "./MessageToolbar.vue";

const props = defineProps<{
  message: ChatMessageRecord;
  streamingBlocks?: AssistantMessageBlock[];
}>();

defineEmits<{
  retry: [];
}>();

const parsedBlocks = computed<AssistantMessageBlock[]>(() => {
  try {
    return JSON.parse(props.message.content);
  } catch {
    return [];
  }
});

const displayBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.streamingBlocks && props.streamingBlocks.length > 0) {
    return props.streamingBlocks;
  }
  return parsedBlocks.value;
});

function onCopy() {
  const text = displayBlocks.value
    .filter((b) => b.type === "content")
    .map((b) => b.content || "")
    .join("\n");
  navigator.clipboard.writeText(text).catch(() => {});
}
</script>
```

- [ ] **Step 4: 给 MessageItemUser 添加 group + toolbar**

在 `src/renderer/src/components/message/MessageItemUser.vue` 中:

将模板改为:

```vue
<template>
  <div class="group flex flex-row-reverse pt-5 pl-11 gap-2">
    <div
      class="bg-muted border border-border rounded-lg p-2 text-sm leading-[1.714] whitespace-pre-wrap break-all"
    >
      {{ parsedContent.text }}
    </div>
  </div>
</template>
```

仅添加 `group` class 到外层 div。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/MessageItemAssistant.test.ts`
Expected: 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/message/MessageItemAssistant.vue src/renderer/src/components/message/MessageItemUser.vue test/renderer/components/MessageItemAssistant.test.ts
git commit -m "feat: integrate all block types and toolbar into MessageItemAssistant"
```

---

### Task 7: 全量测试 + 格式化 + Lint + Typecheck

**Files:** 无新文件

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试 PASS

- [ ] **Step 2: 格式化**

Run: `pnpm run format`

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: 无错误

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: 修复任何问题**

如果上述步骤有失败，修复后重新运行直到全部通过。

- [ ] **Step 6: Commit（如有格式化改动）**

```bash
git add -A
git commit -m "chore: format and lint pass for 005c"
```
