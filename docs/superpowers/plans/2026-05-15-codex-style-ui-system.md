# Codex-style UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Codex-style Slime UI system, then migrate the main app shell and high-impact pages onto it.

**Architecture:** Add semantic design tokens first, then build small Vue primitives in `components/ui/`, app layout components in `components/layout/`, and feature-specific reusable cards in `components/slime/`. Feature pages keep their existing stores and Presenter calls; only presentation and local component composition changes.

**Tech Stack:** Vue 3 Composition API, TypeScript, Tailwind CSS v4, Iconify lucide icons, Vitest, Vue Test Utils.

---

## Visual Reference

Use the approved prototype as the visual baseline:

- `docs/superpowers/prototypes/codex-style-ui-preview.html`

The implementation should match the prototype direction, not copy every HTML class literally. Real components should use semantic props, slots, and existing app data.

## File Structure

### Create

- `src/renderer/src/components/ui/SlimeButton.vue`  
  Shared button variants: primary, secondary, ghost, danger, icon. Supports disabled state.
- `src/renderer/src/components/ui/SlimeIconButton.vue`  
  Stable icon-only control for chrome, toolbar, and compact actions.
- `src/renderer/src/components/ui/SlimeBadge.vue`  
  Low-contrast metadata/status badges.
- `src/renderer/src/components/ui/SlimeInput.vue`  
  Search and form input styling.
- `src/renderer/src/components/ui/SlimeTextarea.vue`  
  Auto-resizing textarea used by composers and forms.
- `src/renderer/src/components/ui/SlimePanel.vue`  
  Standard low-contrast panel wrapper.
- `src/renderer/src/components/ui/SlimeListItem.vue`  
  Selectable row for sessions, navigation, tasks, and logs.
- `src/renderer/src/components/ui/SlimeTabs.vue`  
  Compact tab control.
- `src/renderer/src/components/ui/SlimeChecklist.vue`  
  Checkbox and switch rows for MCP, agent, and settings pages.
- `src/renderer/src/components/ui/SlimeComposer.vue`  
  Prompt composer with toolbar slots, send/stop controls, disabled states, and keyboard submit behavior.
- `src/renderer/src/components/layout/AppShell.vue`  
  Window-level shell matching approved Codex-like expanded sidebar structure.
- `src/renderer/src/components/layout/AppSidebarNav.vue`  
  Expanded left sidebar with chrome controls, primary navigation, project/session sections, status button, and settings entry.
- `src/renderer/src/components/layout/WorkspaceCanvas.vue`  
  Main rounded canvas wrapper.
- `src/renderer/src/components/layout/PageHeader.vue`  
  Compact title/action row for operational pages.
- `src/renderer/src/components/layout/SplitWorkspace.vue`  
  Shared split layout for chat plus function panel.
- `src/renderer/src/components/slime/SlimeAgentCard.vue`  
  Agent selection and agent management card.
- `src/renderer/src/components/slime/SlimeProfileCard.vue`  
  User and Agent profile summary card.
- `src/renderer/src/components/slime/SlimeRealtimeChart.vue`  
  Multi-metric realtime chart shell. The first pass may render SVG/CSS trend paths; later passes can wrap ECharts.
- `src/renderer/src/components/slime/SlimeRankBoard.vue`  
  Compact leaderboard for Gateway ranking.
- `src/renderer/src/components/slime/SlimeLogCard.vue`  
  Gateway log row/card.
- `src/renderer/src/components/slime/SlimeWeekCalendar.vue`  
  Horizontal week calendar with previous/next events and date selection.
- `src/renderer/src/components/slime/SlimeTaskList.vue`  
  Task list rows with status, metadata, and completion state.
- `src/renderer/src/components/slime/SlimeTimeline.vue`  
  Timeline event stream.
- `test/renderer/components/SlimeComposer.test.ts`
- `test/renderer/components/SlimeChecklist.test.ts`
- `test/renderer/components/AppSidebarNav.test.ts`
- `test/renderer/components/SlimeWeekCalendar.test.ts`

### Modify

- `src/renderer/src/assets/main.css`  
  Add semantic tokens and typography baseline while preserving existing Tailwind aliases.
- `src/renderer/src/App.vue`  
  Use `AppShell`, `AppSidebarNav`, and `WorkspaceCanvas`.
- `src/renderer/src/components/AppSidebar.vue`  
  Remove after replacement or keep as a compatibility wrapper that delegates to `AppSidebarNav`.
- `src/renderer/src/views/ChatroomPanel.vue`  
  Use `SplitWorkspace` and updated sidebar/canvas spacing.
- `src/renderer/src/components/chat/SessionList.vue`  
  Use shared list rows and Codex-like sidebar section styling.
- `src/renderer/src/components/chat/NewThread.vue`  
  Use `SlimeComposer` and `SlimeAgentCard`.
- `src/renderer/src/components/chat/ChatInput.vue`  
  Use `SlimeComposer` while preserving error, pending question, retry, stop, and attachment behavior.
- `src/renderer/src/views/GroupChatPanel.vue`
- `src/renderer/src/components/groupchat/GroupSessionList.vue`
- `src/renderer/src/components/groupchat/NewGroupThread.vue`
- `src/renderer/src/components/groupchat/GroupChatInput.vue`
- `src/renderer/src/views/GatewayPanel.vue`
- `src/renderer/src/components/gateway/StatsChart.vue`
- `src/renderer/src/components/gateway/ChannelRealtimeChart.vue`
- `src/renderer/src/components/gateway/RankBoard.vue`
- `src/renderer/src/components/gateway/LogTab.vue`
- `src/renderer/src/views/AgentPanel.vue`
- `src/renderer/src/components/agents/AgentManageTab.vue`
- `src/renderer/src/components/agents/AgentEditForm.vue`
- `src/renderer/src/views/SchedulePanel.vue`
- `src/renderer/src/components/schedule/WeekCalendar.vue`
- `src/renderer/src/components/schedule/TaskBoard.vue`
- `src/renderer/src/components/schedule/TimelinePanel.vue`
- `src/renderer/src/components/settings/SettingsDialog.vue`

## Task 1: Add Design Tokens

**Files:**
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Add semantic token variables**

Add these variables to `:root` and `.dark`, preserving the existing aliases:

```css
:root {
  --color-app: #f7f7f8;
  --color-app-canvas: #ffffff;
  --color-app-sidebar: rgba(246, 246, 247, 0.82);
  --color-app-elevated: #ffffff;
  --color-text-primary: #1f1f21;
  --color-text-secondary: #4f4f55;
  --color-text-muted: #76767d;
  --color-text-disabled: #a0a0a8;
  --color-border-subtle: rgba(0, 0, 0, 0.08);
  --color-border-strong: rgba(0, 0, 0, 0.14);
  --color-control: rgba(0, 0, 0, 0.045);
  --color-control-hover: rgba(0, 0, 0, 0.075);
  --color-control-active: rgba(0, 0, 0, 0.105);
  --color-accent: #7e5af5;
  --color-accent-hover: #8d6bff;
  --color-accent-soft: rgba(126, 90, 245, 0.14);
  --color-success: #35b979;
  --color-warning: #d89035;
  --color-danger: #e45d5d;
  --radius-xs: 5px;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 18px;
  --shadow-panel: 0 12px 38px rgba(0, 0, 0, 0.12);
  --shadow-floating: 0 22px 70px rgba(0, 0, 0, 0.22);
}

.dark {
  --color-app: #101011;
  --color-app-canvas: #151516;
  --color-app-sidebar: rgba(38, 38, 39, 0.78);
  --color-app-elevated: #242425;
  --color-text-primary: #f2f2f2;
  --color-text-secondary: #c9c9ca;
  --color-text-muted: #909093;
  --color-text-disabled: #646467;
  --color-border-subtle: rgba(255, 255, 255, 0.065);
  --color-border-strong: rgba(255, 255, 255, 0.105);
  --color-control: rgba(255, 255, 255, 0.035);
  --color-control-hover: rgba(255, 255, 255, 0.065);
  --color-control-active: rgba(255, 255, 255, 0.095);
  --color-accent: #7e5af5;
  --color-accent-hover: #9b86ff;
  --color-accent-soft: rgba(155, 134, 255, 0.16);
  --color-success: #4cd987;
  --color-warning: #f2b35d;
  --color-danger: #ff7b7b;
  --shadow-panel: 0 12px 38px rgba(0, 0, 0, 0.24);
  --shadow-floating: 0 22px 70px rgba(0, 0, 0, 0.42);
}
```

- [ ] **Step 2: Map existing aliases**

Update the existing `.dark` aliases so old components inherit the new palette:

```css
.dark {
  --color-background: var(--color-app-canvas);
  --color-foreground: var(--color-text-primary);
  --color-muted: var(--color-control);
  --color-muted-foreground: var(--color-text-muted);
  --color-border: var(--color-border-strong);
  --color-input: var(--color-control);
  --color-primary: var(--color-text-primary);
  --color-primary-foreground: #111111;
  --color-accent: var(--color-control-hover);
  --color-accent-foreground: var(--color-text-primary);
  --color-card: var(--color-app-elevated);
  --color-card-foreground: var(--color-text-primary);
  --color-sidebar: var(--color-app-sidebar);
  --color-input-border: var(--color-border-strong);
}
```

- [ ] **Step 3: Add typography baseline**

Add this base rule:

```css
body {
  font-family:
    Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  letter-spacing: 0;
}
```

- [ ] **Step 4: Verify formatting**

Run:

```bash
pnpm run format
```

Expected: command exits `0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "style(ui): add codex style tokens"
```

## Task 2: Build Button, Badge, Input, Panel Primitives

**Files:**
- Create: `src/renderer/src/components/ui/SlimeButton.vue`
- Create: `src/renderer/src/components/ui/SlimeIconButton.vue`
- Create: `src/renderer/src/components/ui/SlimeBadge.vue`
- Create: `src/renderer/src/components/ui/SlimeInput.vue`
- Create: `src/renderer/src/components/ui/SlimeTextarea.vue`
- Create: `src/renderer/src/components/ui/SlimePanel.vue`

- [ ] **Step 1: Create `SlimeButton.vue`**

Use this prop API:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    disabled: false,
    type: 'button',
  },
)

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-soft)]',
  'disabled:cursor-not-allowed disabled:border-[var(--color-border-subtle)] disabled:bg-[var(--color-control)] disabled:text-[var(--color-text-disabled)]',
  props.size === 'sm' && 'h-7 px-2.5 text-xs',
  props.size === 'md' && 'h-8 px-3 text-[13px]',
  props.size === 'lg' && 'h-9 px-4 text-sm',
  props.variant === 'primary' &&
    'border border-white/10 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]',
  props.variant === 'secondary' &&
    'border border-[var(--color-border-strong)] bg-[var(--color-control)] text-[var(--color-text-primary)] hover:bg-[var(--color-control-hover)]',
  props.variant === 'ghost' &&
    'border border-transparent bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
  props.variant === 'danger' &&
    'border border-red-400/30 bg-red-500/10 text-[var(--color-danger)] hover:bg-red-500/15',
])
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
```

- [ ] **Step 2: Create `SlimeIconButton.vue`**

Use this prop API:

```vue
<script setup lang="ts">
import { Icon } from '@iconify/vue'

withDefaults(
  defineProps<{
    icon: string
    title: string
    size?: 'sm' | 'md'
    disabled?: boolean
  }>(),
  { size: 'md', disabled: false },
)
</script>

<template>
  <button
    type="button"
    :title="title"
    :disabled="disabled"
    :class="[
      'inline-grid place-items-center border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors',
      'hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]',
      'disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:hover:border-transparent disabled:hover:bg-transparent',
      size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-[var(--radius-sm)]',
    ]"
  >
    <Icon :icon="icon" :class="size === 'sm' ? 'h-4 w-4' : 'h-[17px] w-[17px]'" />
  </button>
</template>
```

- [ ] **Step 3: Create remaining primitive wrappers**

Create `SlimeBadge.vue`, `SlimeInput.vue`, `SlimeTextarea.vue`, and `SlimePanel.vue` using the same token names. `SlimeTextarea.vue` must emit `update:modelValue` and auto-resize on input.

- [ ] **Step 4: Run typecheck**

```bash
pnpm run typecheck:web
```

Expected: command exits `0`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui
git commit -m "feat(ui): add core slime primitives"
```

## Task 3: Test and Build `SlimeComposer`

**Files:**
- Create: `test/renderer/components/SlimeComposer.test.ts`
- Create: `src/renderer/src/components/ui/SlimeComposer.vue`

- [ ] **Step 1: Write failing tests**

Create `test/renderer/components/SlimeComposer.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SlimeComposer from '@/components/ui/SlimeComposer.vue'

describe('SlimeComposer', () => {
  it('submits trimmed text on Enter and clears the field', async () => {
    const wrapper = mount(SlimeComposer)
    const textarea = wrapper.get('textarea')

    await textarea.setValue('  hello slime  ')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toEqual([['hello slime']])
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('does not submit on Shift+Enter', async () => {
    const wrapper = mount(SlimeComposer)
    const textarea = wrapper.get('textarea')

    await textarea.setValue('hello')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('emits stop while streaming', async () => {
    const wrapper = mount(SlimeComposer, { props: { isStreaming: true } })

    await wrapper.get('[data-testid="composer-stop"]').trigger('click')

    expect(wrapper.emitted('stop')).toEqual([[]])
  })

  it('does not submit when disabled', async () => {
    const wrapper = mount(SlimeComposer, { props: { disabled: true } })
    const textarea = wrapper.get('textarea')

    await textarea.setValue('blocked')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

```bash
pnpm vitest run test/renderer/components/SlimeComposer.test.ts
```

Expected: FAIL because `SlimeComposer.vue` does not exist.

- [ ] **Step 3: Implement `SlimeComposer.vue`**

Implement props:

```ts
withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    isStreaming?: boolean
    meta?: string
  }>(),
  {
    placeholder: '输入消息...',
    disabled: false,
    isStreaming: false,
    meta: '',
  },
)
```

Implement events:

```ts
const emit = defineEmits<{
  submit: [text: string]
  stop: []
  'add-files': []
}>()
```

The template must include:

```vue
<textarea
  ref="textareaRef"
  v-model="inputText"
  :placeholder="placeholder"
  :disabled="disabled"
  @keydown="onKeydown"
  @input="autoResize"
/>
<button v-if="isStreaming" data-testid="composer-stop" @click="emit('stop')">...</button>
<button v-else data-testid="composer-send" :disabled="!inputText.trim() || disabled" @click="submit">...</button>
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
pnpm vitest run test/renderer/components/SlimeComposer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/SlimeComposer.vue test/renderer/components/SlimeComposer.test.ts
git commit -m "feat(ui): add shared composer"
```

## Task 4: Test and Build `SlimeChecklist`

**Files:**
- Create: `test/renderer/components/SlimeChecklist.test.ts`
- Create: `src/renderer/src/components/ui/SlimeChecklist.vue`

- [ ] **Step 1: Write failing tests**

Create `test/renderer/components/SlimeChecklist.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SlimeChecklist from '@/components/ui/SlimeChecklist.vue'

describe('SlimeChecklist', () => {
  it('emits toggle when a checkbox row is clicked', async () => {
    const wrapper = mount(SlimeChecklist, {
      props: {
        items: [
          {
            id: 'mcp',
            title: '启用 MCP 工具',
            description: '允许当前 Agent 调用已授权的外部工具',
            checked: true,
          },
        ],
      },
    })

    await wrapper.get('[data-testid="check-row-mcp"]').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([['mcp', false]])
  })

  it('emits toggle for switch rows', async () => {
    const wrapper = mount(SlimeChecklist, {
      props: {
        items: [
          {
            id: 'router',
            title: '智能路由',
            checked: false,
            control: 'switch',
          },
        ],
      },
    })

    await wrapper.get('[data-testid="check-row-router"]').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([['router', true]])
  })
})
```

- [ ] **Step 2: Run test to verify RED**

```bash
pnpm vitest run test/renderer/components/SlimeChecklist.test.ts
```

Expected: FAIL because `SlimeChecklist.vue` does not exist.

- [ ] **Step 3: Implement `SlimeChecklist.vue`**

Use this public item type:

```ts
export type SlimeChecklistItem = {
  id: string
  title: string
  description?: string
  checked: boolean
  disabled?: boolean
  badge?: string
  control?: 'checkbox' | 'switch'
}
```

Use this event signature:

```ts
const emit = defineEmits<{
  toggle: [id: string, checked: boolean]
}>()
```

Rows must include:

```vue
<button
  v-for="item in items"
  :key="item.id"
  type="button"
  :data-testid="`check-row-${item.id}`"
  :disabled="item.disabled"
  @click="emit('toggle', item.id, !item.checked)"
>
  ...
</button>
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
pnpm vitest run test/renderer/components/SlimeChecklist.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/SlimeChecklist.vue test/renderer/components/SlimeChecklist.test.ts
git commit -m "feat(ui): add shared checklist"
```

## Task 5: Build App Shell and Sidebar

**Files:**
- Create: `src/renderer/src/components/layout/AppShell.vue`
- Create: `src/renderer/src/components/layout/AppSidebarNav.vue`
- Create: `src/renderer/src/components/layout/WorkspaceCanvas.vue`
- Modify: `src/renderer/src/App.vue`
- Test: `test/renderer/components/AppSidebarNav.test.ts`

- [ ] **Step 1: Write failing sidebar nav test**

Create `test/renderer/components/AppSidebarNav.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppSidebarNav from '@/components/layout/AppSidebarNav.vue'

describe('AppSidebarNav', () => {
  it('emits active view updates from primary navigation', async () => {
    const wrapper = mount(AppSidebarNav, {
      props: { activeView: 'chatroom' },
      global: {
        stubs: {
          SettingsDialog: true,
        },
      },
    })

    await wrapper.get('[data-testid="sidebar-groupchat"]').trigger('click')

    expect(wrapper.emitted('update:activeView')).toEqual([['groupchat']])
  })
})
```

- [ ] **Step 2: Run test to verify RED**

```bash
pnpm vitest run test/renderer/components/AppSidebarNav.test.ts
```

Expected: FAIL because `AppSidebarNav.vue` does not exist.

- [ ] **Step 3: Implement `AppShell.vue`**

Use the approved structure:

```vue
<template>
  <div class="grid h-screen w-screen grid-cols-[330px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[var(--color-border-strong)] bg-[var(--color-app)] text-[var(--color-text-primary)]">
    <slot name="sidebar" />
    <main class="min-w-0 overflow-hidden rounded-tl-[15px] border-l border-t border-[var(--color-border-subtle)] bg-[var(--color-app-canvas)]">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 4: Implement `AppSidebarNav.vue`**

Move behavior from `AppSidebar.vue`: same `activeView` prop, same `update:activeView` emit, same Settings dialog state. Use lucide icons via `@iconify/vue`.

Required test ids:

```txt
sidebar-chatroom
sidebar-groupchat
sidebar-schedule
sidebar-gateway
sidebar-agents
sidebar-settings
```

- [ ] **Step 5: Implement `WorkspaceCanvas.vue`**

```vue
<template>
  <section class="h-full min-w-0 overflow-hidden bg-[var(--color-app-canvas)]">
    <slot />
  </section>
</template>
```

- [ ] **Step 6: Update `App.vue`**

Replace the old outer shell with:

```vue
<AppShell>
  <template #sidebar>
    <AppSidebarNav v-model:active-view="activeView" />
  </template>
  <KeepAlive>
    <component :is="currentComponent" :key="activeView" />
  </KeepAlive>
</AppShell>
```

- [ ] **Step 7: Run test to verify GREEN**

```bash
pnpm vitest run test/renderer/components/AppSidebarNav.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.vue src/renderer/src/components/layout test/renderer/components/AppSidebarNav.test.ts
git commit -m "feat(ui): add codex style app shell"
```

## Task 6: Migrate Chatroom

**Files:**
- Modify: `src/renderer/src/views/ChatroomPanel.vue`
- Modify: `src/renderer/src/components/chat/SessionList.vue`
- Modify: `src/renderer/src/components/chat/NewThread.vue`
- Modify: `src/renderer/src/components/chat/ChatInput.vue`

- [ ] **Step 1: Preserve behavior before visual changes**

Run:

```bash
pnpm vitest run test/renderer/components
```

Expected: existing renderer component tests either pass or unrelated failures are recorded before edits.

- [ ] **Step 2: Update `NewThread.vue`**

Replace bottom `NewThreadInput` with `SlimeComposer`. Preserve:

```ts
async function onSend(content: string) {
  if (!selectedAgentId.value) return
  const session = await sessionStore.createSession(selectedAgentId.value)
  await chatStore.sendMessage(session.id, content)
}
```

Render `SlimeAgentCard` for each enabled agent.

- [ ] **Step 3: Update `ChatInput.vue`**

Wrap existing error and pending question blocks above `SlimeComposer`. Preserve these events:

```txt
submit
stop
add-files
remove-file
dismiss-error
retry
answer-question
```

Pass `isStreaming` to `SlimeComposer`.

- [ ] **Step 4: Update `SessionList.vue`**

Use shared sidebar/list styling. Keep context menu, rename, archive, pin, and delete behavior unchanged.

- [ ] **Step 5: Update `ChatroomPanel.vue`**

Use `SplitWorkspace` or equivalent tokenized split layout. Keep `useSplitPane` behavior unchanged.

- [ ] **Step 6: Verify Chatroom**

Run:

```bash
pnpm run typecheck:web
pnpm vitest run test/renderer/components/SlimeComposer.test.ts
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/ChatroomPanel.vue src/renderer/src/components/chat
git commit -m "feat(ui): migrate chatroom to shared components"
```

## Task 7: Migrate GroupChat

**Files:**
- Modify: `src/renderer/src/views/GroupChatPanel.vue`
- Modify: `src/renderer/src/components/groupchat/GroupSessionList.vue`
- Modify: `src/renderer/src/components/groupchat/NewGroupThread.vue`
- Modify: `src/renderer/src/components/groupchat/GroupChatInput.vue`

- [ ] **Step 1: Preserve mention behavior**

Before editing, copy the existing `parseMentions` behavior into a test or keep it local and verify manually with:

```txt
@AgentName sends the matching participant agent id once.
@AgentName, also matches after comma trimming.
Unknown names are ignored.
```

- [ ] **Step 2: Update `NewGroupThread.vue`**

Use `SlimeAgentCard`, `SlimeChecklist`, `SlimeInput`, and `SlimeButton`. Preserve:

```ts
await sessionStore.createSession(
  selectedAgentIds.value,
  moderatorEnabled.value,
  workspacePaths.value,
)
```

- [ ] **Step 3: Update `GroupChatInput.vue`**

Use `SlimeComposer` while preserving mention dropdown and `send(content, mentionedAgentIds)` emit.

- [ ] **Step 4: Update `GroupSessionList.vue`**

Use shared list rows. Preserve detached-window logic:

```ts
window.electron.ipcRenderer.invoke('group_chat:open_detached', sessionId)
window.electron.ipcRenderer.invoke('group_chat:focus_detached', sessionId)
```

- [ ] **Step 5: Verify GroupChat**

Run:

```bash
pnpm run typecheck:web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/GroupChatPanel.vue src/renderer/src/components/groupchat
git commit -m "feat(ui): migrate group chat to shared components"
```

## Task 8: Build Gateway Components and Migrate Gateway

**Files:**
- Create: `src/renderer/src/components/slime/SlimeRealtimeChart.vue`
- Create: `src/renderer/src/components/slime/SlimeRankBoard.vue`
- Create: `src/renderer/src/components/slime/SlimeLogCard.vue`
- Modify: `src/renderer/src/views/GatewayPanel.vue`
- Modify: `src/renderer/src/components/gateway/StatsChart.vue`
- Modify: `src/renderer/src/components/gateway/ChannelRealtimeChart.vue`
- Modify: `src/renderer/src/components/gateway/RankBoard.vue`
- Modify: `src/renderer/src/components/gateway/LogTab.vue`

- [ ] **Step 1: Inspect current dirty Gateway files**

Run:

```bash
git status --short src/renderer/src/views/GatewayPanel.vue src/renderer/src/components/gateway
```

Expected: note existing unrelated dirty files before editing. Do not revert them.

- [ ] **Step 2: Implement `SlimeRealtimeChart.vue`**

Props:

```ts
type Metric = {
  id: string
  label: string
  value: string
  trend?: string
  color?: string
}

defineProps<{
  title: string
  metrics: Metric[]
  activeMetricId: string
}>()
```

Events:

```ts
const emit = defineEmits<{ 'update:activeMetricId': [id: string] }>()
```

- [ ] **Step 3: Implement `SlimeRankBoard.vue`**

Props:

```ts
type RankItem = {
  id: string
  title: string
  value: string
  caption: string
  percent: number
  status?: string
}
```

- [ ] **Step 4: Implement `SlimeLogCard.vue`**

Props:

```ts
type LogTone = 'ok' | 'warn' | 'error' | 'neutral'
defineProps<{
  statusCode: string | number
  tone: LogTone
  title: string
  meta: string
  badge?: string
}>()
```

- [ ] **Step 5: Migrate Gateway panels**

Replace local card shells with `SlimePanel`, `SlimeRealtimeChart`, `SlimeRankBoard`, and `SlimeLogCard`. Preserve refresh scheduler and Gateway store behavior.

- [ ] **Step 6: Verify Gateway tests**

Run:

```bash
pnpm vitest run test/renderer/components/ChannelTab.performance.test.ts test/renderer/components/LogTab.performance.test.ts
pnpm run typecheck:web
```

Expected: tests pass, or unrelated pre-existing failures are documented with the earlier dirty-file evidence.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/slime src/renderer/src/views/GatewayPanel.vue src/renderer/src/components/gateway
git commit -m "feat(ui): migrate gateway dashboard components"
```

## Task 9: Build Schedule Components and Migrate Schedule

**Files:**
- Create: `test/renderer/components/SlimeWeekCalendar.test.ts`
- Create: `src/renderer/src/components/slime/SlimeWeekCalendar.vue`
- Create: `src/renderer/src/components/slime/SlimeTaskList.vue`
- Create: `src/renderer/src/components/slime/SlimeTimeline.vue`
- Modify: `src/renderer/src/views/SchedulePanel.vue`
- Modify: `src/renderer/src/components/schedule/WeekCalendar.vue`
- Modify: `src/renderer/src/components/schedule/TaskBoard.vue`
- Modify: `src/renderer/src/components/schedule/TimelinePanel.vue`

- [ ] **Step 1: Write failing week calendar test**

Create:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SlimeWeekCalendar from '@/components/slime/SlimeWeekCalendar.vue'

describe('SlimeWeekCalendar', () => {
  it('emits navigation and date selection events', async () => {
    const days = [
      { id: '2026-05-11', label: '周一', number: '11', dots: 1 },
      { id: '2026-05-12', label: '周二', number: '12', dots: 0 },
    ]
    const wrapper = mount(SlimeWeekCalendar, {
      props: { days, selectedDayId: '2026-05-11' },
    })

    await wrapper.get('[data-testid="week-next"]').trigger('click')
    await wrapper.get('[data-testid="day-2026-05-12"]').trigger('click')

    expect(wrapper.emitted('next')).toEqual([[]])
    expect(wrapper.emitted('select')).toEqual([['2026-05-12']])
  })
})
```

- [ ] **Step 2: Run test to verify RED**

```bash
pnpm vitest run test/renderer/components/SlimeWeekCalendar.test.ts
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement schedule components**

Implement `SlimeWeekCalendar`, `SlimeTaskList`, and `SlimeTimeline` with plain props and emits. Do not import schedule stores inside these shared components.

- [ ] **Step 4: Migrate existing Schedule wrappers**

Keep existing store and Presenter calls in current schedule components. Use new shared components for presentation.

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run test/renderer/components/SlimeWeekCalendar.test.ts
pnpm run typecheck:web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/slime/SlimeWeekCalendar.vue src/renderer/src/components/slime/SlimeTaskList.vue src/renderer/src/components/slime/SlimeTimeline.vue src/renderer/src/components/schedule src/renderer/src/views/SchedulePanel.vue test/renderer/components/SlimeWeekCalendar.test.ts
git commit -m "feat(ui): add schedule components"
```

## Task 10: Migrate Agents, Settings, and Function Panels

**Files:**
- Create: `src/renderer/src/components/slime/SlimeAgentCard.vue`
- Create: `src/renderer/src/components/slime/SlimeProfileCard.vue`
- Modify: `src/renderer/src/views/AgentPanel.vue`
- Modify: `src/renderer/src/components/agents/AgentManageTab.vue`
- Modify: `src/renderer/src/components/agents/AgentEditForm.vue`
- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`
- Modify: `src/renderer/src/components/chat/ChatFunctionPanel.vue`
- Modify: `src/renderer/src/components/function/ToolPanel.vue`

- [ ] **Step 1: Implement Agent/Profile shared cards**

`SlimeAgentCard.vue` props:

```ts
defineProps<{
  name: string
  role?: string
  description?: string
  selected?: boolean
  disabled?: boolean
}>()
```

`SlimeProfileCard.vue` props:

```ts
defineProps<{
  title: string
  subtitle?: string
  description?: string
  kind?: 'user' | 'agent'
}>()
```

- [ ] **Step 2: Migrate Agent management**

Use `SlimeAgentCard`, `SlimePanel`, `SlimeTabs`, `SlimeInput`, `SlimeTextarea`, `SlimeChecklist`, and `SlimeButton`. Preserve agent CRUD, avatar behavior, and MCP tool selection.

- [ ] **Step 3: Migrate Settings dialog**

Use shared tabs, buttons, inputs, checklist, and panels. Preserve all settings keys and Presenter calls.

- [ ] **Step 4: Migrate function panels**

Use shared panels and tabs. Preserve selected tool call behavior and preview rendering.

- [ ] **Step 5: Verify**

```bash
pnpm run typecheck:web
pnpm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/slime/SlimeAgentCard.vue src/renderer/src/components/slime/SlimeProfileCard.vue src/renderer/src/views/AgentPanel.vue src/renderer/src/components/agents src/renderer/src/components/settings src/renderer/src/components/chat/ChatFunctionPanel.vue src/renderer/src/components/function
git commit -m "feat(ui): migrate agent and settings surfaces"
```

## Task 11: Final Verification and Visual QA

**Files:**
- Modify only files needed to fix issues found during verification.

- [ ] **Step 1: Run format**

```bash
pnpm run format
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
pnpm run lint
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run targeted tests**

```bash
pnpm vitest run test/renderer/components/SlimeComposer.test.ts test/renderer/components/SlimeChecklist.test.ts test/renderer/components/AppSidebarNav.test.ts test/renderer/components/SlimeWeekCalendar.test.ts
```

Expected: PASS.

- [ ] **Step 5: Launch app**

```bash
pnpm run dev
```

Expected: app launches. Verify these screens:

- Chatroom empty state and active chat.
- GroupChat creation and active chat.
- Gateway overview, realtime charts, logs, and ranking.
- Agents management and edit form.
- Schedule week calendar, task list, and timeline.
- Settings dialog.

- [ ] **Step 6: Capture screenshots**

Use the in-app browser or Electron preview to capture desktop screenshots of Chatroom, Gateway, Agents, and Schedule. Compare against the approved prototype for spacing, contrast, and component consistency.

- [ ] **Step 7: Commit fixes**

```bash
git add src/renderer/src
git commit -m "fix(ui): polish codex style migration"
```

## Self-Review

- Spec coverage: tokens, primitives, shell, Chatroom, GroupChat, Gateway, Agents, Schedule, Settings, function panels, and future component rules are covered.
- Prototype coverage: approved prototype is preserved as the visual reference.
- Red-flag scan: this plan contains no unresolved markers or unspecified implementation steps.
- Type consistency: shared component prop names use `variant`, `size`, `selected`, `disabled`, `modelValue`, and explicit event names consistently.
- Risk coverage: Gateway dirty worktree risk is called out before Gateway migration.
