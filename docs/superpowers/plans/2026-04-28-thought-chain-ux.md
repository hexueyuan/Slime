# 思考链 UX 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 聊天区只展示最终答案，中间思考/工具调用通过"思考链"按钮在右侧预览区查看。

**Architecture:** 每条 assistant `ChatMessageRecord` 的 `content` 存储整个 agentic loop 产生的所有 `AssistantMessageBlock[]`（包括中间文字和工具调用），在 loop 结束保存前将最后一个 `type=content` 的 block 标记 `is_final: true`。渲染层过滤出 `is_final` block 作为最终答案展示，其余 block 归入思考链面板。无 DB schema 变更。

**Tech Stack:** TypeScript · Vue 3 Composition API · Pinia · TailwindCSS · Vitest

---

## 文件清单

| 文件 | 操作 |
|------|------|
| `src/shared/types/agent.d.ts` | 修改：`AssistantMessageBlock` 加 `is_final?: boolean` |
| `src/main/presenter/agentChat/agentChatPresenter.ts` | 修改：保存前标记最后 content block |
| `src/renderer/src/components/chat/ChatMessageAssistant.vue` | 修改：过滤 final block、流式状态、思考链按钮 |
| `src/renderer/src/components/chat/ChatMessageList.vue` | 修改：透传 `show-thought-chain` 事件 |
| `src/renderer/src/components/chat/ChatView.vue` | 修改：透传 `show-thought-chain` 事件 |
| `src/renderer/src/components/chat/ThoughtChainPanel.vue` | 新建：步骤时间线组件 |
| `src/renderer/src/components/chat/ChatFunctionPanel.vue` | 修改：预览 Tab 按类型分发 |
| `src/renderer/src/views/ChatroomPanel.vue` | 修改：思考链状态管理 |
| `test/main/agentChat/agentChatPresenter.test.ts` | 修改：加 is_final 标记测试 |
| `test/renderer/components/chat/ThoughtChainPanel.test.ts` | 新建 |
| `test/renderer/components/chat/ChatFunctionPanel.test.ts` | 修改：加思考链分发测试 |

---

## Task 1: AssistantMessageBlock 加 is_final 字段

**Files:**
- Modify: `src/shared/types/agent.d.ts`

- [ ] **Step 1: 加字段**

在 `src/shared/types/agent.d.ts` 的 `AssistantMessageBlock` 接口末尾加一行：

```ts
export interface AssistantMessageBlock {
  id?: string
  type: AssistantBlockType
  content?: string
  status: 'pending' | 'success' | 'error' | 'loading'
  timestamp: number
  tool_call?: ToolCallBlockData
  image_data?: { data: string; mimeType: string }
  is_final?: boolean
}
```

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/agent.d.ts
git commit -m "feat(agent): add is_final to AssistantMessageBlock"
```

---

## Task 2: AgentChatPresenter 标记 is_final

**Files:**
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`
- Test: `test/main/agentChat/agentChatPresenter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/agentChat/agentChatPresenter.test.ts` 找到现有测试末尾，添加：

```ts
it('marks last content block as is_final before saving', async () => {
  // loop: text → tool call → text (final)
  let callCount = 0
  vi.mocked(streamText).mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      async function* gen() { yield 'let me check' }
      return {
        textStream: gen(),
        toolCalls: Promise.resolve([
          { toolCallId: 'tc1', toolName: 'exec', input: { command: 'date' } },
        ]),
      } as any
    }
    async function* gen() { yield 'today is Tuesday' }
    return { textStream: gen(), toolCalls: Promise.resolve([]) } as any
  })

  vi.mocked(messageDao.getNextOrderSeq).mockReturnValue(2)
  vi.mocked(messageDao.createMessage).mockImplementation(() => {})
  vi.mocked(messageDao.listBySession).mockReturnValue([
    { id: 'u1', sessionId: 'sess1', orderSeq: 1, role: 'user', content: 'what day', status: 'sent', createdAt: 1, updatedAt: 1 },
  ])

  const gw = makeGatewayPresenter()
  const tool = makeToolPresenter()
  const content = makeContentPresenter()
  const presenter = new AgentChatPresenter(gw, tool, content)

  await presenter.chat('sess1', 'what day')

  const saved = vi.mocked(messageDao.createMessage).mock.calls[0][1]
  const blocks = JSON.parse(saved.content)
  const contentBlocks = blocks.filter((b: any) => b.type === 'content')
  const lastContent = contentBlocks[contentBlocks.length - 1]
  expect(lastContent.is_final).toBe(true)
  // intermediate content block must NOT have is_final
  expect(contentBlocks[0].is_final).toBeUndefined()
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test test/main/agentChat/agentChatPresenter.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 新增测试 FAIL，`expect(lastContent.is_final).toBe(true)` 失败。

- [ ] **Step 3: 在正常完成路径标记 is_final**

在 `agentChatPresenter.ts` 第 297 行（`// Finalize blocks`）之后、第 303 行（`// Save assistant message`）之前插入：

```ts
      // Mark the last content block as the final answer
      const lastContentIdx = blocks.map((b) => b.type).lastIndexOf('content')
      if (lastContentIdx !== -1) blocks[lastContentIdx].is_final = true
```

- [ ] **Step 4: 在 abort 路径同样标记**

在 `agentChatPresenter.ts` 第 323 行（`for (const block of blocks) if...`）之后插入：

```ts
        const lastContentIdx = blocks.map((b) => b.type).lastIndexOf('content')
        if (lastContentIdx !== -1) blocks[lastContentIdx].is_final = true
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm test test/main/agentChat/agentChatPresenter.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 所有测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts \
        test/main/agentChat/agentChatPresenter.test.ts
git commit -m "feat(agent): mark last content block as is_final before save"
```

---

## Task 3: ChatMessageAssistant 过滤 final block + 思考链按钮

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`

**背景：**
- 非流式消息：只渲染 `is_final === true` 的 block（fallback：若无任何 is_final，渲染全部——兼容旧消息和 abort 消息）
- 流式消息（`isStreaming=true`）：隐藏实际 blocks，改为"思考中..."动画 + 始终可见的"查看进度"按钮
- Toolbar：当有中间 blocks（`!is_final`）时，新增"思考链"按钮（hover 显示）

- [ ] **Step 1: 加 finalBlocks / intermediateBlocks computed 和新 emit**

在 `<script setup>` 的 `parsedBlocks` computed 之后插入：

```ts
// 携带原始 idx，使 getBlockContent 的 debouncedContents 下标保持一致
const finalBlocks = computed<{ block: AssistantMessageBlock; originalIdx: number }[]>(() => {
  if (props.isStreaming) return []
  const blocks = parsedBlocks.value
  const hasFinal = blocks.some((b) => b.is_final)
  const filtered = hasFinal ? blocks.filter((b) => b.is_final) : blocks
  return filtered.map((block) => ({ block, originalIdx: blocks.indexOf(block) }))
})

const intermediateBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.isStreaming) return []
  return parsedBlocks.value.filter((b) => !b.is_final)
})
```

在 `defineEmits` 中加 `show-thought-chain` 事件：

```ts
const emit = defineEmits<{
  'select-tool-call': [id: string]
  'show-thought-chain': [messageId?: string]
}>()
```

- [ ] **Step 2: 替换 template 中的 content 区域**

将 `<div class="w-full">` 内的 `<template v-for="(block, idx) in parsedBlocks">` 改为两段：

```html
<!-- Content blocks: 流式时隐藏，非流式只渲染 finalBlocks -->
<div class="w-full">
  <!-- Streaming indicator -->
  <template v-if="isStreaming">
    <div class="flex items-center gap-2 py-1">
      <div class="flex gap-1">
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 0ms"
        />
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 150ms"
        />
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 300ms"
        />
      </div>
      <span class="text-xs text-muted-foreground">思考中...</span>
      <button
        class="ml-1 rounded px-1.5 py-0.5 text-xs text-violet-400 hover:text-violet-300"
        @click="emit('show-thought-chain')"
      >
        查看进度
      </button>
    </div>
  </template>

  <!-- Finished: only final blocks -->
  <template v-else>
    <template v-for="({ block, originalIdx }) in finalBlocks" :key="originalIdx">
      <!-- Content block -->
      <div
        v-if="block.type === 'content'"
        class="prose prose-xs dark:prose-invert w-full max-w-none"
      >
        <NodeRenderer
          :content="getBlockContent(originalIdx, block)"
          :custom-id="`chat-block-${originalIdx}`"
          :is-dark="true"
        />
      </div>

      <!-- Reasoning block -->
      <details
        v-else-if="block.type === 'reasoning_content'"
        class="mb-2 rounded-md border border-border"
      >
        <summary
          class="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          推理过程
        </summary>
        <div class="whitespace-pre-wrap px-3 pb-2 text-xs text-muted-foreground">
          {{ block.content }}
        </div>
      </details>

      <!-- Error block -->
      <div
        v-else-if="block.type === 'error'"
        class="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
      >
        {{ block.content }}
      </div>

      <!-- Image block -->
      <div v-else-if="block.type === 'image' && block.image_data" class="mb-2">
        <img
          :src="`data:${block.image_data.mimeType};base64,${block.image_data.data}`"
          alt="Generated image"
          class="max-h-80 rounded-md"
        />
      </div>
    </template>
  </template>
</div>
```

注意：tool_call block 从 `finalBlocks` 的渲染中移除（final 答案不含工具调用，不需要渲染）。

- [ ] **Step 3: 在 Action bar 加思考链按钮**

将现有 Action bar（`<div class="mt-0.5 flex opacity-0 ...">`）改为：

```html
<div class="mt-0.5 flex opacity-0 transition-opacity group-hover:opacity-100">
  <button
    class="rounded p-1 text-muted-foreground hover:text-foreground"
    @click="copyMessage"
  >
    <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
  </button>
  <button
    v-if="!isStreaming && intermediateBlocks.length > 0"
    class="rounded p-1 text-muted-foreground hover:text-foreground"
    title="查看思考链"
    @click="message && emit('show-thought-chain', message.id)"
  >
    <Icon icon="lucide:list-tree" class="h-3.5 w-3.5" />
  </button>
  <button
    v-if="isLast && !isStreaming && !chatStore.isGenerating"
    class="rounded p-1 text-muted-foreground hover:text-foreground"
    @click="regenerate"
  >
    <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
  </button>
</div>
```

- [ ] **Step 4: 修复 copyMessage 使用 parsedBlocks 而非 finalBlocks**

`copyMessage` 目前从所有 content blocks 拼文字，保持不变（复制全部 content 文字包括中间步骤）——或者只复制 final，取决于你的偏好。默认保持原逻辑，不改。

- [ ] **Step 5: 格式化**

```bash
pnpm run format
```

- [ ] **Step 6: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue
git commit -m "feat(chat): filter final block, streaming indicator, thought-chain button"
```

---

## Task 4: ThoughtChainPanel 新组件

**Files:**
- Create: `src/renderer/src/components/chat/ThoughtChainPanel.vue`
- Create: `test/renderer/components/chat/ThoughtChainPanel.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/renderer/components/chat/ThoughtChainPanel.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@iconify/vue', () => ({ Icon: { template: '<span />' } }))

import ThoughtChainPanel from '@/components/chat/ThoughtChainPanel.vue'
import type { AssistantMessageBlock } from '@shared/types/agent'

function makeContentBlock(content: string): AssistantMessageBlock {
  return { type: 'content', content, status: 'success', timestamp: 1 }
}

function makeToolBlock(id: string, name: string): AssistantMessageBlock {
  return {
    id,
    type: 'tool_call',
    status: 'success',
    timestamp: 1,
    tool_call: { id, name, input: {}, output: 'ok' },
  }
}

describe('ThoughtChainPanel', () => {
  it('renders a content step', () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeContentBlock('let me check')] },
    })
    expect(wrapper.text()).toContain('let me check')
    expect(wrapper.text()).toContain('1')
  })

  it('renders a tool_call step', () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeToolBlock('tc1', 'exec')] },
    })
    expect(wrapper.text()).toContain('exec')
  })

  it('emits select-tool-call when tool step clicked', async () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: { blocks: [makeToolBlock('tc1', 'exec')] },
    })
    await wrapper.find('[data-testid="tool-step-tc1"]').trigger('click')
    expect(wrapper.emitted('select-tool-call')?.[0]).toEqual(['tc1'])
  })

  it('renders multiple steps in order', () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: {
        blocks: [makeContentBlock('thinking'), makeToolBlock('tc2', 'read'), makeContentBlock('done')],
      },
    })
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('3')
  })

  it('highlights selected tool call', () => {
    const wrapper = mount(ThoughtChainPanel, {
      props: {
        blocks: [makeToolBlock('tc1', 'exec')],
        selectedToolCallId: 'tc1',
      },
    })
    expect(wrapper.find('[data-testid="tool-step-tc1"]').classes()).toContain('border-violet-500/60')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test test/renderer/components/chat/ThoughtChainPanel.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 所有测试 FAIL（组件不存在）。

- [ ] **Step 3: 创建组件**

创建 `src/renderer/src/components/chat/ThoughtChainPanel.vue`：

```vue
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '@shared/types/agent'

const props = defineProps<{
  blocks: AssistantMessageBlock[]
  selectedToolCallId?: string | null
}>()

const emit = defineEmits<{
  'select-tool-call': [id: string]
}>()
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto p-4">
    <div class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      思考过程
    </div>
    <div class="flex flex-col gap-2">
      <template v-for="(block, idx) in blocks" :key="idx">
        <!-- Content step -->
        <div v-if="block.type === 'content'" class="flex items-start gap-3">
          <span class="mt-0.5 min-w-[20px] text-center text-xs text-muted-foreground">
            {{ idx + 1 }}
          </span>
          <p class="text-xs leading-relaxed text-muted-foreground">{{ block.content }}</p>
        </div>

        <!-- Tool call step -->
        <div
          v-else-if="block.type === 'tool_call' && block.tool_call"
          :data-testid="`tool-step-${block.id}`"
          class="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-muted/30"
          :class="
            selectedToolCallId && block.id && selectedToolCallId === block.id
              ? 'border-violet-500/60 bg-violet-500/10'
              : 'border-border'
          "
          @click="block.id && emit('select-tool-call', block.id)"
        >
          <span class="min-w-[20px] text-center text-xs text-violet-400">{{ idx + 1 }}</span>
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
          <Icon
            v-else-if="block.status === 'error'"
            icon="lucide:x"
            class="h-3.5 w-3.5 shrink-0 text-red-400"
          />
          <Icon v-else icon="lucide:check" class="h-3.5 w-3.5 shrink-0 text-green-500" />
          <span class="font-medium text-foreground">{{ block.tool_call.name }}</span>
        </div>

        <!-- Error step -->
        <div v-else-if="block.type === 'error'" class="flex items-start gap-3">
          <span class="mt-0.5 min-w-[20px] text-center text-xs text-red-400">{{ idx + 1 }}</span>
          <p class="text-xs text-red-400">{{ block.content }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test test/renderer/components/chat/ThoughtChainPanel.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 所有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/ThoughtChainPanel.vue \
        test/renderer/components/chat/ThoughtChainPanel.test.ts
git commit -m "feat(chat): add ThoughtChainPanel component"
```

---

## Task 5: 串联 show-thought-chain 事件链

**Files:**
- Modify: `src/renderer/src/components/chat/ChatMessageList.vue`
- Modify: `src/renderer/src/components/chat/ChatView.vue`

`ChatMessageAssistant` → `ChatMessageList` → `ChatView` → `ChatroomPanel`

- [ ] **Step 1: ChatMessageList 加透传**

在 `ChatMessageList.vue` 的 `defineEmits` 加：

```ts
const emit = defineEmits<{
  'select-tool-call': [id: string]
  'show-thought-chain': [messageId?: string]
}>()
```

在两处 `<ChatMessageAssistant>` 标签（history 和 streaming）各加：

```html
@show-thought-chain="emit('show-thought-chain', $event)"
```

- [ ] **Step 2: ChatView 加透传**

在 `ChatView.vue` 的 `defineEmits` 加：

```ts
const emit = defineEmits<{
  openAgentEdit: [agentId: string]
  'select-tool-call': [id: string]
  'show-thought-chain': [messageId?: string]
}>()
```

在 `<ChatMessageList>` 标签加：

```html
@show-thought-chain="emit('show-thought-chain', $event)"
```

- [ ] **Step 3: 格式化 + 类型检查**

```bash
pnpm run format && pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageList.vue \
        src/renderer/src/components/chat/ChatView.vue
git commit -m "feat(chat): thread show-thought-chain event up to ChatroomPanel"
```

---

## Task 6: ChatroomPanel 思考链状态管理

**Files:**
- Modify: `src/renderer/src/views/ChatroomPanel.vue`

- [ ] **Step 1: 加状态和 computed**

在 `selectedToolCallId` ref 下方加：

```ts
const showStreamingThought = ref(false)
const selectedThoughtMessageId = ref<string | null>(null)

// 当前要展示在思考链面板的 blocks（agent 类型，不做转换）
const thoughtChainBlocks = computed<import('@shared/types/agent').AssistantMessageBlock[] | null>(
  () => {
    if (showStreamingThought.value) {
      return chatStore.streamingBlocks.filter((b) => !b.is_final)
    }
    if (selectedThoughtMessageId.value) {
      const msg = chatStore.messages.find((m) => m.id === selectedThoughtMessageId.value)
      if (!msg || msg.role !== 'assistant') return null
      try {
        const blocks = JSON.parse(
          msg.content,
        ) as import('@shared/types/agent').AssistantMessageBlock[]
        return blocks.filter((b) => !b.is_final)
      } catch {
        return null
      }
    }
    return null
  },
)
```

- [ ] **Step 2: 加事件处理器和 watch**

在 `onSelectToolCall` 下方加：

```ts
function onShowThoughtChain(messageId?: string) {
  if (messageId) {
    selectedThoughtMessageId.value = messageId
    showStreamingThought.value = false
  } else {
    showStreamingThought.value = true
    selectedThoughtMessageId.value = null
  }
  activeTab.value = 'preview'
}
```

在现有的 `watch(contentStore.content, ...)` 下方加：

```ts
// 流式结束时关闭流式思考链
watch(
  () => chatStore.isGenerating,
  (val) => {
    if (!val) showStreamingThought.value = false
  },
)
```

- [ ] **Step 3: 在 onSessionSelect 中重置**

将 `onSessionSelect` 改为：

```ts
function onSessionSelect(id: string) {
  selectedToolCallId.value = null
  selectedThoughtMessageId.value = null
  showStreamingThought.value = false
  sessionStore.setActiveSession(id)
  chatStore.fetchMessages(id)
}
```

- [ ] **Step 4: ChatView 绑定 show-thought-chain 事件**

在 `<ChatView>` 标签加：

```html
@show-thought-chain="onShowThoughtChain"
```

- [ ] **Step 5: ChatFunctionPanel 传递 thoughtChainBlocks**

将 `<ChatFunctionPanel>` 标签改为：

```html
<ChatFunctionPanel
  :active-tab="activeTab"
  :tool-call-blocks="toolCallBlocks"
  :selected-tool-call-id="selectedToolCallId"
  :thought-chain-blocks="thoughtChainBlocks"
  @update:active-tab="activeTab = $event"
  @select-tool-call="onSelectToolCall"
/>
```

- [ ] **Step 6: 格式化 + 类型检查**

```bash
pnpm run format && pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/ChatroomPanel.vue
git commit -m "feat(chat): manage thought-chain state in ChatroomPanel"
```

---

## Task 7: ChatFunctionPanel 接入 ThoughtChainPanel

**Files:**
- Modify: `src/renderer/src/components/chat/ChatFunctionPanel.vue`
- Modify: `test/renderer/components/chat/ChatFunctionPanel.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/renderer/components/chat/ChatFunctionPanel.test.ts` 末尾加：

```ts
it('shows ThoughtChainPanel in preview tab when thoughtChainBlocks provided', () => {
  const blocks = [
    { type: 'content', content: 'thinking', status: 'success', timestamp: 1 },
    { type: 'tool_call', id: 'tc1', status: 'success', timestamp: 1,
      tool_call: { id: 'tc1', name: 'exec', input: {}, output: 'ok' } },
  ]
  const wrapper = mount(ChatFunctionPanel, {
    props: { activeTab: 'preview', toolCallBlocks: [], thoughtChainBlocks: blocks },
  })
  expect(wrapper.text()).toContain('思考过程')
})

it('shows ContentDispatcher in preview tab when no thoughtChainBlocks', () => {
  const wrapper = mount(ChatFunctionPanel, {
    props: { activeTab: 'preview', toolCallBlocks: [], thoughtChainBlocks: null },
  })
  expect(wrapper.text()).toContain('暂无预览内容')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test test/renderer/components/chat/ChatFunctionPanel.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 新增两个测试 FAIL。

- [ ] **Step 3: 修改 ChatFunctionPanel**

在 `<script setup>` 加 import：

```ts
import ThoughtChainPanel from './ThoughtChainPanel.vue'
import type { AssistantMessageBlock as AgentBlock } from '@shared/types/agent'
```

在 `defineProps` 加字段：

```ts
defineProps<{
  activeTab: 'tools' | 'preview'
  toolCallBlocks: AssistantMessageBlock[]
  selectedToolCallId?: string | null
  thoughtChainBlocks?: AgentBlock[] | null
}>()
```

将 `<ContentDispatcher v-else-if="activeTab === 'preview'">` 改为：

```html
<template v-else-if="activeTab === 'preview'">
  <ThoughtChainPanel
    v-if="thoughtChainBlocks && thoughtChainBlocks.length > 0"
    :blocks="thoughtChainBlocks"
    :selected-tool-call-id="selectedToolCallId"
    @select-tool-call="$emit('select-tool-call', $event)"
  />
  <ContentDispatcher
    v-else
    :content="contentStore.content"
    @interaction-submit="onInteractionSubmit"
    @progress-cancel="onProgressCancel"
  />
</template>
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test test/renderer/components/chat/ChatFunctionPanel.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 全量测试**

```bash
pnpm test 2>&1 | tail -10
```

Expected: 无新增失败。

- [ ] **Step 6: 格式化 + Lint**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/chat/ChatFunctionPanel.vue \
        test/renderer/components/chat/ChatFunctionPanel.test.ts
git commit -m "feat(chat): show ThoughtChainPanel in preview tab"
```
