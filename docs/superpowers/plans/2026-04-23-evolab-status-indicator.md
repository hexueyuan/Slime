# EvoLab 状态指示器实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 EvoLab 对话界面增加 AI 处理状态的实时显示（彩色 Spinner + 文字）

**Architecture:** 新建 `useGeneratingPhase` composable 从 store 的 streamingBlocks 推断状态，新建 `GeneratingIndicator` 组件渲染 spinner，`ChatPanel` 调用 composable 并通过 props 传递给 `SessionBar` 和 `MessageList`

**Tech Stack:** Vue 3 Composition API, TypeScript, TailwindCSS

---

## 文件结构

| 文件                                                       | 职责                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `src/renderer/src/composables/useGeneratingPhase.ts`       | 从 streamingBlocks 推断当前生成阶段 |
| `src/renderer/src/components/chat/GeneratingIndicator.vue` | 渲染彩色 spinner + 文字             |
| `src/renderer/src/components/chat/ChatPanel.vue`           | 调用 composable，传 props 给子组件  |
| `src/renderer/src/components/chat/SessionBar.vue`          | 接收新 props，在标题旁显示指示器    |
| `src/renderer/src/components/chat/MessageList.vue`         | 接收新 props，在底部显示指示器      |

---

### Task 1: 创建 useGeneratingPhase composable

**Files:**

- Create: `src/renderer/src/composables/useGeneratingPhase.ts`
- Test: `test/renderer/composables/useGeneratingPhase.test.ts`

- [ ] **Step 1: 创建测试文件目录**

Run: `mkdir -p test/renderer/composables`

- [ ] **Step 2: 写失败测试 - isGenerating 为 false 时返回 null**

```typescript
// test/renderer/composables/useGeneratingPhase.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

// Mock store
const mockIsStreaming = ref(false);
const mockStreamingBlocks = ref<Array<{ type: string }>>([]);

vi.mock("@/stores/chat", () => ({
  useMessageStore: () => ({
    isStreaming: mockIsStreaming,
    streamingBlocks: mockStreamingBlocks,
  }),
}));

import { useGeneratingPhase } from "@/composables/useGeneratingPhase";

describe("useGeneratingPhase", () => {
  beforeEach(() => {
    mockIsStreaming.value = false;
    mockStreamingBlocks.value = [];
  });

  it("returns null phase when not streaming", () => {
    const { isGenerating, generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
    expect(isGenerating.value).toBe(false);
    expect(generatingPhase.value).toBeNull();
    expect(generatingPhaseText.value).toBe("");
    expect(phaseColor.value).toBe("");
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `pnpm test test/renderer/composables/useGeneratingPhase.test.ts`
Expected: FAIL - module not found

- [ ] **Step 4: 写最小实现让测试通过**

```typescript
// src/renderer/src/composables/useGeneratingPhase.ts
import { computed } from "vue";
import { useMessageStore } from "@/stores/chat";

export type GeneratingPhase = "preparing" | "thinking" | "toolCalling" | "generating";

const phaseConfig: Record<GeneratingPhase, { text: string; color: string }> = {
  preparing: { text: "正在准备...", color: "hsl(220 14% 60%)" },
  thinking: { text: "正在思考...", color: "hsl(265 90% 66%)" },
  toolCalling: { text: "正在调用工具...", color: "hsl(25 95% 60%)" },
  generating: { text: "正在生成...", color: "hsl(145 65% 50%)" },
};

export function useGeneratingPhase() {
  const store = useMessageStore();

  const isGenerating = computed(() => store.isStreaming);

  const generatingPhase = computed<GeneratingPhase | null>(() => {
    if (!isGenerating.value) return null;
    const blocks = store.streamingBlocks;
    if (blocks.length === 0) return "preparing";
    const last = blocks[blocks.length - 1];
    switch (last.type) {
      case "reasoning_content":
        return "thinking";
      case "tool_call":
        return "toolCalling";
      default:
        return "generating";
    }
  });

  const generatingPhaseText = computed(() =>
    generatingPhase.value ? phaseConfig[generatingPhase.value].text : "",
  );

  const phaseColor = computed(() =>
    generatingPhase.value ? phaseConfig[generatingPhase.value].color : "",
  );

  return { isGenerating, generatingPhase, generatingPhaseText, phaseColor };
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm test test/renderer/composables/useGeneratingPhase.test.ts`
Expected: PASS

- [ ] **Step 6: 添加更多测试用例**

在测试文件中追加：

```typescript
it("returns preparing when streaming but no blocks", () => {
  mockIsStreaming.value = true;
  mockStreamingBlocks.value = [];
  const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
  expect(generatingPhase.value).toBe("preparing");
  expect(generatingPhaseText.value).toBe("正在准备...");
  expect(phaseColor.value).toBe("hsl(220 14% 60%)");
});

it("returns thinking when last block is reasoning_content", () => {
  mockIsStreaming.value = true;
  mockStreamingBlocks.value = [{ type: "reasoning_content" }];
  const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
  expect(generatingPhase.value).toBe("thinking");
  expect(generatingPhaseText.value).toBe("正在思考...");
  expect(phaseColor.value).toBe("hsl(265 90% 66%)");
});

it("returns toolCalling when last block is tool_call", () => {
  mockIsStreaming.value = true;
  mockStreamingBlocks.value = [{ type: "tool_call" }];
  const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
  expect(generatingPhase.value).toBe("toolCalling");
  expect(generatingPhaseText.value).toBe("正在调用工具...");
  expect(phaseColor.value).toBe("hsl(25 95% 60%)");
});

it("returns generating when last block is content", () => {
  mockIsStreaming.value = true;
  mockStreamingBlocks.value = [{ type: "content" }];
  const { generatingPhase, generatingPhaseText, phaseColor } = useGeneratingPhase();
  expect(generatingPhase.value).toBe("generating");
  expect(generatingPhaseText.value).toBe("正在生成...");
  expect(phaseColor.value).toBe("hsl(145 65% 50%)");
});

it("uses last block when multiple blocks exist", () => {
  mockIsStreaming.value = true;
  mockStreamingBlocks.value = [{ type: "reasoning_content" }, { type: "tool_call" }];
  const { generatingPhase } = useGeneratingPhase();
  expect(generatingPhase.value).toBe("toolCalling");
});
```

- [ ] **Step 7: 运行全部测试验证通过**

Run: `pnpm test test/renderer/composables/useGeneratingPhase.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: 提交**

Run: `git add src/renderer/src/composables/useGeneratingPhase.ts test/renderer/composables/useGeneratingPhase.test.ts && git commit -m "feat(chat): add useGeneratingPhase composable"`

---

### Task 2: 创建 GeneratingIndicator 组件

**Files:**

- Create: `src/renderer/src/components/chat/GeneratingIndicator.vue`
- Test: `test/renderer/components/chat/GeneratingIndicator.test.ts`

- [ ] **Step 1: 创建测试目录**

Run: `mkdir -p test/renderer/components/chat`

- [ ] **Step 2: 写失败测试**

```typescript
// test/renderer/components/chat/GeneratingIndicator.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GeneratingIndicator from "@/components/chat/GeneratingIndicator.vue";

describe("GeneratingIndicator", () => {
  it("renders spinner and text with correct color", () => {
    const wrapper = mount(GeneratingIndicator, {
      props: {
        text: "正在思考...",
        color: "hsl(265 90% 66%)",
      },
    });
    expect(wrapper.text()).toContain("正在思考...");
    const spinner = wrapper.find('[data-testid="spinner"]');
    expect(spinner.exists()).toBe(true);
    expect(spinner.attributes("style")).toContain("hsl(265 90% 66%)");
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `pnpm test test/renderer/components/chat/GeneratingIndicator.test.ts`
Expected: FAIL - module not found

- [ ] **Step 4: 写组件实现**

```vue
<!-- src/renderer/src/components/chat/GeneratingIndicator.vue -->
<template>
  <div class="flex items-center gap-1.5">
    <span
      data-testid="spinner"
      class="spinner"
      :style="{ borderTopColor: color, borderColor: fadedColor }"
    />
    <span class="text-xs" :style="{ color }">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  color: string;
}>();

const fadedColor = computed(() => {
  // 将 hsl 颜色转为 20% 透明度版本
  const match = props.color.match(/hsl\(([^)]+)\)/);
  if (match) {
    return `hsl(${match[1]} / 0.2)`;
  }
  return props.color;
});
</script>

<style scoped>
.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
```

- [ ] **Step 5: 运行测试验证通过**

Run: `pnpm test test/renderer/components/chat/GeneratingIndicator.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

Run: `git add src/renderer/src/components/chat/GeneratingIndicator.vue test/renderer/components/chat/GeneratingIndicator.test.ts && git commit -m "feat(chat): add GeneratingIndicator component"`

---

### Task 3: 修改 SessionBar 接收状态 props

**Files:**

- Modify: `src/renderer/src/components/chat/SessionBar.vue`

- [ ] **Step 1: 添加新 props 定义**

在 `defineProps` 中添加：

```typescript
defineProps<{
  title?: string;
  sessionCount?: number;
  sessions?: ChatSession[];
  activeSessionId?: string | null;
  // 新增
  isGenerating?: boolean;
  generatingPhaseText?: string;
  phaseColor?: string;
}>();
```

- [ ] **Step 2: 在模板中添加指示器**

在标题按钮的 `</button>` 之后、新建按钮之前插入：

```vue
    </button>

    <!-- 状态指示器 -->
    <GeneratingIndicator
      v-if="isGenerating && generatingPhaseText"
      :text="generatingPhaseText"
      :color="phaseColor!"
      class="ml-2"
    />

    <button
```

- [ ] **Step 3: 添加 import**

在 `<script setup>` 顶部添加：

```typescript
import GeneratingIndicator from "./GeneratingIndicator.vue";
```

- [ ] **Step 4: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

Run: `git add src/renderer/src/components/chat/SessionBar.vue && git commit -m "feat(chat): add status indicator props to SessionBar"`

---

### Task 4: 修改 MessageList 接收状态 props

**Files:**

- Modify: `src/renderer/src/components/chat/MessageList.vue`

- [ ] **Step 1: 添加新 props 定义**

修改 `defineProps`：

```typescript
const props = defineProps<{
  messages: ChatMessageRecord[];
  streamingBlocks: AssistantMessageBlock[];
  currentStreamMessageId: string | null;
  // 新增
  isGenerating?: boolean;
  generatingPhaseText?: string;
  phaseColor?: string;
}>();
```

- [ ] **Step 2: 在模板中添加指示器**

在流式消息 `</MessageItemAssistant>` 之后、`</div>` 之前插入：

```vue
      <!-- 流式消息（新消息还没有 record） -->
      <MessageItemAssistant
        v-if="currentStreamMessageId && !hasStreamMessageInList"
        :message="streamingPlaceholder"
        :streaming-blocks="streamingBlocks"
      />

      <!-- 状态指示器 -->
      <GeneratingIndicator
        v-if="isGenerating && generatingPhaseText"
        :text="generatingPhaseText"
        :color="phaseColor!"
        class="pl-3 pt-2"
      />
    </div>
```

- [ ] **Step 3: 添加 import**

在 `<script setup>` 的 import 区域添加：

```typescript
import GeneratingIndicator from "./GeneratingIndicator.vue";
```

- [ ] **Step 4: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

Run: `git add src/renderer/src/components/chat/MessageList.vue && git commit -m "feat(chat): add status indicator to MessageList"`

---

### Task 5: 修改 ChatPanel 使用 composable 并传递 props

**Files:**

- Modify: `src/renderer/src/components/chat/ChatPanel.vue`

- [ ] **Step 1: 导入 composable**

在 import 区域添加：

```typescript
import { useGeneratingPhase } from "@/composables/useGeneratingPhase";
```

- [ ] **Step 2: 调用 composable**

在 `const messageListRef = ref...` 之后添加：

```typescript
const { isGenerating, generatingPhaseText, phaseColor } = useGeneratingPhase();
```

- [ ] **Step 3: 向 SessionBar 传递 props**

修改 `<SessionBar>` 组件：

```vue
<SessionBar
  :title="currentSessionTitle"
  :sessions="sessionStore.sessions"
  :active-session-id="sessionStore.activeSessionId"
  :is-generating="isGenerating"
  :generating-phase-text="generatingPhaseText"
  :phase-color="phaseColor"
  @new-session="onNewSession"
  @select-session="onSelectSession"
  @delete-session="onDeleteSession"
/>
```

- [ ] **Step 4: 向 MessageList 传递 props**

修改 `<MessageList>` 组件：

```vue
<MessageList
  ref="messageListRef"
  :messages="messages"
  :streaming-blocks="messageStore.streamingBlocks"
  :current-stream-message-id="messageStore.currentStreamMessageId"
  :is-generating="isGenerating"
  :generating-phase-text="generatingPhaseText"
  :phase-color="phaseColor"
/>
```

- [ ] **Step 5: 运行 typecheck 和 lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: PASS

- [ ] **Step 6: 运行全部测试**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: 提交**

Run: `git add src/renderer/src/components/chat/ChatPanel.vue && git commit -m "feat(chat): wire up GeneratingPhase composable in ChatPanel"`

---

### Task 6: 格式化和最终验证

**Files:**

- All modified files

- [ ] **Step 1: 格式化代码**

Run: `pnpm run format`

- [ ] **Step 2: 运行 lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 3: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: 运行全部测试**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: 手动验证**

Run: `pnpm run dev`

验证点：

1. 发送消息后，SessionBar 标题旁显示彩色 spinner + "正在准备..."
2. Agent 开始思考时，变为紫色 spinner + "正在思考..."
3. 调用工具时，变为橙色 spinner + "正在调用工具..."
4. 生成内容时，变为绿色 spinner + "正在生成..."
5. 消息列表底部同步显示相同状态
6. 生成完成后指示器消失

- [ ] **Step 6: 提交格式化修改（如有）**

Run: `git add -A && git commit -m "style: format code"` (如有改动)
