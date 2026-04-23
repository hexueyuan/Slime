# Tool Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "工具" tab to the right-side FunctionPanel that displays formatted tool call details, with per-tool-type custom renderers.

**Architecture:** FunctionPanel gets a tab bar (流程/工具). ToolPanel provides list/detail two-level navigation. Clicking a tool call card in chat switches to the tool tab and shows the detail view. Five detail renderers handle different tool types (exec, read, edit, write, generic).

**Tech Stack:** Vue 3 Composition API, TypeScript, TailwindCSS

---

### Task 1: Modify MessageBlockToolCall — Remove Expand, Add Click Emit

**Files:**
- Modify: `src/renderer/src/components/message/MessageBlockToolCall.vue`
- Modify: `test/renderer/components/MessageBlockToolCall.test.ts`

- [ ] **Step 1: Update the test file for new behavior**

Replace `test/renderer/components/MessageBlockToolCall.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageBlockToolCall from '@/components/message/MessageBlockToolCall.vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

describe('MessageBlockToolCall', () => {
  const makeBlock = (overrides: Partial<AssistantMessageBlock> = {}): AssistantMessageBlock => ({
    type: 'tool_call',
    id: 'tc-1',
    content: '',
    status: 'success',
    timestamp: Date.now(),
    tool_call: { name: 'search', params: '{"query":"hello"}', response: '{"result":"found"}' },
    ...overrides,
  })

  it('should render tool name', () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    })
    expect(wrapper.text()).toContain('search')
  })

  it('should show loading spinner when status is loading', () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock({ status: 'loading' }) },
    })
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('should show success icon when status is success', () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    })
    expect(wrapper.find('[data-testid="tool-status-success"]').exists()).toBe(true)
  })

  it('should emit select-tool-call on click', async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    })
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger('click')
    expect(wrapper.emitted('select-tool-call')).toBeTruthy()
    expect(wrapper.emitted('select-tool-call')![0]).toEqual(['tc-1'])
  })

  it('should not expand params on click', async () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock() },
    })
    await wrapper.find('[data-testid="tool-call-toggle"]').trigger('click')
    expect(wrapper.text()).not.toContain('"query"')
  })

  it('should highlight when selected', () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock(), selectedToolCallId: 'tc-1' },
    })
    expect(wrapper.find('[data-testid="tool-call-toggle"]').classes()).toContain('border-primary')
  })

  it('should not highlight when different id selected', () => {
    const wrapper = mount(MessageBlockToolCall, {
      props: { block: makeBlock(), selectedToolCallId: 'tc-other' },
    })
    expect(wrapper.find('[data-testid="tool-call-toggle"]').classes()).not.toContain('border-primary')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/MessageBlockToolCall.test.ts`
Expected: FAIL — emits test fails (no emit), selectedToolCallId prop not accepted, expand test may pass incorrectly.

- [ ] **Step 3: Update the component**

Replace `src/renderer/src/components/message/MessageBlockToolCall.vue`:

```vue
<template>
  <div class="w-full max-w-3xl">
    <button
      data-testid="tool-call-toggle"
      class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      :class="isSelected ? 'border-primary' : 'border-border'"
      @click="$emit('select-tool-call', block.id)"
    >
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
      <span class="font-medium">{{ block.tool_call?.name || 'unknown' }}</span>
      <span class="truncate text-muted-foreground/70">{{ paramsSummary }}</span>
      <svg
        class="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

const props = defineProps<{
  block: AssistantMessageBlock
  selectedToolCallId?: string | null
}>()

defineEmits<{
  'select-tool-call': [id: string]
}>()

const isSelected = computed(() => props.selectedToolCallId === props.block.id)

const paramsSummary = computed(() => {
  try {
    const params = JSON.parse(props.block.tool_call?.params || '{}')
    const firstValue = Object.values(params)[0]
    if (typeof firstValue === 'string') return firstValue.slice(0, 60)
    return JSON.stringify(firstValue).slice(0, 60)
  } catch {
    return ''
  }
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/MessageBlockToolCall.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageBlockToolCall.vue test/renderer/components/MessageBlockToolCall.test.ts
git commit -m "refactor(ui): MessageBlockToolCall emits select instead of expanding"
```

---

### Task 2: Wire select-tool-call Event Through Component Chain

**Files:**
- Modify: `src/renderer/src/components/message/MessageItemAssistant.vue`
- Modify: `src/renderer/src/components/chat/MessageList.vue`
- Modify: `src/renderer/src/components/chat/ChatPanel.vue`

- [ ] **Step 1: Update MessageItemAssistant to forward emit**

Replace `src/renderer/src/components/message/MessageItemAssistant.vue`:

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
      <MessageBlockToolCall
        v-else-if="block.type === 'tool_call'"
        :block="block"
        :selected-tool-call-id="selectedToolCallId"
        @select-tool-call="$emit('select-tool-call', $event)"
      />
      <MessageBlockError v-else-if="block.type === 'error'" :block="block" />
      <MessageBlockImage v-else-if="block.type === 'image'" :block="block" />
    </template>
    <MessageToolbar :is-assistant="true" @copy="onCopy" @retry="$emit('retry')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessageRecord, AssistantMessageBlock } from '@shared/types/chat'
import MessageBlockContent from './MessageBlockContent.vue'
import MessageBlockReasoning from './MessageBlockReasoning.vue'
import MessageBlockToolCall from './MessageBlockToolCall.vue'
import MessageBlockError from './MessageBlockError.vue'
import MessageBlockImage from './MessageBlockImage.vue'
import MessageToolbar from './MessageToolbar.vue'

const props = defineProps<{
  message: ChatMessageRecord
  streamingBlocks?: AssistantMessageBlock[]
  selectedToolCallId?: string | null
}>()

defineEmits<{
  retry: []
  'select-tool-call': [id: string]
}>()

const parsedBlocks = computed<AssistantMessageBlock[]>(() => {
  try {
    return JSON.parse(props.message.content)
  } catch {
    return []
  }
})

const displayBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.streamingBlocks && props.streamingBlocks.length > 0) {
    return props.streamingBlocks
  }
  return parsedBlocks.value
})

function onCopy() {
  const text = displayBlocks.value
    .filter((b) => b.type === 'content')
    .map((b) => b.content || '')
    .join('\n')
  navigator.clipboard.writeText(text).catch(() => {})
}
</script>
```

- [ ] **Step 2: Update MessageList to forward emit**

In `src/renderer/src/components/chat/MessageList.vue`, add `selectedToolCallId` prop and forward `select-tool-call` event.

Replace the `<script setup>` props definition:

```typescript
const props = defineProps<{
  messages: ChatMessageRecord[]
  streamingBlocks: AssistantMessageBlock[]
  currentStreamMessageId: string | null
  isGenerating?: boolean
  generatingPhaseText?: string
  phaseColor?: string
  selectedToolCallId?: string | null
}>()

defineEmits<{
  'select-tool-call': [id: string]
}>()
```

Replace the template's MessageItemAssistant usages (both instances) to include the new prop and emit:

```vue
<MessageItemAssistant
  v-else-if="msg.role === 'assistant'"
  :message="msg"
  :streaming-blocks="msg.id === currentStreamMessageId ? streamingBlocks : undefined"
  :selected-tool-call-id="selectedToolCallId"
  @select-tool-call="$emit('select-tool-call', $event)"
/>
```

And the streaming placeholder:

```vue
<MessageItemAssistant
  v-if="currentStreamMessageId && !hasStreamMessageInList"
  :message="streamingPlaceholder"
  :streaming-blocks="streamingBlocks"
  :selected-tool-call-id="selectedToolCallId"
  @select-tool-call="$emit('select-tool-call', $event)"
/>
```

- [ ] **Step 3: Update ChatPanel to forward emit**

In `src/renderer/src/components/chat/ChatPanel.vue`, add `selectedToolCallId` prop and forward `select-tool-call`.

Add to props and emits:

```typescript
const props = defineProps<{
  selectedToolCallId?: string | null
}>()

const emit = defineEmits<{
  'select-tool-call': [id: string]
}>()
```

Update the MessageList usage in template:

```vue
<MessageList
  ref="messageListRef"
  :messages="messages"
  :streaming-blocks="messageStore.streamingBlocks"
  :current-stream-message-id="messageStore.currentStreamMessageId"
  :is-generating="isGenerating"
  :generating-phase-text="generatingPhaseText"
  :phase-color="phaseColor"
  :selected-tool-call-id="props.selectedToolCallId"
  @select-tool-call="emit('select-tool-call', $event)"
/>
```

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `pnpm test`
Expected: PASS (some existing tests may need minor updates if they mount MessageItemAssistant without the new optional prop — they should still pass since it's optional)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/message/MessageItemAssistant.vue src/renderer/src/components/chat/MessageList.vue src/renderer/src/components/chat/ChatPanel.vue
git commit -m "feat(ui): wire select-tool-call event through component chain"
```

---

### Task 3: Add Tab Switching to FunctionPanel

**Files:**
- Modify: `src/renderer/src/components/function/FunctionPanel.vue`
- Create: `test/renderer/components/FunctionPanel.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/FunctionPanel.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FunctionPanel from '@/components/function/FunctionPanel.vue'

describe('FunctionPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should show workflow tab by default', () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: 'workflow', toolCallBlocks: [] },
    })
    expect(wrapper.text()).toContain('在对话中开始进化')
  })

  it('should show tool panel when activeTab is tools', () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: 'tools', toolCallBlocks: [] },
    })
    expect(wrapper.text()).toContain('暂无工具调用')
  })

  it('should emit update:activeTab on tab click', async () => {
    const wrapper = mount(FunctionPanel, {
      props: { activeTab: 'workflow', toolCallBlocks: [] },
    })
    await wrapper.find('[data-testid="tab-tools"]').trigger('click')
    expect(wrapper.emitted('update:activeTab')).toBeTruthy()
    expect(wrapper.emitted('update:activeTab')![0]).toEqual(['tools'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/FunctionPanel.test.ts`
Expected: FAIL — FunctionPanel doesn't accept props yet.

- [ ] **Step 3: Implement FunctionPanel with tabs**

Replace `src/renderer/src/components/function/FunctionPanel.vue`:

```vue
<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="tab-workflow"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="activeTab === 'workflow'
          ? 'text-foreground border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground'"
        @click="$emit('update:activeTab', 'workflow')"
      >
        流程
      </button>
      <button
        data-testid="tab-tools"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="activeTab === 'tools'
          ? 'text-foreground border-b-2 border-primary'
          : 'text-muted-foreground hover:text-foreground'"
        @click="$emit('update:activeTab', 'tools')"
      >
        工具
      </button>
    </div>
    <div class="min-h-0 flex-1 overflow-hidden">
      <WorkflowPanel v-if="activeTab === 'workflow'" />
      <ToolPanel
        v-else
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from '@shared/types/chat'
import WorkflowPanel from './WorkflowPanel.vue'
import ToolPanel from './ToolPanel.vue'

defineProps<{
  activeTab: 'workflow' | 'tools'
  toolCallBlocks: AssistantMessageBlock[]
  selectedToolCallId?: string | null
}>()

defineEmits<{
  'update:activeTab': [tab: 'workflow' | 'tools']
  'select-tool-call': [id: string | null]
}>()
</script>
```

- [ ] **Step 4: Create a stub ToolPanel so tests pass**

Create `src/renderer/src/components/function/ToolPanel.vue`:

```vue
<template>
  <div class="flex h-full flex-col p-4">
    <div
      v-if="blocks.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无工具调用
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from '@shared/types/chat'

defineProps<{
  blocks: AssistantMessageBlock[]
  selectedId?: string | null
}>()

defineEmits<{
  select: [id: string]
  back: []
}>()
</script>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/FunctionPanel.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/function/FunctionPanel.vue src/renderer/src/components/function/ToolPanel.vue test/renderer/components/FunctionPanel.test.ts
git commit -m "feat(ui): add tab switching to FunctionPanel with stub ToolPanel"
```

---

### Task 4: Wire State in EvolutionCenter

**Files:**
- Modify: `src/renderer/src/views/EvolutionCenter.vue`

- [ ] **Step 1: Add state and wire props/events**

Replace `src/renderer/src/views/EvolutionCenter.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import AppSidebar from '../components/AppSidebar.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import FunctionPanel from '../components/function/FunctionPanel.vue'
import { useSplitPane } from '../composables/useSplitPane'
import { useMessageStore } from '@/stores/chat'
import type { AssistantMessageBlock } from '@shared/types/chat'

const mainRef = ref<HTMLElement | null>(null)
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
})

const messageStore = useMessageStore()
const activeTab = ref<'workflow' | 'tools'>('workflow')
const selectedToolCallId = ref<string | null>(null)

const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const blocks = messageStore.streamingBlocks.length > 0
    ? messageStore.streamingBlocks
    : getLastAssistantBlocks()
  return blocks.filter((b) => b.type === 'tool_call')
})

function getLastAssistantBlocks(): AssistantMessageBlock[] {
  const ids = messageStore.messageIds
  for (let i = ids.length - 1; i >= 0; i--) {
    const msg = messageStore.getMessage(ids[i])
    if (msg?.role === 'assistant') {
      try {
        return JSON.parse(msg.content)
      } catch {
        return []
      }
    }
  }
  return []
}

function onSelectToolCall(id: string | null) {
  if (id) {
    selectedToolCallId.value = id
    activeTab.value = 'tools'
  } else {
    selectedToolCallId.value = null
  }
}
</script>

<template>
  <div class="flex h-full flex-col bg-sidebar">
    <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
    <div class="flex min-h-0 flex-1">
      <AppSidebar />
      <div
        ref="mainRef"
        class="flex min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
      >
        <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
          <ChatPanel
            :selected-tool-call-id="selectedToolCallId"
            @select-tool-call="onSelectToolCall"
          />
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
    </div>
  </div>
</template>
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/EvolutionCenter.vue
git commit -m "feat(ui): wire tool panel state in EvolutionCenter"
```

---

### Task 5: Implement ToolPanel List/Detail Navigation

**Files:**
- Create: `src/renderer/src/components/function/ToolCallList.vue`
- Create: `src/renderer/src/components/function/ToolCallListItem.vue`
- Create: `src/renderer/src/components/function/ToolCallDetail.vue`
- Modify: `src/renderer/src/components/function/ToolPanel.vue`
- Create: `test/renderer/components/ToolPanel.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolPanel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolPanel from '@/components/function/ToolPanel.vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

const makeToolBlock = (name: string, id: string): AssistantMessageBlock => ({
  type: 'tool_call',
  id,
  content: '',
  status: 'success',
  timestamp: Date.now(),
  tool_call: { name, params: '{"command":"ls"}', response: '{"stdout":"file.ts"}' },
})

describe('ToolPanel', () => {
  it('should show empty state when no blocks', () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [] },
    })
    expect(wrapper.text()).toContain('暂无工具调用')
  })

  it('should show list of tool calls', () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock('exec', 'tc-1'), makeToolBlock('read', 'tc-2')] },
    })
    expect(wrapper.text()).toContain('exec')
    expect(wrapper.text()).toContain('read')
  })

  it('should show detail view when selectedId matches', () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock('exec', 'tc-1')], selectedId: 'tc-1' },
    })
    expect(wrapper.find('[data-testid="tool-detail"]').exists()).toBe(true)
  })

  it('should emit select on list item click', async () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock('exec', 'tc-1')] },
    })
    await wrapper.find('[data-testid="tool-list-item"]').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['tc-1'])
  })

  it('should emit back on back button click', async () => {
    const wrapper = mount(ToolPanel, {
      props: { blocks: [makeToolBlock('exec', 'tc-1')], selectedId: 'tc-1' },
    })
    await wrapper.find('[data-testid="tool-detail-back"]').trigger('click')
    expect(wrapper.emitted('back')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolPanel.test.ts`
Expected: FAIL

- [ ] **Step 3: Create ToolCallListItem**

Create `src/renderer/src/components/function/ToolCallListItem.vue`:

```vue
<template>
  <button
    data-testid="tool-list-item"
    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
    @click="$emit('select', block.id)"
  >
    <svg
      v-if="block.status === 'loading'"
      class="h-3.5 w-3.5 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
    <svg
      v-else-if="block.status === 'error'"
      class="h-3.5 w-3.5 shrink-0 text-destructive"
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
      class="h-3.5 w-3.5 shrink-0 text-green-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <span class="font-medium text-foreground">{{ block.tool_call?.name || 'unknown' }}</span>
    <span class="truncate text-muted-foreground/70">{{ summary }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

const props = defineProps<{
  block: AssistantMessageBlock
}>()

defineEmits<{
  select: [id: string]
}>()

const summary = computed(() => {
  try {
    const params = JSON.parse(props.block.tool_call?.params || '{}')
    const firstValue = Object.values(params)[0]
    if (typeof firstValue === 'string') return firstValue.slice(0, 60)
    return JSON.stringify(firstValue).slice(0, 60)
  } catch {
    return ''
  }
})
</script>
```

- [ ] **Step 4: Create ToolCallList**

Create `src/renderer/src/components/function/ToolCallList.vue`:

```vue
<template>
  <div class="space-y-0.5">
    <ToolCallListItem
      v-for="block in blocks"
      :key="block.id || block.timestamp"
      :block="block"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from '@shared/types/chat'
import ToolCallListItem from './ToolCallListItem.vue'

defineProps<{
  blocks: AssistantMessageBlock[]
}>()

defineEmits<{
  select: [id: string]
}>()
</script>
```

- [ ] **Step 5: Create stub ToolCallDetail**

Create `src/renderer/src/components/function/ToolCallDetail.vue`:

```vue
<template>
  <div data-testid="tool-detail" class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <button
        data-testid="tool-detail-back"
        class="text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('back')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span class="text-xs font-medium">{{ block.tool_call?.name || 'unknown' }}</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3">
      <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{ formattedParams }}</pre>
      <pre v-if="block.tool_call?.response" class="mt-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{ formattedResponse }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

const props = defineProps<{
  block: AssistantMessageBlock
}>()

defineEmits<{
  back: []
}>()

const formattedParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.params || '{}'), null, 2)
  } catch {
    return props.block.tool_call?.params || ''
  }
})

const formattedResponse = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.response || ''), null, 2)
  } catch {
    return props.block.tool_call?.response || ''
  }
})
</script>
```

- [ ] **Step 6: Update ToolPanel to use list/detail**

Replace `src/renderer/src/components/function/ToolPanel.vue`:

```vue
<template>
  <div class="flex h-full flex-col">
    <div
      v-if="blocks.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无工具调用
    </div>
    <ToolCallDetail
      v-else-if="selectedBlock"
      :block="selectedBlock"
      @back="$emit('back')"
    />
    <div v-else class="flex-1 overflow-y-auto p-2">
      <ToolCallList :blocks="blocks" @select="$emit('select', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantMessageBlock } from '@shared/types/chat'
import ToolCallList from './ToolCallList.vue'
import ToolCallDetail from './ToolCallDetail.vue'

const props = defineProps<{
  blocks: AssistantMessageBlock[]
  selectedId?: string | null
}>()

defineEmits<{
  select: [id: string]
  back: []
}>()

const selectedBlock = computed(() => {
  if (!props.selectedId) return null
  return props.blocks.find((b) => b.id === props.selectedId) || null
})
</script>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolPanel.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/function/ToolPanel.vue src/renderer/src/components/function/ToolCallList.vue src/renderer/src/components/function/ToolCallListItem.vue src/renderer/src/components/function/ToolCallDetail.vue test/renderer/components/ToolPanel.test.ts
git commit -m "feat(ui): implement ToolPanel with list/detail navigation"
```

---

### Task 6: Implement ToolDetailExec Renderer

**Files:**
- Create: `src/renderer/src/components/function/details/ToolDetailExec.vue`
- Create: `test/renderer/components/ToolDetailExec.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolDetailExec.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolDetailExec from '@/components/function/details/ToolDetailExec.vue'

describe('ToolDetailExec', () => {
  it('should display command', () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"ls -la","timeout_ms":30000}',
        response: '{"stdout":"file.ts\\nindex.ts","stderr":"","exit_code":0}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('ls -la')
    expect(wrapper.text()).not.toContain('timeout_ms')
  })

  it('should display stdout', () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"echo hi"}',
        response: '{"stdout":"hi\\n","stderr":"","exit_code":0}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('hi')
  })

  it('should display stderr when present', () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"bad"}',
        response: '{"stdout":"","stderr":"not found","exit_code":1}',
        status: 'error',
      },
    })
    expect(wrapper.text()).toContain('not found')
  })

  it('should handle plain string response', () => {
    const wrapper = mount(ToolDetailExec, {
      props: {
        params: '{"command":"ls"}',
        response: 'some output',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('some output')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolDetailExec.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolDetailExec**

Create `src/renderer/src/components/function/details/ToolDetailExec.vue`:

```vue
<template>
  <div class="space-y-3">
    <div>
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">命令</div>
      <div class="rounded-md border-l-3 border-primary bg-muted/30 px-3 py-2">
        <code class="text-xs text-foreground">{{ command }}</code>
      </div>
    </div>
    <div v-if="stdout">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
        输出 <span class="text-muted-foreground/50">stdout</span>
      </div>
      <pre class="max-h-80 overflow-y-auto rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{ stdout }}</pre>
    </div>
    <div v-if="stderr">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
        错误 <span class="text-destructive/70">stderr</span>
      </div>
      <pre class="max-h-40 overflow-y-auto rounded-md bg-destructive/5 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-destructive/80">{{ stderr }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockStatus } from '@shared/types/chat'

const props = defineProps<{
  params: string
  response?: string
  status: BlockStatus
}>()

const parsedParams = computed(() => {
  try { return JSON.parse(props.params) } catch { return {} }
})

const parsedResponse = computed(() => {
  if (!props.response) return null
  try { return JSON.parse(props.response) } catch { return null }
})

const command = computed(() => parsedParams.value.command || '')

const stdout = computed(() => {
  if (!parsedResponse.value) return props.response || ''
  return parsedResponse.value.stdout || ''
})

const stderr = computed(() => parsedResponse.value?.stderr || '')
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolDetailExec.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/details/ToolDetailExec.vue test/renderer/components/ToolDetailExec.test.ts
git commit -m "feat(ui): add ToolDetailExec renderer with terminal style"
```

---

### Task 7: Implement ToolDetailRead Renderer

**Files:**
- Create: `src/renderer/src/components/function/details/ToolDetailRead.vue`
- Create: `test/renderer/components/ToolDetailRead.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolDetailRead.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolDetailRead from '@/components/function/details/ToolDetailRead.vue'

describe('ToolDetailRead', () => {
  it('should display file path', () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"src/main/index.ts"}',
        response: '"line1\\nline2\\nline3"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('src/main/index.ts')
  })

  it('should display line numbers', () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts","offset":0,"limit":3}',
        response: '"const a = 1\\nconst b = 2\\nconst c = 3"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('const a = 1')
  })

  it('should show offset in line numbers', () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts","offset":10}',
        response: '"line at 10\\nline at 11"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('11')
    expect(wrapper.text()).toContain('12')
  })

  it('should handle object response', () => {
    const wrapper = mount(ToolDetailRead, {
      props: {
        params: '{"path":"file.ts"}',
        response: '{"content":"hello world","lines":1}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('hello world')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolDetailRead.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolDetailRead**

Create `src/renderer/src/components/function/details/ToolDetailRead.vue`:

```vue
<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-primary font-medium">{{ filePath }}</span>
      <span v-if="lineRange" class="text-muted-foreground">{{ lineRange }}</span>
    </div>
    <div class="max-h-96 overflow-y-auto rounded-md bg-muted/30 p-2">
      <div
        v-for="(line, i) in lines"
        :key="i"
        class="flex text-xs leading-6 font-mono"
      >
        <span class="w-8 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">{{ startLine + i }}</span>
        <span class="whitespace-pre-wrap break-all text-foreground/80">{{ line }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockStatus } from '@shared/types/chat'

const props = defineProps<{
  params: string
  response?: string
  status: BlockStatus
}>()

const parsedParams = computed(() => {
  try { return JSON.parse(props.params) } catch { return {} }
})

const filePath = computed(() => parsedParams.value.path || '')
const startLine = computed(() => (parsedParams.value.offset || 0) + 1)

const lineRange = computed(() => {
  const p = parsedParams.value
  if (p.offset != null || p.limit != null) {
    const start = (p.offset || 0) + 1
    const end = p.limit ? start + p.limit - 1 : '...'
    return `行 ${start}-${end}`
  }
  return ''
})

const fileContent = computed(() => {
  if (!props.response) return ''
  try {
    const parsed = JSON.parse(props.response)
    if (typeof parsed === 'string') return parsed
    if (parsed.content) return parsed.content
    return JSON.stringify(parsed, null, 2)
  } catch {
    return props.response
  }
})

const lines = computed(() => fileContent.value.split('\n'))
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolDetailRead.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/details/ToolDetailRead.vue test/renderer/components/ToolDetailRead.test.ts
git commit -m "feat(ui): add ToolDetailRead renderer with line numbers"
```

---

### Task 8: Implement ToolDetailEdit Renderer

**Files:**
- Create: `src/renderer/src/components/function/details/ToolDetailEdit.vue`
- Create: `test/renderer/components/ToolDetailEdit.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolDetailEdit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolDetailEdit from '@/components/function/details/ToolDetailEdit.vue'

describe('ToolDetailEdit', () => {
  it('should display file path', () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"src/app.ts","old_text":"const a = 1","new_text":"const a = 2"}',
        response: '"Edited src/app.ts"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('src/app.ts')
  })

  it('should show removed lines in red', () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"f.ts","old_text":"old line","new_text":"new line"}',
        status: 'success',
      },
    })
    const html = wrapper.html()
    expect(html).toContain('old line')
    expect(html).toContain('new line')
  })

  it('should show multi-line diff', () => {
    const wrapper = mount(ToolDetailEdit, {
      props: {
        params: '{"path":"f.ts","old_text":"line1\\nline2","new_text":"line1\\nchanged"}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('line2')
    expect(wrapper.text()).toContain('changed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolDetailEdit.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolDetailEdit**

Create `src/renderer/src/components/function/details/ToolDetailEdit.vue`:

```vue
<template>
  <div class="space-y-2">
    <div class="text-xs text-primary font-medium">{{ filePath }}</div>
    <div class="max-h-96 overflow-y-auto rounded-md bg-muted/30 p-2 font-mono text-xs leading-6">
      <div
        v-for="(line, i) in diffLines"
        :key="i"
        class="flex"
        :class="{
          'bg-destructive/10 border-l-3 border-destructive': line.type === 'remove',
          'bg-green-500/10 border-l-3 border-green-500': line.type === 'add',
        }"
      >
        <span
          class="w-6 shrink-0 text-center select-none"
          :class="{
            'text-destructive': line.type === 'remove',
            'text-green-500': line.type === 'add',
            'text-muted-foreground/30': line.type === 'context',
          }"
        >{{ line.type === 'remove' ? '-' : line.type === 'add' ? '+' : ' ' }}</span>
        <span
          class="whitespace-pre-wrap break-all pl-2"
          :class="{
            'text-destructive/80': line.type === 'remove',
            'text-green-600': line.type === 'add',
            'text-foreground/60': line.type === 'context',
          }"
        >{{ line.text }}</span>
      </div>
    </div>
    <div v-if="responseText" class="text-xs text-muted-foreground">{{ responseText }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockStatus } from '@shared/types/chat'

const props = defineProps<{
  params: string
  response?: string
  status: BlockStatus
}>()

const parsedParams = computed(() => {
  try { return JSON.parse(props.params) } catch { return {} }
})

const filePath = computed(() => parsedParams.value.path || '')

interface DiffLine {
  type: 'remove' | 'add' | 'context'
  text: string
}

const diffLines = computed<DiffLine[]>(() => {
  const oldText: string = parsedParams.value.old_text || ''
  const newText: string = parsedParams.value.new_text || ''
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []
  for (const line of oldLines) {
    result.push({ type: 'remove', text: line })
  }
  for (const line of newLines) {
    result.push({ type: 'add', text: line })
  }
  return result
})

const responseText = computed(() => {
  if (!props.response) return ''
  try {
    const parsed = JSON.parse(props.response)
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return props.response
  }
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolDetailEdit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/details/ToolDetailEdit.vue test/renderer/components/ToolDetailEdit.test.ts
git commit -m "feat(ui): add ToolDetailEdit renderer with diff style"
```

---

### Task 9: Implement ToolDetailWrite Renderer

**Files:**
- Create: `src/renderer/src/components/function/details/ToolDetailWrite.vue`
- Create: `test/renderer/components/ToolDetailWrite.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolDetailWrite.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolDetailWrite from '@/components/function/details/ToolDetailWrite.vue'

describe('ToolDetailWrite', () => {
  it('should display file path', () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"src/new.ts","content":"export const x = 1"}',
        response: '"Written to src/new.ts"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('src/new.ts')
  })

  it('should display content with line numbers', () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"f.ts","content":"line1\\nline2\\nline3"}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('line1')
    expect(wrapper.text()).toContain('3')
  })

  it('should show response status', () => {
    const wrapper = mount(ToolDetailWrite, {
      props: {
        params: '{"path":"f.ts","content":"x"}',
        response: '"Written to f.ts"',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('Written to f.ts')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolDetailWrite.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolDetailWrite**

Create `src/renderer/src/components/function/details/ToolDetailWrite.vue`:

```vue
<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-primary font-medium">{{ filePath }}</span>
      <span class="text-green-500 text-[10px]">新建文件</span>
    </div>
    <div class="max-h-96 overflow-y-auto rounded-md border-l-3 border-green-500 bg-muted/30 p-2">
      <div
        v-for="(line, i) in lines"
        :key="i"
        class="flex text-xs leading-6 font-mono"
      >
        <span class="w-8 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">{{ i + 1 }}</span>
        <span class="whitespace-pre-wrap break-all text-foreground/80">{{ line }}</span>
      </div>
    </div>
    <div v-if="responseText" class="text-xs" :class="status === 'success' ? 'text-green-500' : 'text-destructive'">
      {{ status === 'success' ? '✓' : '✗' }} {{ responseText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockStatus } from '@shared/types/chat'

const props = defineProps<{
  params: string
  response?: string
  status: BlockStatus
}>()

const parsedParams = computed(() => {
  try { return JSON.parse(props.params) } catch { return {} }
})

const filePath = computed(() => parsedParams.value.path || '')
const content = computed(() => parsedParams.value.content || '')
const lines = computed(() => content.value.split('\n'))

const responseText = computed(() => {
  if (!props.response) return ''
  try {
    const parsed = JSON.parse(props.response)
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return props.response
  }
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolDetailWrite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/details/ToolDetailWrite.vue test/renderer/components/ToolDetailWrite.test.ts
git commit -m "feat(ui): add ToolDetailWrite renderer with line numbers"
```

---

### Task 10: Implement ToolDetailGeneric Renderer

**Files:**
- Create: `src/renderer/src/components/function/details/ToolDetailGeneric.vue`
- Create: `test/renderer/components/ToolDetailGeneric.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolDetailGeneric.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolDetailGeneric from '@/components/function/details/ToolDetailGeneric.vue'

describe('ToolDetailGeneric', () => {
  it('should display formatted params', () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: '{"step_id":"s1","status":"completed"}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('step_id')
    expect(wrapper.text()).toContain('completed')
  })

  it('should display formatted response', () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: '{}',
        response: '{"ok":true}',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('"ok"')
  })

  it('should handle non-JSON response', () => {
    const wrapper = mount(ToolDetailGeneric, {
      props: {
        params: '{}',
        response: 'plain text response',
        status: 'success',
      },
    })
    expect(wrapper.text()).toContain('plain text response')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolDetailGeneric.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ToolDetailGeneric**

Create `src/renderer/src/components/function/details/ToolDetailGeneric.vue`:

```vue
<template>
  <div class="space-y-3">
    <div>
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">参数</div>
      <pre class="rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{ formattedParams }}</pre>
    </div>
    <div v-if="response">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">响应</div>
      <pre class="max-h-80 overflow-y-auto rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{ formattedResponse }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BlockStatus } from '@shared/types/chat'

const props = defineProps<{
  params: string
  response?: string
  status: BlockStatus
}>()

const formattedParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.params), null, 2)
  } catch {
    return props.params
  }
})

const formattedResponse = computed(() => {
  if (!props.response) return ''
  try {
    return JSON.stringify(JSON.parse(props.response), null, 2)
  } catch {
    return props.response
  }
})
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolDetailGeneric.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/details/ToolDetailGeneric.vue test/renderer/components/ToolDetailGeneric.test.ts
git commit -m "feat(ui): add ToolDetailGeneric renderer for fallback display"
```

---

### Task 11: Wire Detail Renderers Into ToolCallDetail

**Files:**
- Modify: `src/renderer/src/components/function/ToolCallDetail.vue`
- Create: `test/renderer/components/ToolCallDetail.test.ts`

- [ ] **Step 1: Write the test**

Create `test/renderer/components/ToolCallDetail.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolCallDetail from '@/components/function/ToolCallDetail.vue'
import type { AssistantMessageBlock } from '@shared/types/chat'

const makeBlock = (name: string, params: string, response?: string): AssistantMessageBlock => ({
  type: 'tool_call',
  id: 'tc-1',
  content: '',
  status: 'success',
  timestamp: Date.now(),
  tool_call: { name, params, response },
})

describe('ToolCallDetail', () => {
  it('should render exec detail for exec tool', () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('exec', '{"command":"ls"}', '{"stdout":"ok","stderr":"","exit_code":0}') },
    })
    expect(wrapper.text()).toContain('ls')
    expect(wrapper.text()).toContain('命令')
  })

  it('should render read detail for read tool', () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('read', '{"path":"f.ts"}', '"content here"') },
    })
    expect(wrapper.text()).toContain('f.ts')
  })

  it('should render edit detail for edit tool', () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('edit', '{"path":"f.ts","old_text":"a","new_text":"b"}') },
    })
    expect(wrapper.html()).toContain('f.ts')
  })

  it('should render write detail for write tool', () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('write', '{"path":"f.ts","content":"hello"}') },
    })
    expect(wrapper.text()).toContain('f.ts')
    expect(wrapper.text()).toContain('hello')
  })

  it('should render generic detail for unknown tool', () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('workflow_query', '{}', '{"steps":[]}') },
    })
    expect(wrapper.text()).toContain('参数')
  })

  it('should emit back on back button', async () => {
    const wrapper = mount(ToolCallDetail, {
      props: { block: makeBlock('exec', '{"command":"ls"}') },
    })
    await wrapper.find('[data-testid="tool-detail-back"]').trigger('click')
    expect(wrapper.emitted('back')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ToolCallDetail.test.ts`
Expected: FAIL — current stub doesn't dispatch to specific renderers.

- [ ] **Step 3: Update ToolCallDetail with renderer dispatch**

Replace `src/renderer/src/components/function/ToolCallDetail.vue`:

```vue
<template>
  <div data-testid="tool-detail" class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <button
        data-testid="tool-detail-back"
        class="text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('back')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
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
        class="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class="text-xs font-medium">{{ toolName }}</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3">
      <ToolDetailExec
        v-if="toolName === 'exec'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailRead
        v-else-if="toolName === 'read'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailEdit
        v-else-if="toolName === 'edit'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailWrite
        v-else-if="toolName === 'write'"
        :params="params"
        :response="response"
        :status="block.status"
      />
      <ToolDetailGeneric
        v-else
        :params="params"
        :response="response"
        :status="block.status"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantMessageBlock } from '@shared/types/chat'
import ToolDetailExec from './details/ToolDetailExec.vue'
import ToolDetailRead from './details/ToolDetailRead.vue'
import ToolDetailEdit from './details/ToolDetailEdit.vue'
import ToolDetailWrite from './details/ToolDetailWrite.vue'
import ToolDetailGeneric from './details/ToolDetailGeneric.vue'

const props = defineProps<{
  block: AssistantMessageBlock
}>()

defineEmits<{
  back: []
}>()

const toolName = computed(() => props.block.tool_call?.name || 'unknown')
const params = computed(() => props.block.tool_call?.params || '{}')
const response = computed(() => props.block.tool_call?.response)
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ToolCallDetail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/ToolCallDetail.vue test/renderer/components/ToolCallDetail.test.ts
git commit -m "feat(ui): wire detail renderers into ToolCallDetail dispatcher"
```

---

### Task 12: Final Integration Test and Format

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 2: Run format and lint**

Run: `pnpm run format && pnpm run lint`
Expected: No errors

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Fix any issues found**

If any lint/format/type errors, fix them.

- [ ] **Step 5: Final commit if there are format changes**

```bash
git add -A
git commit -m "style: format and lint tool panel components"
```
