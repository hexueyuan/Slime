# Evolution StatusBar 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将进化流程从功能面板 tab 搬到独立横条，增加丢弃进化功能，精简 UI 布局。

**Architecture:** 新建 EvolutionStatusBar 组件放在 EvolutionCenter 的 mainRef 容器顶部横跨全宽。后端新增 clearMessages 方法支持重置时清空对话。删除 SessionBar、GeneratingIndicator、EvolutionPanel 三个冗余组件。

**Tech Stack:** Vue 3 + TypeScript + TailwindCSS + Pinia + Vitest

---

## 文件变更总览

| 操作 | 文件                                                                      |
| ---- | ------------------------------------------------------------------------- |
| 新建 | `src/renderer/src/components/evolution/EvolutionStatusBar.vue`            |
| 新建 | `test/renderer/components/EvolutionStatusBar.test.ts`                     |
| 修改 | `src/shared/types/presenters/session.presenter.d.ts` — 新增 clearMessages |
| 修改 | `src/main/presenter/sessionPresenter.ts` — 实现 clearMessages             |
| 修改 | `test/main/sessionPresenter.test.ts` — 新增测试                           |
| 修改 | `src/renderer/src/stores/chat.ts` — 新增 clearAll                         |
| 修改 | `src/renderer/src/views/EvolutionCenter.vue` — 引入横条，移除 SessionBar  |
| 修改 | `src/renderer/src/components/chat/ChatPanel.vue` — 移除 SessionBar/phase  |
| 修改 | `src/renderer/src/components/function/FunctionPanel.vue` — 去掉流程 tab   |
| 删除 | `src/renderer/src/components/chat/SessionBar.vue`                         |
| 删除 | `src/renderer/src/components/chat/GeneratingIndicator.vue`                |
| 删除 | `src/renderer/src/composables/useGeneratingPhase.ts`                      |
| 删除 | `src/renderer/src/components/function/EvolutionPanel.vue`                 |
| 删除 | `test/renderer/components/SessionBar.test.ts`                             |
| 删除 | `test/renderer/components/GeneratingIndicator.test.ts`                    |

---

### Task 1: 后端 — SessionPresenter.clearMessages

**Files:**

- Modify: `src/shared/types/presenters/session.presenter.d.ts`
- Modify: `src/main/presenter/sessionPresenter.ts`
- Test: `test/main/sessionPresenter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/sessionPresenter.test.ts` 末尾（`describe` 块内）追加：

```ts
it("should clear all messages for a session", async () => {
  const session = await presenter.createSession("test");
  await presenter.saveMessage({
    id: "msg-1",
    sessionId: session.id,
    role: "user" as const,
    content: JSON.stringify({ text: "hello", files: [] }),
    status: "sent" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await presenter.saveMessage({
    id: "msg-2",
    sessionId: session.id,
    role: "assistant" as const,
    content: "hi",
    status: "sent" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const before = await presenter.getMessages(session.id);
  expect(before).toHaveLength(2);

  await presenter.clearMessages(session.id);
  const after = await presenter.getMessages(session.id);
  expect(after).toEqual([]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/main/sessionPresenter.test.ts`
Expected: FAIL — `presenter.clearMessages is not a function`

- [ ] **Step 3: 更新接口定义**

在 `src/shared/types/presenters/session.presenter.d.ts` 的 `ISessionPresenter` 接口中追加：

```ts
clearMessages(sessionId: string): Promise<void>;
```

- [ ] **Step 4: 实现 clearMessages**

在 `src/main/presenter/sessionPresenter.ts` 的 `SessionPresenter` 类中，`saveMessage` 方法后追加：

```ts
async clearMessages(sessionId: string): Promise<void> {
  const store = this.messageStore(sessionId);
  await store.write([]);
  logger.info("Messages cleared", { sessionId });
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test -- test/main/sessionPresenter.test.ts`
Expected: ALL PASS

- [ ] **Step 6: 提交**

```bash
git add src/shared/types/presenters/session.presenter.d.ts src/main/presenter/sessionPresenter.ts test/main/sessionPresenter.test.ts
git commit -m "feat(session): add clearMessages method"
```

---

### Task 2: 前端 Store — messageStore.clearAll

**Files:**

- Modify: `src/renderer/src/stores/chat.ts`

- [ ] **Step 1: 在 messageStore 中追加 clearAll**

在 `src/renderer/src/stores/chat.ts` 的 `stopGeneration` 函数后、`return` 语句前追加：

```ts
function clearAll(): void {
  messageIds.value = [];
  messageCache.value = new Map();
  clearStreamingState();
  clearStreamError();
  clearPendingQuestion();
}
```

- [ ] **Step 2: 在 return 对象中导出 clearAll**

在 return 对象中追加 `clearAll`：

```ts
return {
  // ... existing exports
  stopGeneration,
  clearAll,
};
```

- [ ] **Step 3: 运行现有测试确认不破坏**

Run: `pnpm test -- test/renderer/stores/`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/stores/chat.ts
git commit -m "feat(store): add messageStore.clearAll"
```

---

### Task 3: 新建 EvolutionStatusBar 组件

**Files:**

- Create: `src/renderer/src/components/evolution/EvolutionStatusBar.vue`
- Create: `test/renderer/components/EvolutionStatusBar.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/renderer/components/EvolutionStatusBar.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { useEvolutionStore } from "@/stores/evolution";
import EvolutionStatusBar from "@/components/evolution/EvolutionStatusBar.vue";

vi.mock("@/composables/usePresenter", () => ({
  usePresenter: () =>
    new Proxy(
      {},
      {
        get: () => vi.fn().mockResolvedValue(true),
      },
    ),
}));

describe("EvolutionStatusBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should be hidden when idle and no completedTag", () => {
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(false);
  });

  it("should show stepper when stage is discuss", () => {
    const store = useEvolutionStore();
    store.setStage("discuss");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("需求澄清");
    expect(wrapper.text()).toContain("执行进化");
    expect(wrapper.text()).toContain("应用变更");
  });

  it("should show discard button when in progress", () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="discard-btn"]').exists()).toBe(true);
  });

  it("should show completed state when completedTag exists", () => {
    const store = useEvolutionStore();
    store.setCompleted("egg-v0.1-dev.3", "Added feature X");
    const wrapper = mount(EvolutionStatusBar);
    expect(wrapper.find('[data-testid="evolution-status-bar"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("进化完成");
    expect(wrapper.text()).toContain("egg-v0.1-dev.3");
    expect(wrapper.text()).toContain("重启以生效");
  });

  it("should show confirm dialog when discard clicked", async () => {
    const store = useEvolutionStore();
    store.setStage("coding");
    const wrapper = mount(EvolutionStatusBar);
    await wrapper.find('[data-testid="discard-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="discard-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认丢弃进化");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 创建组件**

创建 `src/renderer/src/components/evolution/EvolutionStatusBar.vue`：

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useEvolutionStore } from "@/stores/evolution";
import { usePresenter } from "@/composables/usePresenter";
import { useSessionStore } from "@/stores/session";
import { useMessageStore } from "@/stores/chat";

const evolutionStore = useEvolutionStore();
const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const evolutionPresenter = usePresenter("evolutionPresenter");
const sessionPresenter = usePresenter("sessionPresenter");

const stages = [
  { key: "discuss", label: "需求澄清" },
  { key: "coding", label: "执行进化" },
  { key: "applying", label: "应用变更" },
] as const;

const showDialog = ref(false);
const isDiscarding = ref(false);

function stageStatus(stageKey: string): "completed" | "active" | "pending" {
  const stageKeys = stages.map((s) => s.key);
  const idx = stageKeys.indexOf(stageKey as any);
  const currentIdx = stageKeys.indexOf(evolutionStore.stage as any);
  if (evolutionStore.stage === "idle") return "completed";
  if (idx < currentIdx) return "completed";
  if (idx === currentIdx) return "active";
  return "pending";
}

const isActive = computed(() => evolutionStore.stage !== "idle" || !!evolutionStore.completedTag);

const isInProgress = computed(() => evolutionStore.stage !== "idle");

function handleDiscardClick() {
  showDialog.value = true;
}

function handleCancelDialog() {
  showDialog.value = false;
}

async function handleConfirmDiscard() {
  isDiscarding.value = true;
  try {
    await evolutionPresenter.cancel();
    if (sessionStore.activeSessionId) {
      await sessionPresenter.clearMessages(sessionStore.activeSessionId);
      messageStore.clearAll();
    }
  } finally {
    isDiscarding.value = false;
    showDialog.value = false;
  }
}

function handleRestart() {
  evolutionPresenter.restart();
}
</script>

<template>
  <div
    v-if="isActive"
    data-testid="evolution-status-bar"
    class="flex items-center border-b border-border px-4 py-2"
  >
    <template v-for="(stage, i) in stages" :key="stage.key">
      <div
        v-if="i > 0"
        class="mx-2 h-0.5 w-6"
        :class="
          stageStatus(stage.key) === 'completed' || stageStatus(stages[i - 1].key) === 'active'
            ? 'bg-green-500'
            : 'bg-border'
        "
      />
      <div class="flex items-center gap-1.5">
        <div
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :class="{
            'bg-green-500': stageStatus(stage.key) === 'completed',
            'bg-primary shadow-[0_0_6px_rgba(124,106,239,0.5)]':
              stageStatus(stage.key) === 'active',
            'border-2 border-muted-foreground/30': stageStatus(stage.key) === 'pending',
          }"
        />
        <span
          class="text-xs"
          :class="{
            'text-green-500': stageStatus(stage.key) === 'completed',
            'font-semibold text-primary': stageStatus(stage.key) === 'active',
            'text-muted-foreground': stageStatus(stage.key) === 'pending',
          }"
        >
          {{ stage.label }}
        </span>
      </div>
    </template>

    <template v-if="evolutionStore.completedTag">
      <div class="ml-4 rounded bg-green-500/10 px-2 py-0.5">
        <span class="text-xs font-medium text-green-500">✓ 进化完成</span>
      </div>
      <span class="ml-2 font-mono text-xs text-primary">{{ evolutionStore.completedTag }}</span>
    </template>

    <div class="flex-1" />

    <button
      v-if="isInProgress"
      data-testid="discard-btn"
      class="rounded border border-red-500 px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10"
      :disabled="isDiscarding"
      @click="handleDiscardClick"
    >
      丢弃进化
    </button>

    <button
      v-if="evolutionStore.completedTag"
      class="rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90"
      @click="handleRestart"
    >
      重启以生效
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="showDialog"
      data-testid="discard-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="handleCancelDialog"
    >
      <div class="w-[360px] rounded-lg border border-border bg-background p-6 shadow-lg">
        <h3 class="text-sm font-semibold text-foreground">确认丢弃进化？</h3>
        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
          此操作将丢弃本次进化的所有代码修改，回退到进化开始前的状态，并清空当前对话记录。此操作不可恢复。
        </p>
        <div class="mt-5 flex justify-end gap-3">
          <button
            class="rounded border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            @click="handleCancelDialog"
          >
            取消
          </button>
          <button
            class="rounded bg-red-500 px-4 py-1.5 text-xs text-white hover:bg-red-600"
            :disabled="isDiscarding"
            @click="handleConfirmDiscard"
          >
            确认丢弃
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

注意：`computed` 需要在 `<script setup>` 顶部从 vue 导入。修改第一行为：

```ts
import { ref, computed } from "vue";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- test/renderer/components/EvolutionStatusBar.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/evolution/EvolutionStatusBar.vue test/renderer/components/EvolutionStatusBar.test.ts
git commit -m "feat(ui): add EvolutionStatusBar component"
```

---

### Task 4: 修改 EvolutionCenter — 引入横条，移除 SessionBar

**Files:**

- Modify: `src/renderer/src/views/EvolutionCenter.vue`

- [ ] **Step 1: 替换 import**

在 `EvolutionCenter.vue` 的 `<script setup>` 中：

移除：

```ts
import { useMessageStore } from "@/stores/chat";
```

移除：

```ts
import { useGeneratingPhase } from "@/composables/useGeneratingPhase";
```

（如果 ChatPanel 不再需要 phase props，EvolutionCenter 也不需要）

新增：

```ts
import EvolutionStatusBar from "../components/evolution/EvolutionStatusBar.vue";
```

移除 `useMessageStore()` 相关逻辑（`messageStore` 变量、`toolCallBlocks` computed）——这些移到 ChatPanel 内部处理或者如果 FunctionPanel 仍需要则保留。

**注意**：`toolCallBlocks` 仍然需要传给 FunctionPanel，所以 `useMessageStore` 需保留。只移除 `useGeneratingPhase` 相关。

实际只需要：

- 新增 `import EvolutionStatusBar`
- 移除对 FunctionPanel 传递的 `activeTab` 默认值从 `"workflow"` 改为 `"tools"`

- [ ] **Step 2: 修改 activeTab 默认值**

将：

```ts
const activeTab = ref<"workflow" | "tools" | "preview">("workflow");
```

改为：

```ts
const activeTab = ref<"tools" | "preview">("tools");
```

- [ ] **Step 3: 修改 contentStore watcher**

将 watch 中 `activeTab.value = "preview"` 保持不变（preview 仍有效）。

- [ ] **Step 4: 修改 template**

在 mainRef 容器中，split 区域（`<div class="shrink-0 ...">` ChatPanel）之前，插入：

```html
<EvolutionStatusBar />
```

同时将 mainRef 容器改为 flex-col 布局，让横条在上、split 区域在下：

将 mainRef 的：

```html
<div
  ref="mainRef"
  class="flex min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
></div>
```

改为：

```html
<div
  ref="mainRef"
  class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
></div>
```

然后将原来的 ChatPanel + divider + FunctionPanel 包在一个 `<div class="flex min-h-0 flex-1 overflow-hidden">` 中：

```html
<EvolutionStatusBar />
<div class="flex min-h-0 flex-1 overflow-hidden">
  <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
    <ChatPanel :selected-tool-call-id="selectedToolCallId" @select-tool-call="onSelectToolCall" />
  </div>
  <div
    class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
    @mousedown="onMouseDown"
    @dblclick="resetToDefault"
  >
    <div class="absolute inset-y-0 -left-1 -right-1" />
  </div>
  <div class="min-w-[320px] flex-1 overflow-hidden">
    <FunctionPanel
      :active-tab="activeTab"
      :tool-call-blocks="toolCallBlocks"
      :selected-tool-call-id="selectedToolCallId"
      @update:active-tab="activeTab = $event"
      @select-tool-call="onSelectToolCall"
    />
  </div>
</div>
```

- [ ] **Step 5: 运行测试确认不破坏**

Run: `pnpm test`
Expected: 现有测试通过（SessionBar 测试后续会删除）

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/views/EvolutionCenter.vue
git commit -m "feat(ui): wire EvolutionStatusBar into EvolutionCenter"
```

---

### Task 5: 修改 ChatPanel — 移除 SessionBar 和 phase 逻辑

**Files:**

- Modify: `src/renderer/src/components/chat/ChatPanel.vue`

- [ ] **Step 1: 移除 imports**

移除以下 import：

```ts
import { useGeneratingPhase } from "@/composables/useGeneratingPhase";
import SessionBar from "./SessionBar.vue";
```

- [ ] **Step 2: 移除 phase 变量**

移除：

```ts
const { isGenerating, generatingPhaseText, phaseColor } = useGeneratingPhase();
```

- [ ] **Step 3: 修改 template**

移除整个 `<SessionBar ... />` 组件。

ChatPanel template 变为：

```html
<template>
  <div class="flex flex-col h-full bg-background relative">
    <MessageList
      ref="messageListRef"
      :messages="messages"
      :streaming-blocks="messageStore.streamingBlocks"
      :current-stream-message-id="messageStore.currentStreamMessageId"
      :is-generating="messageStore.isStreaming"
      :selected-tool-call-id="props.selectedToolCallId"
      @select-tool-call="emit('select-tool-call', $event)"
    />
    <ChatInput
      :is-streaming="messageStore.isStreaming"
      :files="attachedFiles"
      :error="messageStore.streamError"
      :pending-question="messageStore.pendingQuestion"
      @submit="onSubmit"
      @stop="onStop"
      @add-files="onAddFiles"
      @remove-file="onRemoveFile"
      @dismiss-error="messageStore.clearStreamError()"
      @answer-question="onAnswerQuestion"
    />
  </div>
</template>
```

注意：`MessageList` 之前接收 `isGenerating`、`generatingPhaseText`、`phaseColor` props，现在改为直接传 `messageStore.isStreaming`。需要检查 MessageList 是否用到了 phase props——如果用到则需要同步清理，如果只是 pass-through 到已删除的 GeneratingIndicator，则可一并移除。

- [ ] **Step 4: 检查并清理 MessageList props**

检查 `MessageList.vue`，如果其 props 包含 `generatingPhaseText` 和 `phaseColor`，移除这些 props 声明和任何内部使用。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test`
Expected: PASS（忽略即将删除的 SessionBar 测试）

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/chat/ChatPanel.vue src/renderer/src/components/chat/MessageList.vue
git commit -m "refactor(chat): remove SessionBar and generating phase from ChatPanel"
```

---

### Task 6: 修改 FunctionPanel — 去掉"流程"tab

**Files:**

- Modify: `src/renderer/src/components/function/FunctionPanel.vue`

- [ ] **Step 1: 移除 EvolutionPanel import**

移除：

```ts
import EvolutionPanel from "./EvolutionPanel.vue";
```

- [ ] **Step 2: 修改 props 类型**

将：

```ts
defineProps<{
  activeTab: "workflow" | "tools" | "preview";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();
```

改为：

```ts
defineProps<{
  activeTab: "tools" | "preview";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();
```

- [ ] **Step 3: 修改 emits 类型**

将：

```ts
defineEmits<{
  "update:activeTab": [tab: "workflow" | "tools" | "preview"];
  "select-tool-call": [id: string | null];
}>();
```

改为：

```ts
defineEmits<{
  "update:activeTab": [tab: "tools" | "preview"];
  "select-tool-call": [id: string | null];
}>();
```

- [ ] **Step 4: 移除 template 中"流程"按钮和 EvolutionPanel**

删除整个 `data-testid="tab-workflow"` 的 `<button>` 块。

删除：

```html
<EvolutionPanel v-if="activeTab === 'workflow'" />
```

将 ToolPanel 的 `v-else-if` 改为 `v-if`：

```html
<ToolPanel v-if="activeTab === 'tools'" ... />
```

- [ ] **Step 5: 运行测试**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/function/FunctionPanel.vue
git commit -m "refactor(function): remove workflow tab from FunctionPanel"
```

---

### Task 7: 删除废弃文件和测试

**Files:**

- Delete: `src/renderer/src/components/chat/SessionBar.vue`
- Delete: `src/renderer/src/components/chat/GeneratingIndicator.vue`
- Delete: `src/renderer/src/composables/useGeneratingPhase.ts`
- Delete: `src/renderer/src/components/function/EvolutionPanel.vue`
- Delete: `test/renderer/components/SessionBar.test.ts`
- Delete: `test/renderer/components/GeneratingIndicator.test.ts`

- [ ] **Step 1: 删除文件**

```bash
rm src/renderer/src/components/chat/SessionBar.vue
rm src/renderer/src/components/chat/GeneratingIndicator.vue
rm src/renderer/src/composables/useGeneratingPhase.ts
rm src/renderer/src/components/function/EvolutionPanel.vue
rm test/renderer/components/SessionBar.test.ts
rm test/renderer/components/GeneratingIndicator.test.ts
```

- [ ] **Step 2: 确认无残留引用**

```bash
grep -r "SessionBar\|GeneratingIndicator\|useGeneratingPhase\|EvolutionPanel" src/renderer/src/ --include="*.vue" --include="*.ts"
```

Expected: 无结果（所有引用已在前面的 task 中移除）

- [ ] **Step 3: 运行全部测试**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 4: 运行 lint 和 format**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: remove SessionBar, GeneratingIndicator, EvolutionPanel"
```

---

### Task 8: 最终验证

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 2: 类型检查**

Run: `pnpm run typecheck`
Expected: 无错误

- [ ] **Step 3: Lint + Format**

Run: `pnpm run format && pnpm run lint`
Expected: 无错误

- [ ] **Step 4: dev 模式手动验证**

Run: `pnpm run dev`

验证：

1. idle 状态：横条不显示
2. 发起进化对话后，进入 discuss：横条出现，"需求澄清"为 active 状态
3. 进入 coding："需求澄清"变绿，"执行进化"为 active
4. 点击"丢弃进化"：弹出确认 Dialog
5. 确认后：代码回退，对话清空，横条隐藏
6. 完成一次进化：三步全绿，显示 tag 和"重启以生效"
7. 功能面板只有"工具"和"预览"两个 tab
