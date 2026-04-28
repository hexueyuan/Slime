# Agent 管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Settings 中新增 Agent tab，支持查看/新建/编辑/删除 Agent，并移除 NewThread 中散落的"新建 Agent"入口。

**Architecture:** 新建 `AgentSettings.vue` 组件，内嵌复用 `AgentEditDialog`；`SettingsDialog` 新增 agents tab；`NewThread` 移除新建按钮及其 emit 链。

**Tech Stack:** Vue 3 Composition API, Pinia (`useAgentStore`), Tailwind CSS, `@iconify/vue`

---

## 文件清单

| 操作 | 路径 |
|------|------|
| 新建 | `src/renderer/src/components/settings/AgentSettings.vue` |
| 修改 | `src/renderer/src/components/settings/SettingsDialog.vue` |
| 修改 | `src/renderer/src/components/chat/NewThread.vue` |
| 修改 | `src/renderer/src/views/ChatroomPanel.vue` |
| 新建 | `test/renderer/components/settings/AgentSettings.test.ts` |
| 修改 | `test/renderer/components/SettingsDialog.test.ts` |
| 修改 | `test/renderer/views/ChatroomPanel.test.ts` |

---

## Task 1: 新建 AgentSettings.vue

**Files:**
- Create: `src/renderer/src/components/settings/AgentSettings.vue`
- Create: `test/renderer/components/settings/AgentSettings.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/renderer/components/settings/AgentSettings.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockInvoke = vi.fn()
;(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
}

vi.mock('@/components/chat/AgentEditDialog.vue', () => ({
  default: {
    name: 'AgentEditDialog',
    props: ['open', 'agentId'],
    emits: ['update:open', 'saved'],
    template: '<div data-testid="agent-edit-dialog" :data-open="open" :data-agent-id="agentId" />',
  },
}))
vi.mock('@/components/chat/AgentAvatar.vue', () => ({
  default: {
    name: 'AgentAvatar',
    props: ['avatar', 'size'],
    template: '<div data-testid="agent-avatar" />',
  },
}))

import AgentSettings from '@/components/settings/AgentSettings.vue'

const AGENTS = [
  {
    id: 'hal-ai',
    name: 'HalAI',
    description: '内置助手',
    enabled: true,
    protected: true,
    avatar: null,
    config: {},
    type: 'builtin',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'my-agent',
    name: 'MyAgent',
    description: '自定义',
    enabled: true,
    protected: false,
    avatar: null,
    config: {},
    type: 'custom',
    createdAt: 0,
    updatedAt: 0,
  },
]

describe('AgentSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockImplementation(async (_ch: string, _name: string, method: string) => {
      if (method === 'listAgents') return AGENTS
      return null
    })
  })

  it('renders agent rows after fetch', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="agent-row"]')
    expect(rows).toHaveLength(2)
  })

  it('shows 内置 badge for protected agent', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.text()).toContain('内置')
  })

  it('hides delete button for protected agent', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="agent-row"]')
    const halRow = rows[0]
    expect(halRow.find('[data-testid="delete-btn"]').exists()).toBe(false)
  })

  it('shows delete button for non-protected agent', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="agent-row"]')
    const customRow = rows[1]
    expect(customRow.find('[data-testid="delete-btn"]').exists()).toBe(true)
  })

  it('opens dialog with no agentId on new agent click', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    await wrapper.find('[data-testid="new-agent-btn"]').trigger('click')
    const dialog = document.querySelector('[data-testid="agent-edit-dialog"]') as HTMLElement
    expect(dialog.dataset.open).toBe('true')
    expect(dialog.dataset.agentId).toBeFalsy()
  })

  it('opens dialog with agentId on edit click', async () => {
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="agent-row"]')
    await rows[1].find('[data-testid="edit-btn"]').trigger('click')
    const dialog = document.querySelector('[data-testid="agent-edit-dialog"]') as HTMLElement
    expect(dialog.dataset.open).toBe('true')
    expect(dialog.dataset.agentId).toBe('my-agent')
  })

  it('calls deleteAgent and re-fetches on delete confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockInvoke.mockImplementation(async (_ch: string, _name: string, method: string) => {
      if (method === 'listAgents') return AGENTS
      if (method === 'deleteAgent') return null
      return null
    })
    const wrapper = mount(AgentSettings, { attachTo: document.body })
    await flushPromises()
    const rows = wrapper.findAll('[data-testid="agent-row"]')
    await rows[1].find('[data-testid="delete-btn"]').trigger('click')
    await flushPromises()
    expect(mockInvoke).toHaveBeenCalledWith(
      'presenter:call',
      'agentConfigPresenter',
      'deleteAgent',
      ['my-agent'],
    )
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/renderer/components/settings/AgentSettings.test.ts
```

预期：FAIL，`Cannot find module '@/components/settings/AgentSettings.vue'`

- [ ] **Step 3: 创建 AgentSettings.vue**

创建 `src/renderer/src/components/settings/AgentSettings.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useAgentStore } from '@/stores/agent'
import AgentAvatar from '@/components/chat/AgentAvatar.vue'
import AgentEditDialog from '@/components/chat/AgentEditDialog.vue'

const agentStore = useAgentStore()

const editOpen = ref(false)
const editAgentId = ref<string | undefined>(undefined)

onMounted(() => agentStore.fetchAgents())

function openNew() {
  editAgentId.value = undefined
  editOpen.value = true
}

function openEdit(id: string) {
  editAgentId.value = id
  editOpen.value = true
}

async function onDelete(id: string) {
  if (!window.confirm('确定删除该 Agent？')) return
  await agentStore.deleteAgent(id)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground">Agent 管理</h3>
      <button
        data-testid="new-agent-btn"
        class="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500"
        @click="openNew"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        新建 Agent
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto">
      <div
        v-for="agent in agentStore.agents"
        :key="agent.id"
        data-testid="agent-row"
        class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
      >
        <AgentAvatar :avatar="agent.avatar" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-sm text-foreground">{{ agent.name }}</span>
            <span
              v-if="agent.protected"
              class="rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
            >
              内置
            </span>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ agent.description || '-' }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            data-testid="edit-btn"
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="openEdit(agent.id)"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!agent.protected"
            data-testid="delete-btn"
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400"
            @click="onDelete(agent.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        v-if="agentStore.agents.length === 0"
        class="py-8 text-center text-xs text-muted-foreground"
      >
        暂无 Agent
      </div>
    </div>

    <AgentEditDialog
      v-model:open="editOpen"
      :agent-id="editAgentId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/renderer/components/settings/AgentSettings.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/settings/AgentSettings.vue test/renderer/components/settings/AgentSettings.test.ts
git commit -m "feat(chat): add AgentSettings component"
```

---

## Task 2: SettingsDialog 新增 agents tab

**Files:**
- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`
- Modify: `test/renderer/components/SettingsDialog.test.ts`

- [ ] **Step 1: 补充失败测试**

在 `test/renderer/components/SettingsDialog.test.ts` 末尾追加：

```typescript
  it('should render agent tab button', () => {
    mount(SettingsDialog, { props: { open: true }, attachTo: document.body })
    const buttons = document.querySelectorAll('button')
    const agentBtn = Array.from(buttons).find((b) => b.textContent?.trim() === 'Agent')
    expect(agentBtn).not.toBeUndefined()
  })
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/renderer/components/SettingsDialog.test.ts
```

预期：最后一个用例 FAIL，`agentBtn` 为 undefined

- [ ] **Step 3: 修改 SettingsDialog.vue**

将 `src/renderer/src/components/settings/SettingsDialog.vue` 完整替换为：

```vue
<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Overlay -->
      <div
        data-testid="settings-overlay"
        class="absolute inset-0 bg-black/50"
        @click="$emit('update:open', false)"
      />
      <!-- Dialog -->
      <div
        class="relative flex h-[560px] w-[640px] overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <!-- Left nav -->
        <div class="flex w-48 shrink-0 flex-col border-r border-border bg-sidebar p-3">
          <h2
            class="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            设置
          </h2>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'profile'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'profile'"
          >
            个人资料
          </button>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'gateway'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'gateway'"
          >
            网关
          </button>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'general'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'general'"
          >
            通用
          </button>
          <button
            :class="[
              'rounded-md px-3 py-1.5 text-left text-sm',
              activeTab === 'agents'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            ]"
            @click="activeTab = 'agents'"
          >
            Agent
          </button>
        </div>
        <!-- Right content -->
        <div class="flex flex-1 flex-col overflow-y-auto p-5">
          <ProfileSettings v-if="activeTab === 'profile'" />
          <GatewaySettings v-else-if="activeTab === 'gateway'" />
          <GeneralSettings v-else-if="activeTab === 'general'" />
          <AgentSettings v-else-if="activeTab === 'agents'" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import GatewaySettings from './GatewaySettings.vue'
import ProfileSettings from './ProfileSettings.vue'
import GeneralSettings from './GeneralSettings.vue'
import AgentSettings from './AgentSettings.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const activeTab = ref<'profile' | 'gateway' | 'general' | 'agents'>('profile')

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('update:open', false)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/renderer/components/SettingsDialog.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/settings/SettingsDialog.vue test/renderer/components/SettingsDialog.test.ts
git commit -m "feat(chat): add agents tab to SettingsDialog"
```

---

## Task 3: 移除 NewThread 新建入口，清理 ChatroomPanel

**Files:**
- Modify: `src/renderer/src/components/chat/NewThread.vue`
- Modify: `src/renderer/src/views/ChatroomPanel.vue`
- Modify: `test/renderer/views/ChatroomPanel.test.ts`

- [ ] **Step 1: 修改 NewThread.vue**

移除 `defineEmits`、`$emit('openAgentEdit')` 以及"新建 Agent"按钮，将 `NewThread.vue` 替换为：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import NewThreadInput from './NewThreadInput.vue'
import { useAgentStore } from '@/stores/agent'
import { useAgentSessionStore } from '@/stores/agentSession'
import { useAgentChatStore } from '@/stores/agentChat'
import type { Agent } from '@shared/types/agent'

const agentStore = useAgentStore()
const sessionStore = useAgentSessionStore()
const chatStore = useAgentChatStore()

const selectedAgentId = ref<string | null>(null)

onMounted(() => {
  const halAi = agentStore.enabledAgents.find((a) => a.id === 'hal-ai')
  if (halAi) {
    selectedAgentId.value = halAi.id
  } else if (agentStore.enabledAgents.length > 0) {
    selectedAgentId.value = agentStore.enabledAgents[0].id
  }
})

function getAvatarStyle(agent: Agent) {
  if (!agent.avatar) return {}
  if (agent.avatar.kind === 'lucide') {
    return { color: agent.avatar.color ?? '#a855f7' }
  }
  return {}
}

async function onSend(content: string) {
  if (!selectedAgentId.value) return
  const session = await sessionStore.createSession(selectedAgentId.value)
  await chatStore.sendMessage(session.id, content)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <!-- Title -->
      <Icon icon="lucide:message-square-plus" class="mb-3 h-10 w-10 text-violet-500/50" />
      <h2 class="mb-1 text-lg font-medium text-foreground">开始新对话</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择一个 Agent 开始</p>

      <!-- Agent chips -->
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :class="[
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
            selectedAgentId === agent.id
              ? 'border-violet-500 bg-violet-500/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="selectedAgentId = agent.id"
        >
          <!-- Avatar -->
          <template v-if="agent.avatar?.kind === 'lucide'">
            <Icon :icon="agent.avatar.icon" class="h-4 w-4" :style="getAvatarStyle(agent)" />
          </template>
          <template v-else-if="agent.avatar?.kind === 'monogram'">
            <span
              class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
              :style="{ backgroundColor: agent.avatar.backgroundColor ?? '#7c3aed' }"
            >
              {{ agent.avatar.text }}
            </span>
          </template>
          <template v-else>
            <Icon icon="lucide:bot" class="h-4 w-4 text-violet-400" />
          </template>
          {{ agent.name }}
        </button>
      </div>
    </div>

    <!-- Bottom input -->
    <NewThreadInput placeholder="输入消息开始对话..." :disabled="!selectedAgentId" @send="onSend" />
  </div>
</template>
```

- [ ] **Step 2: 修改 ChatroomPanel.vue**

在 `ChatroomPanel.vue` 中，将 `<NewThread>` 的行从：

```html
<NewThread v-if="!sessionStore.activeSessionId" @open-agent-edit="openAgentEdit()" />
```

改为：

```html
<NewThread v-if="!sessionStore.activeSessionId" />
```

（`openAgentEdit` 函数保留，因为 `ChatView` 仍通过 `@open-agent-edit` 调用它来编辑当前会话的 Agent。）

- [ ] **Step 3: 更新 ChatroomPanel.test.ts 中 NewThread mock**

在 `test/renderer/views/ChatroomPanel.test.ts` 中，将 NewThread mock 从：

```typescript
vi.mock('@/components/chat/NewThread.vue', () => ({
  default: {
    name: 'NewThread',
    emits: ['openAgentEdit'],
    template: '<div data-testid="new-thread" />',
  },
}))
```

改为：

```typescript
vi.mock('@/components/chat/NewThread.vue', () => ({
  default: {
    name: 'NewThread',
    template: '<div data-testid="new-thread" />',
  },
}))
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/renderer/views/ChatroomPanel.test.ts
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/chat/NewThread.vue src/renderer/src/views/ChatroomPanel.vue test/renderer/views/ChatroomPanel.test.ts
git commit -m "feat(chat): remove new-agent entry from NewThread"
```

---

## Task 4: 全量验证

- [ ] **Step 1: 运行全部测试**

```bash
pnpm test
```

预期：无新增失败（已有 pre-existing statsDao 失败不计）

- [ ] **Step 2: lint + format**

```bash
pnpm run format && pnpm run lint
```

预期：无报错

- [ ] **Step 3: typecheck**

```bash
pnpm run typecheck
```

预期：无报错
