# Chatroom 功能区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Agent 会话视图（Chatroom）右侧增加功能区，包含工具调用详情和 interaction 预览两个 Tab。

**Architecture:** 新建独立的 `ChatFunctionPanel.vue`，与 evolab 组件完全分开维护；`toolCallBlocks` 由 `ChatroomPanel` 从 `agentChatStore` 聚合计算；`selectedToolCallId` 在 `ChatroomPanel` 管理并向下透传；split pane 复用 `useSplitPane` composable。

**Tech Stack:** Vue 3 Composition API, Pinia, TailwindCSS, Vitest + Vue Test Utils

---

## File Map

| 操作 | 文件 | 职责 |
|---|---|---|
| 新建 | `src/renderer/src/components/chat/ChatFunctionPanel.vue` | 工具/预览两 Tab 功能区，使用 agentChatPresenter |
| 新建 | `test/renderer/components/chat/ChatFunctionPanel.test.ts` | ChatFunctionPanel 单元测试 |
| 修改 | `src/renderer/src/components/chat/ChatMessageAssistant.vue` | tool_call block 点击发射 select-tool-call，高亮选中 |
| 修改 | `src/renderer/src/components/chat/ChatMessageList.vue` | 透传 selectedToolCallId prop + emit |
| 修改 | `src/renderer/src/components/chat/ChatView.vue` | 透传 selectedToolCallId prop + emit |
| 修改 | `src/renderer/src/views/ChatroomPanel.vue` | split pane 布局，计算 toolCallBlocks，集成 ChatFunctionPanel |

---

### Task 1: 新建 ChatFunctionPanel 组件

**Files:**
- Create: `src/renderer/src/components/chat/ChatFunctionPanel.vue`
- Create: `test/renderer/components/chat/ChatFunctionPanel.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// test/renderer/components/chat/ChatFunctionPanel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

;(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
}

import ChatFunctionPanel from '@/components/chat/ChatFunctionPanel.vue'

describe('ChatFunctionPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows tool panel when activeTab is tools', () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: 'tools', toolCallBlocks: [] },
    })
    expect(wrapper.text()).toContain('暂无工具调用')
  })

  it('shows preview panel when activeTab is preview', () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: 'preview', toolCallBlocks: [] },
    })
    expect(wrapper.text()).toContain('暂无预览内容')
  })

  it('emits update:activeTab when preview tab clicked', async () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: 'tools', toolCallBlocks: [] },
    })
    await wrapper.find('[data-testid="chat-tab-preview"]').trigger('click')
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['preview'])
  })

  it('emits update:activeTab when tools tab clicked', async () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: 'preview', toolCallBlocks: [] },
    })
    await wrapper.find('[data-testid="chat-tab-tools"]').trigger('click')
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['tools'])
  })

  it('has no history tab', () => {
    const wrapper = mount(ChatFunctionPanel, {
      props: { activeTab: 'tools', toolCallBlocks: [] },
    })
    expect(wrapper.find('[data-testid="chat-tab-history"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm test test/renderer/components/chat/ChatFunctionPanel.test.ts
```
期望：`Cannot find module '@/components/chat/ChatFunctionPanel.vue'`

- [ ] **Step 3: 创建 ChatFunctionPanel.vue**

```vue
<!-- src/renderer/src/components/chat/ChatFunctionPanel.vue -->
<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="chat-tab-tools"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'tools'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'tools')"
      >
        工具
      </button>
      <button
        data-testid="chat-tab-preview"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'preview'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'preview')"
      >
        预览
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <ToolPanel
        v-if="activeTab === 'tools'"
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
      <ContentDispatcher
        v-else-if="activeTab === 'preview'"
        :content="contentStore.content"
        @interaction-submit="onInteractionSubmit"
        @progress-cancel="onProgressCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from '@shared/types/agent'
import ToolPanel from '@/components/function/ToolPanel.vue'
import ContentDispatcher from '@/components/function/ContentDispatcher.vue'
import { useContentStore } from '@/stores/content'
import { usePresenter } from '@/composables/usePresenter'
import { useAgentSessionStore } from '@/stores/agentSession'
import { useAgentChatStore } from '@/stores/agentChat'

defineProps<{
  activeTab: 'tools' | 'preview'
  toolCallBlocks: AssistantMessageBlock[]
  selectedToolCallId?: string | null
}>()

defineEmits<{
  'update:activeTab': [tab: 'tools' | 'preview']
  'select-tool-call': [id: string | null]
}>()

const contentStore = useContentStore()
const contentPresenter = usePresenter('contentPresenter')
const sessionStore = useAgentSessionStore()
const chatStore = useAgentChatStore()

function onInteractionSubmit(result: { selected?: string | string[]; extra_input?: string }) {
  const content = contentStore.content
  if (content?.type !== 'interaction') return
  const sessionId = sessionStore.activeSessionId
  if (!sessionId) return
  chatStore.answerQuestion(sessionId, content.toolCallId, JSON.stringify(result))
}

function onProgressCancel() {
  contentPresenter.cancelProgress('current')
}
</script>
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm test test/renderer/components/chat/ChatFunctionPanel.test.ts
```
期望：5 passed

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/ChatFunctionPanel.vue test/renderer/components/chat/ChatFunctionPanel.test.ts
git commit -m "feat(chat): add ChatFunctionPanel with tools/preview tabs"
```

---

### Task 2: ChatMessageAssistant 增加 tool_call 点击与高亮

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`

背景：`ToolCallListItem` 使用 `block.id!` 作为选中标识，`ChatMessageAssistant` 的 tool_call block 点击也应 emit `block.id`；高亮时对比 `selectedToolCallId === block.id`。

- [ ] **Step 1: 修改 ChatMessageAssistant.vue**

在 `<script setup>` 中添加新 prop 和 emit：

```ts
// 在现有 props 之后新增
const props = defineProps<{
  message?: ChatMessageRecord
  blocks?: AssistantMessageBlock[]
  isStreaming?: boolean
  agentId?: string
  showTimestamp?: boolean
  isLast?: boolean
  selectedToolCallId?: string | null   // 新增
}>()

const emit = defineEmits<{
  openAgentEdit: [agentId: string]     // 若原本无 defineEmits 则新增
  'select-tool-call': [id: string]     // 新增
}>()
```

注意：原文件无 `defineEmits`，需新增整块。完整的 script setup 开头替换为：

```ts
const props = defineProps<{
  message?: ChatMessageRecord
  blocks?: AssistantMessageBlock[]
  isStreaming?: boolean
  agentId?: string
  showTimestamp?: boolean
  isLast?: boolean
  selectedToolCallId?: string | null
}>()

const emit = defineEmits<{
  'select-tool-call': [id: string]
}>()
```

在模板的 tool_call block 部分，将：

```html
<!-- Tool call block -->
<div
  v-else-if="block.type === 'tool_call' && block.tool_call"
  class="mb-2 w-full max-w-3xl"
>
  <div
    class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
  >
```

替换为：

```html
<!-- Tool call block -->
<div
  v-else-if="block.type === 'tool_call' && block.tool_call"
  class="mb-2 w-full max-w-3xl"
>
  <div
    class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/30"
    :class="
      selectedToolCallId && block.id && selectedToolCallId === block.id
        ? 'border-violet-500/60 bg-violet-500/10'
        : 'border-border'
    "
    @click="block.id && emit('select-tool-call', block.id)"
  >
```

- [ ] **Step 2: 运行现有测试，确认无回归**

```bash
pnpm test test/renderer/components
```
期望：全部 pass（ChatMessageAssistant 若有测试则通过，无测试也无新失败）

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue
git commit -m "feat(chat): emit select-tool-call and highlight on tool_call block click"
```

---

### Task 3: ChatMessageList 透传 selectedToolCallId 与 emit

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageList.vue`

- [ ] **Step 1: 修改 ChatMessageList.vue**

在 `<script setup>` 中新增 prop 和 emit：

```ts
// 新增在 defineExpose 之前
const props = defineProps<{
  selectedToolCallId?: string | null
}>()

const emit = defineEmits<{
  'select-tool-call': [id: string]
}>()
```

在模板中，给所有 `<ChatMessageAssistant>` 实例（历史消息和流式消息）都加上透传：

```html
<!-- History messages: assistant -->
<ChatMessageAssistant
  v-else-if="msg.role === 'assistant'"
  :message="msg"
  :agent-id="activeAgentId ?? undefined"
  :show-timestamp="shouldShowTimestamp(chatStore.messages, idx)"
  :is-last="isLastMessage(chatStore.messages, idx)"
  :selected-tool-call-id="props.selectedToolCallId"
  @select-tool-call="emit('select-tool-call', $event)"
/>

<!-- Streaming blocks -->
<ChatMessageAssistant
  v-if="chatStore.streamingBlocks.length > 0"
  :blocks="chatStore.streamingBlocks"
  :is-streaming="true"
  :agent-id="activeAgentId ?? undefined"
  :show-timestamp="true"
  :is-last="true"
  :selected-tool-call-id="props.selectedToolCallId"
  @select-tool-call="emit('select-tool-call', $event)"
/>
```

- [ ] **Step 2: 运行测试确认无回归**

```bash
pnpm test test/renderer/components/MessageList.test.ts
```
期望：pass

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageList.vue
git commit -m "feat(chat): thread selectedToolCallId through ChatMessageList"
```

---

### Task 4: ChatView 透传 selectedToolCallId 与 emit

**Files:**
- Modify: `src/renderer/src/components/chat/ChatView.vue`

- [ ] **Step 1: 修改 ChatView.vue**

在 `<script setup>` 中新增 prop 和 emit（添加到现有的 `defineEmits` 中）：

将现有：
```ts
const emit = defineEmits<{
  openAgentEdit: [agentId: string]
}>()
```
替换为：
```ts
defineProps<{
  selectedToolCallId?: string | null
}>()

const emit = defineEmits<{
  openAgentEdit: [agentId: string]
  'select-tool-call': [id: string]
}>()
```

在模板中，将 `<ChatMessageList ref="messageListRef" />` 替换为：

```html
<ChatMessageList
  ref="messageListRef"
  :selected-tool-call-id="selectedToolCallId"
  @select-tool-call="emit('select-tool-call', $event)"
/>
```

- [ ] **Step 2: 运行测试确认无回归**

```bash
pnpm test test/renderer/components
```
期望：pass

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatView.vue
git commit -m "feat(chat): thread selectedToolCallId through ChatView"
```

---

### Task 5: ChatroomPanel 集成分栏布局与 ChatFunctionPanel

**Files:**
- Modify: `src/renderer/src/views/ChatroomPanel.vue`

- [ ] **Step 1: 修改 ChatroomPanel.vue**

完整替换为：

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import SessionList from '../components/chat/SessionList.vue'
import NewThread from '../components/chat/NewThread.vue'
import ChatView from '../components/chat/ChatView.vue'
import ChatFunctionPanel from '../components/chat/ChatFunctionPanel.vue'
import AgentEditDialog from '../components/chat/AgentEditDialog.vue'
import { useAgentStore } from '@/stores/agent'
import { useAgentSessionStore } from '@/stores/agentSession'
import { useAgentChatStore } from '@/stores/agentChat'
import { useContentStore } from '@/stores/content'
import { setupAgentChatIpc } from '@/stores/agentChatIpc'
import { useSplitPane } from '@/composables/useSplitPane'
import { AGENT_EVENTS, SESSION_EVENTS } from '@shared/events'
import type { AssistantMessageBlock } from '@shared/types/agent'

const agentStore = useAgentStore()
const sessionStore = useAgentSessionStore()
const chatStore = useAgentChatStore()
const contentStore = useContentStore()

// Agent edit dialog
const agentEditOpen = ref(false)
const agentEditId = ref<string | undefined>(undefined)

function openAgentEdit(agentId?: string) {
  agentEditId.value = agentId
  agentEditOpen.value = true
}

// IPC event listeners
const cleanupChatIpc = setupAgentChatIpc(chatStore, () => sessionStore.activeSessionId)

const cleanupAgentChanged = window.electron.ipcRenderer.on(AGENT_EVENTS.CHANGED, () => {
  agentStore.fetchAgents()
})

const cleanupSessionUpdated = window.electron.ipcRenderer.on(SESSION_EVENTS.LIST_UPDATED, () => {
  sessionStore.fetchSessions()
})

onUnmounted(() => {
  cleanupChatIpc()
  cleanupAgentChanged()
  cleanupSessionUpdated()
})

onMounted(async () => {
  await Promise.all([agentStore.fetchAgents(), sessionStore.fetchSessions()])
})

// Session select
function onSessionSelect(id: string) {
  sessionStore.setActiveSession(id)
  chatStore.fetchMessages(id)
}

// Split pane
const mainRef = ref<HTMLElement | null>(null)
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.65,
  minLeftPx: 280,
  minRightPx: 320,
})

// Function panel state
const activeTab = ref<'tools' | 'preview'>('tools')
const selectedToolCallId = ref<string | null>(null)

// Auto-switch to preview when content arrives
watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = 'preview'
  },
)

// Aggregate tool call blocks from all messages + streaming
const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const all: AssistantMessageBlock[] = []
  for (const msg of chatStore.messages) {
    if (msg.role === 'assistant') {
      try {
        const blocks: AssistantMessageBlock[] = JSON.parse(msg.content)
        for (const b of blocks) {
          if (b.type === 'tool_call') all.push(b)
        }
      } catch {
        /* ignore */
      }
    }
  }
  for (const b of chatStore.streamingBlocks) {
    if (b.type === 'tool_call') all.push(b)
  }
  return all
})

function onSelectToolCall(id: string | null) {
  selectedToolCallId.value = id
  if (id) activeTab.value = 'tools'
}
</script>

<template>
  <div ref="mainRef" class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <SessionList @select="onSessionSelect" />
    </div>

    <!-- Center: Chat area -->
    <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
      <NewThread v-if="!sessionStore.activeSessionId" @open-agent-edit="openAgentEdit()" />
      <ChatView
        v-else
        :selected-tool-call-id="selectedToolCallId"
        @open-agent-edit="openAgentEdit($event)"
        @select-tool-call="onSelectToolCall"
      />
    </div>

    <!-- Divider -->
    <div
      class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
      @mousedown="onMouseDown"
      @dblclick="resetToDefault"
    >
      <div class="absolute inset-y-0 -left-1 -right-1" />
    </div>

    <!-- Right: Function panel -->
    <div class="min-w-[320px] flex-1 overflow-hidden">
      <ChatFunctionPanel
        :active-tab="activeTab"
        :tool-call-blocks="toolCallBlocks"
        :selected-tool-call-id="selectedToolCallId"
        @update:active-tab="activeTab = $event"
        @select-tool-call="onSelectToolCall"
      />
    </div>

    <!-- Agent edit dialog -->
    <AgentEditDialog
      v-model:open="agentEditOpen"
      :agent-id="agentEditId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
```

注意：`mainRef` 绑定在最外层 `div.flex.h-full` 上，这样 `useSplitPane` 能正确计算容器宽度（需减去 SessionList 的 220px，但 useSplitPane 以 `containerRef.clientWidth` 为准，会自动包含 SessionList）。

**实际上** SessionList 是独立的 220px 固定宽度，split pane 应该只管 center+right 两部分。需要将 `mainRef` 绑定到 center+right 的容器上，而不是整个 flex 容器。修正方案——将 center+right 包裹在独立 div 中：

```html
<template>
  <div class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <SessionList @select="onSessionSelect" />
    </div>

    <!-- Center + Right: Split pane area -->
    <div ref="mainRef" class="flex min-w-0 flex-1 overflow-hidden">
      <!-- Center: Chat area -->
      <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
        <NewThread v-if="!sessionStore.activeSessionId" @open-agent-edit="openAgentEdit()" />
        <ChatView
          v-else
          :selected-tool-call-id="selectedToolCallId"
          @open-agent-edit="openAgentEdit($event)"
          @select-tool-call="onSelectToolCall"
        />
      </div>

      <!-- Divider -->
      <div
        class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
        @mousedown="onMouseDown"
        @dblclick="resetToDefault"
      >
        <div class="absolute inset-y-0 -left-1 -right-1" />
      </div>

      <!-- Right: Function panel -->
      <div class="min-w-[320px] flex-1 overflow-hidden">
        <ChatFunctionPanel
          :active-tab="activeTab"
          :tool-call-blocks="toolCallBlocks"
          :selected-tool-call-id="selectedToolCallId"
          @update:active-tab="activeTab = $event"
          @select-tool-call="onSelectToolCall"
        />
      </div>
    </div>

    <!-- Agent edit dialog -->
    <AgentEditDialog
      v-model:open="agentEditOpen"
      :agent-id="agentEditId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
```

用这个 template（`mainRef` 在 center+right 的包裹 div 上）。

- [ ] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck
```
期望：无错误

- [ ] **Step 3: 运行测试**

```bash
pnpm test
```
期望：全部 pass

- [ ] **Step 4: 运行 lint + format**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/ChatroomPanel.vue
git commit -m "feat(chat): integrate split pane and ChatFunctionPanel into ChatroomPanel"
```

---

## Self-Review

**Spec coverage 检查：**
- ✅ 新建 ChatFunctionPanel（工具/预览，无历史）→ Task 1
- ✅ 点击 tool_call block → 右侧 ToolPanel 高亮 → Task 2~5
- ✅ interaction submit → agentChatStore.answerQuestion → Task 1
- ✅ contentStore.content 变化 → 自动切换预览 Tab → Task 5
- ✅ split pane 布局 → Task 5
- ✅ ChatFunctionPanel 与 evolab 完全独立 → 分别放在 components/chat/ 和 components/evolab/

**Placeholder 检查：** 无 TBD/TODO

**类型一致性：**
- `AssistantMessageBlock` 统一从 `@shared/types/agent` 引入（ChatFunctionPanel 和 ChatroomPanel）
- `selectedToolCallId: string | null` 在所有文件中类型一致
- `activeTab: 'tools' | 'preview'` 在 ChatFunctionPanel props 和 ChatroomPanel state 中一致
