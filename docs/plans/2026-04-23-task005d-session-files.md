# TASK-005d 会话管理 + 文件附件 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加会话管理 UI（新建/切换/删除）和文件附件功能

**Architecture:** ChatPanel 顶部新增 SessionBar，ChatInput 启用附件按钮通过 hidden file input 选择文件，附件以 pill 标签展示在 textarea 上方

**Tech Stack:** Vue 3 + TypeScript + TailwindCSS v4 + Pinia

**Scope 说明:** v0.1 聚焦 SessionBar 和文件附件。Artifact 预览和 TipTap 升级延后到 v0.2。

---

### Task 1: SessionBar 组件

**Files:**

- Create: `src/renderer/src/components/chat/SessionBar.vue`
- Test: `test/renderer/components/SessionBar.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/SessionBar.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import SessionBar from "@/components/chat/SessionBar.vue";

describe("SessionBar", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should render new session button", () => {
    const wrapper = mount(SessionBar);
    expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true);
  });

  it("should emit new-session on button click", async () => {
    const wrapper = mount(SessionBar);
    await wrapper.find('[data-testid="new-session-btn"]').trigger("click");
    expect(wrapper.emitted("new-session")).toBeTruthy();
  });

  it("should show session title", () => {
    const wrapper = mount(SessionBar, {
      props: { title: "测试会话", sessionCount: 3 },
    });
    expect(wrapper.text()).toContain("测试会话");
  });

  it("should toggle dropdown on title click", async () => {
    const wrapper = mount(SessionBar, {
      props: {
        title: "test",
        sessionCount: 2,
        sessions: [
          { id: "s1", title: "会话1", createdAt: 1, updatedAt: 1 },
          { id: "s2", title: "会话2", createdAt: 2, updatedAt: 2 },
        ],
        activeSessionId: "s1",
      },
    });
    await wrapper.find('[data-testid="session-title"]').trigger("click");
    expect(wrapper.find('[data-testid="session-dropdown"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("会话1");
    expect(wrapper.text()).toContain("会话2");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/SessionBar.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/chat/SessionBar.vue -->
<template>
  <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
    <!-- 左侧：会话标题 + 下拉 -->
    <button
      data-testid="session-title"
      class="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      @click="dropdownOpen = !dropdownOpen"
    >
      <span class="truncate max-w-[200px]">{{ title || "新对话" }}</span>
      <svg
        class="h-3.5 w-3.5 text-muted-foreground transition-transform"
        :class="{ 'rotate-180': dropdownOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- 右侧：新建会话 -->
    <button
      data-testid="new-session-btn"
      class="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="新建会话"
      @click="$emit('new-session')"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <!-- 下拉列表 -->
    <div
      v-if="dropdownOpen"
      data-testid="session-dropdown"
      class="absolute left-2 right-2 top-10 z-20 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
    >
      <div
        v-for="session in sessions"
        :key="session.id"
        class="group flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-muted transition-colors"
        :class="{
          'bg-muted/50 text-foreground': session.id === activeSessionId,
          'text-muted-foreground': session.id !== activeSessionId,
        }"
        @click="onSelectSession(session.id)"
      >
        <span class="truncate">{{ session.title || "新对话" }}</span>
        <button
          class="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
          title="删除"
          @click.stop="$emit('delete-session', session.id)"
        >
          <svg
            class="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div v-if="!sessions?.length" class="px-3 py-4 text-center text-xs text-muted-foreground">
        暂无会话
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ChatSession } from "@shared/types/chat";

defineProps<{
  title?: string;
  sessionCount?: number;
  sessions?: ChatSession[];
  activeSessionId?: string | null;
}>();

const emit = defineEmits<{
  "new-session": [];
  "select-session": [id: string];
  "delete-session": [id: string];
}>();

const dropdownOpen = ref(false);

function onSelectSession(id: string) {
  emit("select-session", id);
  dropdownOpen.value = false;
}
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/SessionBar.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/SessionBar.vue test/renderer/components/SessionBar.test.ts
git commit -m "feat: add SessionBar with dropdown and new session"
```

---

### Task 2: 集成 SessionBar 到 ChatPanel

**Files:**

- Modify: `src/renderer/src/components/chat/ChatPanel.vue`
- Modify: `test/renderer/components/ChatPanel.test.ts`

- [ ] **Step 1: 更新 ChatPanel 测试**

在 `test/renderer/components/ChatPanel.test.ts` 的 describe 内添加:

```typescript
it("should render session bar", () => {
  const wrapper = mount(ChatPanel);
  expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/ChatPanel.test.ts`
Expected: 新增测试 FAIL

- [ ] **Step 3: 更新 ChatPanel.vue**

在模板中 MessageList 上方添加 SessionBar:

```vue
<template>
  <div class="flex flex-col h-full bg-background relative">
    <SessionBar
      :title="currentSessionTitle"
      :sessions="sessionStore.sessions"
      :active-session-id="sessionStore.activeSessionId"
      @new-session="onNewSession"
      @select-session="onSelectSession"
      @delete-session="onDeleteSession"
    />
    <MessageList
      ref="messageListRef"
      :messages="messages"
      :streaming-blocks="messageStore.streamingBlocks"
      :current-stream-message-id="messageStore.currentStreamMessageId"
    />
    <ChatInput :is-streaming="messageStore.isStreaming" @submit="onSubmit" @stop="onStop" />
  </div>
</template>
```

在 script 中添加:

```typescript
import SessionBar from "./SessionBar.vue";

const currentSessionTitle = computed(() => {
  const session = sessionStore.sessions.find((s) => s.id === sessionStore.activeSessionId);
  return session?.title || "新对话";
});

async function onNewSession() {
  await sessionStore.createSession();
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
    messageListRef.value?.scrollToBottom(true);
  }
}

function onSelectSession(id: string) {
  sessionStore.selectSession(id);
}

async function onDeleteSession(id: string) {
  await sessionStore.deleteSession(id);
  if (sessionStore.activeSessionId) {
    await messageStore.loadMessages(sessionStore.activeSessionId);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/ChatPanel.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/ChatPanel.vue test/renderer/components/ChatPanel.test.ts
git commit -m "feat: integrate SessionBar into ChatPanel"
```

---

### Task 3: ChatAttachmentItem 组件

**Files:**

- Create: `src/renderer/src/components/chat/ChatAttachmentItem.vue`
- Test: `test/renderer/components/ChatAttachmentItem.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// test/renderer/components/ChatAttachmentItem.test.ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatAttachmentItem from "@/components/chat/ChatAttachmentItem.vue";
import type { MessageFile } from "@shared/types/chat";

describe("ChatAttachmentItem", () => {
  const file: MessageFile = {
    id: "f1",
    name: "document.pdf",
    path: "/tmp/document.pdf",
    mimeType: "application/pdf",
    size: 1024,
  };

  it("should render file name", () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    expect(wrapper.text()).toContain("document.pdf");
  });

  it("should emit remove on x click", async () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    await wrapper.find('[data-testid="remove-file"]').trigger("click");
    expect(wrapper.emitted("remove")).toBeTruthy();
    expect(wrapper.emitted("remove")![0]).toEqual(["f1"]);
  });

  it("should have pill styling", () => {
    const wrapper = mount(ChatAttachmentItem, {
      props: { file },
    });
    expect(wrapper.find(".rounded-full").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/ChatAttachmentItem.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件**

```vue
<!-- src/renderer/src/components/chat/ChatAttachmentItem.vue -->
<template>
  <div
    class="flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs shadow-sm"
  >
    <!-- 文件图标 -->
    <svg
      class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
    <!-- 文件名 -->
    <span class="max-w-[120px] truncate text-foreground">{{ file.name }}</span>
    <!-- 删除按钮 -->
    <button
      data-testid="remove-file"
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      @click="$emit('remove', file.id)"
    >
      <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MessageFile } from "@shared/types/chat";

defineProps<{
  file: MessageFile;
}>();

defineEmits<{
  remove: [id: string];
}>();
</script>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/ChatAttachmentItem.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/ChatAttachmentItem.vue test/renderer/components/ChatAttachmentItem.test.ts
git commit -m "feat: add ChatAttachmentItem pill component"
```

---

### Task 4: ChatInput 附件功能

**Files:**

- Modify: `src/renderer/src/components/chat/ChatInput.vue`
- Modify: `test/renderer/components/ChatInput.test.ts`

- [ ] **Step 1: 更新 ChatInput 测试**

在 `test/renderer/components/ChatInput.test.ts` 的 describe 内添加:

```typescript
it("should render file input element", () => {
  const wrapper = mount(ChatInput, {
    props: { isStreaming: false, files: [] },
  });
  expect(wrapper.find('input[type="file"]').exists()).toBe(true);
});

it("should render attachment items when files provided", () => {
  const wrapper = mount(ChatInput, {
    props: {
      isStreaming: false,
      files: [
        { id: "f1", name: "test.txt", path: "/tmp/test.txt", mimeType: "text/plain", size: 100 },
      ],
    },
  });
  expect(wrapper.text()).toContain("test.txt");
});

it("should emit remove-file on attachment remove", async () => {
  const wrapper = mount(ChatInput, {
    props: {
      isStreaming: false,
      files: [
        { id: "f1", name: "test.txt", path: "/tmp/test.txt", mimeType: "text/plain", size: 100 },
      ],
    },
  });
  await wrapper.find('[data-testid="remove-file"]').trigger("click");
  expect(wrapper.emitted("remove-file")).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --project renderer test/renderer/components/ChatInput.test.ts`
Expected: 新增测试 FAIL

- [ ] **Step 3: 更新 ChatInput.vue**

添加 hidden file input、附件显示区域、启用附件按钮:

模板变更 — 在 textarea 之前添加附件区域:

```html
<!-- 附件列表 -->
<div v-if="files?.length" class="flex flex-wrap gap-1.5 px-4 pt-3">
  <ChatAttachmentItem
    v-for="file in files"
    :key="file.id"
    :file="file"
    @remove="$emit('remove-file', $event)"
  />
</div>
```

在组件末尾添加 hidden file input:

```html
<!-- 隐藏的文件选择器 -->
<input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileSelect" />
```

将附件按钮从 `disabled` 改为可点击:

```html
<button
  class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
  title="附件"
  @click="fileInputRef?.click()"
></button>
```

script 变更:

```typescript
import ChatAttachmentItem from "./ChatAttachmentItem.vue";
import type { MessageFile } from "@shared/types/chat";

const props = defineProps<{
  isStreaming: boolean;
  files?: MessageFile[];
}>();

const emit = defineEmits<{
  submit: [text: string];
  stop: [];
  "add-files": [files: File[]];
  "remove-file": [id: string];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    emit("add-files", Array.from(input.files));
    input.value = "";
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --project renderer test/renderer/components/ChatInput.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/ChatInput.vue test/renderer/components/ChatInput.test.ts
git commit -m "feat: enable file attachments in ChatInput"
```

---

### Task 5: ChatPanel 附件状态管理

**Files:**

- Modify: `src/renderer/src/components/chat/ChatPanel.vue`

- [ ] **Step 1: 在 ChatPanel 中管理附件状态**

在 ChatPanel.vue script 中添加附件管理:

```typescript
import type { MessageFile } from "@shared/types/chat";

const attachedFiles = ref<MessageFile[]>([]);

function onAddFiles(files: File[]) {
  for (const file of files) {
    attachedFiles.value.push({
      id: crypto.randomUUID(),
      name: file.name,
      path: "",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  }
}

function onRemoveFile(id: string) {
  attachedFiles.value = attachedFiles.value.filter((f) => f.id !== id);
}
```

更新 ChatInput 调用:

```html
<ChatInput
  :is-streaming="messageStore.isStreaming"
  :files="attachedFiles"
  @submit="onSubmit"
  @stop="onStop"
  @add-files="onAddFiles"
  @remove-file="onRemoveFile"
/>
```

更新 onSubmit 以包含文件:

```typescript
async function onSubmit(text: string) {
  if (!sessionStore.activeSessionId) return;
  await messageStore.sendMessage(sessionStore.activeSessionId, {
    text,
    files: attachedFiles.value,
  });
  attachedFiles.value = [];
  messageListRef.value?.scrollToBottom(true);
}
```

- [ ] **Step 2: 运行现有测试确认不破坏**

Run: `pnpm test -- --project renderer test/renderer/components/ChatPanel.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatPanel.vue
git commit -m "feat: wire file attachments in ChatPanel"
```

---

### Task 6: 全量测试 + 格式化 + Lint + Typecheck

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
git commit -m "chore: format and lint pass for 005d"
```
