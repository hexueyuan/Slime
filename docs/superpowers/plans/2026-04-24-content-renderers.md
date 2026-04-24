# Content Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "预览" tab to FunctionPanel with 4 content renderers (Quiz, Markdown, Progress, HTML Preview) and an `open` tool for the Agent to push file content to the preview area.

**Architecture:** ContentPresenter (main process) manages content state per session, pushes updates via EventBus to a Pinia contentStore (renderer). FunctionPanel gains a third "预览" tab rendering a ContentDispatcher that routes by content type to 4 renderer components. A new `open` tool in ToolPresenter reads files and sends them to ContentPresenter.

**Tech Stack:** TypeScript, Vue 3 Composition API, Pinia, Vitest, markstream-vue (existing), iframe sandbox

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types/content.d.ts` | FunctionContent discriminated union + subtypes |
| `src/shared/events.ts` | Add CONTENT_EVENTS (modify) |
| `src/shared/types/presenters/content.presenter.d.ts` | IContentPresenter interface |
| `src/shared/types/presenters/index.d.ts` | Re-export + add to IPresenter (modify) |
| `src/main/presenter/contentPresenter.ts` | Content state + EventBus push + openFile |
| `src/main/presenter/index.ts` | Register ContentPresenter (modify) |
| `src/main/presenter/toolPresenter.ts` | Add `open` tool (modify) |
| `src/renderer/src/stores/content.ts` | Pinia store + IPC listeners |
| `src/renderer/src/components/function/ContentDispatcher.vue` | Type-based routing |
| `src/renderer/src/components/function/renderers/QuizRenderer.vue` | Quiz UI |
| `src/renderer/src/components/function/renderers/MarkdownRenderer.vue` | Markdown rendering via markstream-vue |
| `src/renderer/src/components/function/renderers/ProgressRenderer.vue` | Progress bar UI |
| `src/renderer/src/components/function/renderers/PreviewRenderer.vue` | iframe sandbox HTML preview |
| `src/renderer/src/components/function/FunctionPanel.vue` | Add 3rd tab (modify) |
| `src/renderer/src/views/EvolutionCenter.vue` | Update activeTab type (modify) |

---

### Task 1: Types + Events

**Files:**
- Create: `src/shared/types/content.d.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1: Create content types**

Create `src/shared/types/content.d.ts`:

```typescript
export type FunctionContentType = 'quiz' | 'preview' | 'markdown' | 'progress'

export interface QuizOption {
  value: string
  label: string
  recommended?: boolean
}

export interface QuizQuestion {
  id: string
  text: string
  options: QuizOption[]
  allowCustom: boolean
  multiple?: boolean
}

export interface QuizContent {
  type: 'quiz'
  questions: QuizQuestion[]
}

export interface PreviewContent {
  type: 'preview'
  html: string
  title?: string
  confirmLabel?: string
  adjustLabel?: string
}

export interface MarkdownContent {
  type: 'markdown'
  content: string
  title?: string
}

export interface ProgressContent {
  type: 'progress'
  percentage: number
  label: string
  stage: string
  cancellable?: boolean
}

export type FunctionContent = QuizContent | PreviewContent | MarkdownContent | ProgressContent
```

- [ ] **Step 2: Add CONTENT_EVENTS to events.ts**

In `src/shared/events.ts`, add after the `WORKSPACE_EVENTS` block:

```typescript
export const CONTENT_EVENTS = {
  UPDATED: 'content:updated',
  CLEARED: 'content:cleared',
} as const
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (types are only declarations, no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/content.d.ts src/shared/events.ts
git commit -m "feat(shared): add content types and CONTENT_EVENTS"
```

---

### Task 2: ContentPresenter (main process)

**Files:**
- Create: `src/shared/types/presenters/content.presenter.d.ts`
- Modify: `src/shared/types/presenters/index.d.ts`
- Create: `src/main/presenter/contentPresenter.ts`
- Test: `test/main/contentPresenter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/contentPresenter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSendToRenderer = vi.fn()
vi.mock('@/eventbus', () => ({
  eventBus: { sendToRenderer: mockSendToRenderer },
}))

const { ContentPresenter } = await import('@/presenter/contentPresenter')

describe('ContentPresenter', () => {
  let cp: InstanceType<typeof ContentPresenter>

  beforeEach(() => {
    cp = new ContentPresenter()
    mockSendToRenderer.mockClear()
  })

  it('should set and get content', () => {
    const content = { type: 'markdown' as const, content: '# Hello' }
    cp.setContent('s1', content)
    expect(cp.getContent('s1')).toEqual(content)
    expect(mockSendToRenderer).toHaveBeenCalledWith('content:updated', 's1', content)
  })

  it('should return null for unknown session', () => {
    expect(cp.getContent('unknown')).toBeNull()
  })

  it('should clear content', () => {
    cp.setContent('s1', { type: 'markdown' as const, content: 'hi' })
    cp.clearContent('s1')
    expect(cp.getContent('s1')).toBeNull()
    expect(mockSendToRenderer).toHaveBeenCalledWith('content:cleared', 's1')
  })

  it('should clear content for unknown session without error', () => {
    cp.clearContent('unknown')
    expect(mockSendToRenderer).toHaveBeenCalledWith('content:cleared', 'unknown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/main/contentPresenter.test.ts`
Expected: FAIL — module `@/presenter/contentPresenter` does not exist

- [ ] **Step 3: Create IContentPresenter interface**

Create `src/shared/types/presenters/content.presenter.d.ts`:

```typescript
import type { FunctionContent } from '../content'

export interface IContentPresenter {
  setContent(sessionId: string, content: FunctionContent): void
  getContent(sessionId: string): FunctionContent | null
  clearContent(sessionId: string): void
  submitQuizAnswer(sessionId: string, answers: Record<string, string | string[]>): void
  confirmPreview(sessionId: string): void
  adjustPreview(sessionId: string): void
  cancelProgress(sessionId: string): void
  openFile(sessionId: string, filePath: string): Promise<void>
}
```

- [ ] **Step 4: Update presenters/index.d.ts**

In `src/shared/types/presenters/index.d.ts`, add the import/export and add `contentPresenter` to `IPresenter`:

```typescript
import type { IContentPresenter } from './content.presenter'

// Add to exports:
export type { IContentPresenter } from './content.presenter'

// Add to IPresenter interface:
export interface IPresenter {
  appPresenter: IAppPresenter
  configPresenter: IConfigPresenter
  agentPresenter: IAgentPresenter
  sessionPresenter: ISessionPresenter
  filePresenter: IFilePresenter
  gitPresenter: IGitPresenter
  workspacePresenter: IWorkspacePresenter
  contentPresenter: IContentPresenter
  init(): void
  destroy(): Promise<void>
}
```

- [ ] **Step 5: Implement ContentPresenter**

Create `src/main/presenter/contentPresenter.ts`:

```typescript
import type { FunctionContent } from '@shared/types/content'
import type { IContentPresenter } from '@shared/types/presenters'
import { CONTENT_EVENTS } from '@shared/events'
import { eventBus } from '@/eventbus'
import { logger } from '@/utils'

export class ContentPresenter implements IContentPresenter {
  private contents = new Map<string, FunctionContent>()

  setContent(sessionId: string, content: FunctionContent): void {
    this.contents.set(sessionId, content)
    eventBus.sendToRenderer(CONTENT_EVENTS.UPDATED, sessionId, content)
  }

  getContent(sessionId: string): FunctionContent | null {
    return this.contents.get(sessionId) ?? null
  }

  clearContent(sessionId: string): void {
    this.contents.delete(sessionId)
    eventBus.sendToRenderer(CONTENT_EVENTS.CLEARED, sessionId)
  }

  submitQuizAnswer(sessionId: string, answers: Record<string, string | string[]>): void {
    logger.debug('content:quiz-answer', { sessionId, answers })
  }

  confirmPreview(sessionId: string): void {
    logger.debug('content:preview-confirm', { sessionId })
  }

  adjustPreview(sessionId: string): void {
    logger.debug('content:preview-adjust', { sessionId })
  }

  cancelProgress(sessionId: string): void {
    logger.debug('content:progress-cancel', { sessionId })
  }

  async openFile(sessionId: string, filePath: string): Promise<void> {
    const { readFile } = await import('fs/promises')
    const { resolve, extname } = await import('path')
    const { paths } = await import('@/utils')
    const root = paths.effectiveProjectRoot
    const abs = resolve(root, filePath)
    if (!abs.startsWith(root)) {
      throw new Error(`Path "${filePath}" resolves outside project root`)
    }
    const raw = await readFile(abs, 'utf-8')
    const ext = extname(filePath).toLowerCase()
    if (ext === '.html' || ext === '.htm') {
      this.setContent(sessionId, { type: 'preview', html: raw, title: filePath })
    } else if (ext === '.md') {
      this.setContent(sessionId, { type: 'markdown', content: raw, title: filePath })
    } else {
      this.setContent(sessionId, {
        type: 'markdown',
        content: '```\n' + raw + '\n```',
        title: filePath,
      })
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- test/main/contentPresenter.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Add openFile test**

Add to `test/main/contentPresenter.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
```

Add at the top of the describe block, after the ContentPresenter import:

```typescript
const testRoot = join(tmpdir(), `slime-content-test-${Date.now()}`)

// Mock paths for openFile
vi.mock('@/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn() },
  paths: { effectiveProjectRoot: '' },
}))

const { paths } = await import('@/utils')
```

Update `beforeEach`:

```typescript
beforeEach(() => {
  mkdirSync(testRoot, { recursive: true });
  (paths as any).effectiveProjectRoot = testRoot
  cp = new ContentPresenter()
  mockSendToRenderer.mockClear()
})
```

Add `afterEach`:

```typescript
afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})
```

Add test cases:

```typescript
it('should open .md file as markdown content', async () => {
  writeFileSync(join(testRoot, 'test.md'), '# Hello')
  await cp.openFile('s1', 'test.md')
  const content = cp.getContent('s1')
  expect(content).not.toBeNull()
  expect(content!.type).toBe('markdown')
  expect((content as any).content).toBe('# Hello')
})

it('should open .html file as preview content', async () => {
  writeFileSync(join(testRoot, 'test.html'), '<h1>Hello</h1>')
  await cp.openFile('s1', 'test.html')
  const content = cp.getContent('s1')
  expect(content).not.toBeNull()
  expect(content!.type).toBe('preview')
  expect((content as any).html).toBe('<h1>Hello</h1>')
})

it('should open other text files as code-block markdown', async () => {
  writeFileSync(join(testRoot, 'test.txt'), 'plain text')
  await cp.openFile('s1', 'test.txt')
  const content = cp.getContent('s1')
  expect(content).not.toBeNull()
  expect(content!.type).toBe('markdown')
  expect((content as any).content).toContain('```')
  expect((content as any).content).toContain('plain text')
})

it('should reject paths outside project root', async () => {
  await expect(cp.openFile('s1', '../../../etc/passwd')).rejects.toThrow('outside project root')
})
```

- [ ] **Step 8: Run test to verify openFile tests pass**

Run: `pnpm test -- test/main/contentPresenter.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/presenters/content.presenter.d.ts src/shared/types/presenters/index.d.ts src/main/presenter/contentPresenter.ts test/main/contentPresenter.test.ts
git commit -m "feat(content): add ContentPresenter with openFile support"
```

---

### Task 3: Register ContentPresenter + open tool

**Files:**
- Modify: `src/main/presenter/index.ts`
- Modify: `src/main/presenter/toolPresenter.ts`
- Modify: `test/main/toolPresenter.test.ts`

- [ ] **Step 1: Write the failing test for open tool**

Add to `test/main/toolPresenter.test.ts`, update the tool count test:

```typescript
it('should return a ToolSet with all 10 tools', () => {
  const tools = tp.getToolSet('s1')
  expect(Object.keys(tools)).toEqual(
    expect.arrayContaining([
      'read', 'write', 'edit', 'exec',
      'workflow_edit', 'workflow_query', 'step_query', 'step_update',
      'ask_user', 'open',
    ]),
  )
  expect(Object.keys(tools)).toHaveLength(10)
})
```

Update the existing count check in `should include ask_user tool in toolset`:

```typescript
expect(Object.keys(tools)).toHaveLength(10)
```

Add a new test for the open tool:

```typescript
it('should execute open tool for .md file', async () => {
  writeFileSync(join(testRoot, 'preview.md'), '# Preview')
  const result = await tp.callTool('s1', 'open', { path: 'preview.md' })
  expect(result).toContain('preview.md')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/main/toolPresenter.test.ts`
Expected: FAIL — `open` tool does not exist in toolset

- [ ] **Step 3: Register ContentPresenter in Presenter**

In `src/main/presenter/index.ts`:

Add import:
```typescript
import { ContentPresenter } from './contentPresenter'
```

Add property to `Presenter` class (after `private toolPresenter: ToolPresenter;`):
```typescript
contentPresenter: ContentPresenter
```

In constructor, before `this.toolPresenter`:
```typescript
this.contentPresenter = new ContentPresenter()
```

Update `this.toolPresenter` constructor call to pass contentPresenter:
```typescript
this.toolPresenter = new ToolPresenter(this.filePresenter, this.workflowPresenter, this.contentPresenter)
```

Add `'contentPresenter'` to `DISPATCHABLE` set.

- [ ] **Step 4: Add open tool to ToolPresenter**

In `src/main/presenter/toolPresenter.ts`:

Add import:
```typescript
import type { ContentPresenter } from './contentPresenter'
```

Update constructor:
```typescript
constructor(
  private filePresenter: FilePresenter,
  private workflowPresenter: WorkflowPresenter,
  private contentPresenter: ContentPresenter,
) {}
```

Add `open` tool in `getToolSet()` method, after `ask_user`:

```typescript
open: createTool({
  description: 'Open a file in the preview panel. Supports .md (Markdown), .html (HTML preview), and other text files.',
  parameters: z.object({
    path: z.string().describe('File path relative to project root'),
  }),
  execute: async ({ path }) => {
    await this.contentPresenter.openFile(sessionId, path)
    return `Opened ${path} in preview panel`
  },
}),
```

- [ ] **Step 5: Update toolPresenter test setup**

In `test/main/toolPresenter.test.ts`, add ContentPresenter import:

```typescript
const { ContentPresenter } = await import('@/presenter/contentPresenter')
```

Update `beforeEach`:

```typescript
beforeEach(() => {
  mkdirSync(testRoot, { recursive: true })
  mockPaths.effectiveProjectRoot = testRoot
  const fp = new FilePresenter(testRoot)
  const wp = new WorkflowPresenter()
  const cp = new ContentPresenter()
  tp = new ToolPresenter(fp, wp, cp)
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test -- test/main/toolPresenter.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: PASS (some existing tests referencing tool count need updating — fix if needed)

- [ ] **Step 8: Commit**

```bash
git add src/main/presenter/index.ts src/main/presenter/toolPresenter.ts test/main/toolPresenter.test.ts
git commit -m "feat(tool): add open tool and register ContentPresenter"
```

---

### Task 4: Content Store (renderer)

**Files:**
- Create: `src/renderer/src/stores/content.ts`
- Test: `test/renderer/stores/content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/stores/content.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const eventHandlers: Record<string, Function> = {}
const mockOn = vi.fn((channel: string, handler: Function) => {
  eventHandlers[channel] = handler
  return vi.fn()
})

;(globalThis as any).window = {
  electron: { ipcRenderer: { on: mockOn } },
}

import { useContentStore, setupContentIpc } from '@/stores/content'
import { CONTENT_EVENTS } from '@shared/events'

describe('useContentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start with null content', () => {
    const store = useContentStore()
    expect(store.content).toBeNull()
  })

  it('should set content', () => {
    const store = useContentStore()
    store.setContent({ type: 'markdown', content: '# Hi' })
    expect(store.content).toEqual({ type: 'markdown', content: '# Hi' })
  })

  it('should clear content', () => {
    const store = useContentStore()
    store.setContent({ type: 'markdown', content: '# Hi' })
    store.clear()
    expect(store.content).toBeNull()
  })
})

describe('setupContentIpc', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockOn.mockClear()
    for (const key of Object.keys(eventHandlers)) delete eventHandlers[key]
  })

  it('should register IPC listeners and return cleanup', () => {
    const store = useContentStore()
    const cleanup = setupContentIpc(store)
    expect(typeof cleanup).toBe('function')
    expect(mockOn).toHaveBeenCalledWith(CONTENT_EVENTS.UPDATED, expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith(CONTENT_EVENTS.CLEARED, expect.any(Function))
    cleanup()
  })

  it('should update content on UPDATED event', () => {
    const store = useContentStore()
    setupContentIpc(store)
    const handler = eventHandlers[CONTENT_EVENTS.UPDATED]
    handler('s1', { type: 'progress', percentage: 50, label: 'building', stage: 'coding' })
    expect(store.content).toEqual({
      type: 'progress',
      percentage: 50,
      label: 'building',
      stage: 'coding',
    })
  })

  it('should clear content on CLEARED event', () => {
    const store = useContentStore()
    store.setContent({ type: 'markdown', content: 'hi' })
    setupContentIpc(store)
    const handler = eventHandlers[CONTENT_EVENTS.CLEARED]
    handler('s1')
    expect(store.content).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/stores/content.test.ts`
Expected: FAIL — module `@/stores/content` does not exist

- [ ] **Step 3: Implement content store**

Create `src/renderer/src/stores/content.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FunctionContent } from '@shared/types/content'
import { CONTENT_EVENTS } from '@shared/events'

export const useContentStore = defineStore('content', () => {
  const content = ref<FunctionContent | null>(null)

  function setContent(c: FunctionContent): void {
    content.value = c
  }

  function clear(): void {
    content.value = null
  }

  return { content, setContent, clear }
})

export function setupContentIpc(store: ReturnType<typeof useContentStore>): () => void {
  const unsubs: Array<() => void> = []

  const unsubUpdated = window.electron.ipcRenderer.on(
    CONTENT_EVENTS.UPDATED,
    (_sessionId: unknown, data: unknown) => {
      store.setContent(data as FunctionContent)
    },
  )
  unsubs.push(unsubUpdated)

  const unsubCleared = window.electron.ipcRenderer.on(
    CONTENT_EVENTS.CLEARED,
    () => {
      store.clear()
    },
  )
  unsubs.push(unsubCleared)

  return () => unsubs.forEach((fn) => fn())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/stores/content.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/content.ts test/renderer/stores/content.test.ts
git commit -m "feat(store): add content store with IPC listeners"
```

---

### Task 5: QuizRenderer

**Files:**
- Create: `src/renderer/src/components/function/renderers/QuizRenderer.vue`
- Test: `test/renderer/components/renderers/QuizRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/renderers/QuizRenderer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import QuizRenderer from '@/components/function/renderers/QuizRenderer.vue'
import type { QuizContent } from '@shared/types/content'

const singleQuiz: QuizContent = {
  type: 'quiz',
  questions: [
    {
      id: 'q1',
      text: 'Pick a color',
      options: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue', recommended: true },
      ],
      allowCustom: false,
    },
  ],
}

const multiQuiz: QuizContent = {
  type: 'quiz',
  questions: [
    {
      id: 'q1',
      text: 'Pick features',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      allowCustom: true,
      multiple: true,
    },
  ],
}

describe('QuizRenderer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should render questions and options', () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } })
    expect(wrapper.text()).toContain('Pick a color')
    expect(wrapper.text()).toContain('Red')
    expect(wrapper.text()).toContain('Blue')
  })

  it('should show recommended badge', () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } })
    expect(wrapper.text()).toContain('推荐')
  })

  it('should disable submit when no selection', () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } })
    const btn = wrapper.find('[data-testid="quiz-submit"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('should enable submit after selecting an option', async () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } })
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[0].setValue(true)
    const btn = wrapper.find('[data-testid="quiz-submit"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('should emit submit with answers', async () => {
    const wrapper = mount(QuizRenderer, { props: { content: singleQuiz } })
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[0].setValue(true)
    await wrapper.find('[data-testid="quiz-submit"]').trigger('click')
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0][0]).toEqual({ q1: 'red' })
  })

  it('should show custom input when allowCustom', () => {
    const wrapper = mount(QuizRenderer, { props: { content: multiQuiz } })
    expect(wrapper.find('[data-testid="quiz-custom-input"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/renderers/QuizRenderer.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement QuizRenderer**

Create `src/renderer/src/components/function/renderers/QuizRenderer.vue`:

```vue
<template>
  <div class="flex flex-col gap-4 p-4">
    <h3 class="text-sm font-semibold text-foreground">请确认以下细节：</h3>

    <div v-for="question in content.questions" :key="question.id" class="flex flex-col gap-2">
      <p class="text-sm font-medium text-foreground">{{ question.text }}</p>

      <div class="flex flex-col gap-1.5 pl-1">
        <label
          v-for="option in question.options"
          :key="option.value"
          class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
          :class="
            isSelected(question.id, option.value)
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card hover:border-primary/50'
          "
        >
          <input
            :type="question.multiple ? 'checkbox' : 'radio'"
            :name="question.id"
            :value="option.value"
            :checked="isSelected(question.id, option.value)"
            class="accent-primary"
            @change="selectOption(question.id, option.value, question.multiple)"
          />
          <span class="flex items-center gap-1.5">
            {{ option.label }}
            <span
              v-if="option.recommended"
              class="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"
            >
              推荐
            </span>
          </span>
        </label>

        <input
          v-if="question.allowCustom"
          data-testid="quiz-custom-input"
          type="text"
          class="rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:border-solid"
          placeholder="或自定义..."
          :value="customInputs[question.id] || ''"
          @input="handleCustomInput(question.id, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <button
      data-testid="quiz-submit"
      class="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="!canSubmit"
      @click="handleSubmit"
    >
      确认
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import type { QuizContent } from '@shared/types/content'

const props = defineProps<{ content: QuizContent }>()
const emit = defineEmits<{ submit: [answers: Record<string, string | string[]>] }>()

const answers = reactive<Record<string, string | string[]>>({})
const customInputs = reactive<Record<string, string>>({})

function selectOption(questionId: string, value: string, multiple?: boolean) {
  if (multiple) {
    const current = (answers[questionId] as string[]) || []
    if (current.includes(value)) {
      answers[questionId] = current.filter((v) => v !== value)
    } else {
      answers[questionId] = [...current, value]
    }
  } else {
    answers[questionId] = value
    customInputs[questionId] = ''
  }
}

function isSelected(questionId: string, value: string): boolean {
  const answer = answers[questionId]
  if (Array.isArray(answer)) return answer.includes(value)
  return answer === value
}

function handleCustomInput(questionId: string, value: string) {
  customInputs[questionId] = value
  answers[questionId] = value
}

const canSubmit = computed(() =>
  props.content.questions.every((q) => {
    const answer = answers[q.id]
    if (answer === undefined || answer === '') return false
    return Array.isArray(answer) ? answer.length > 0 : true
  }),
)

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', { ...answers })
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/renderers/QuizRenderer.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/renderers/QuizRenderer.vue test/renderer/components/renderers/QuizRenderer.test.ts
git commit -m "feat(ui): add QuizRenderer component"
```

---

### Task 6: MarkdownRenderer

**Files:**
- Create: `src/renderer/src/components/function/renderers/MarkdownRenderer.vue`
- Test: `test/renderer/components/renderers/MarkdownRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/renderers/MarkdownRenderer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Mock markstream-vue since it's a complex rendering library
vi.mock('markstream-vue', () => ({
  default: {
    name: 'NodeRenderer',
    props: ['content', 'customId', 'isDark'],
    template: '<div class="mock-markdown">{{ content }}</div>',
  },
}))

import MarkdownRenderer from '@/components/function/renderers/MarkdownRenderer.vue'
import type { MarkdownContent } from '@shared/types/content'

describe('MarkdownRenderer', () => {
  it('should render markdown content', () => {
    const content: MarkdownContent = { type: 'markdown', content: '# Hello World' }
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    expect(wrapper.text()).toContain('# Hello World')
  })

  it('should show title when provided', () => {
    const content: MarkdownContent = {
      type: 'markdown',
      content: 'body',
      title: 'README.md',
    }
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    expect(wrapper.text()).toContain('README.md')
  })

  it('should not show title area when no title', () => {
    const content: MarkdownContent = { type: 'markdown', content: 'body' }
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    expect(wrapper.find('[data-testid="md-title"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/renderers/MarkdownRenderer.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement MarkdownRenderer**

Create `src/renderer/src/components/function/renderers/MarkdownRenderer.vue`:

```vue
<template>
  <div class="flex h-full flex-col overflow-auto p-4">
    <div
      v-if="content.title"
      data-testid="md-title"
      class="mb-3 border-b border-border pb-2 text-xs text-muted-foreground"
    >
      {{ content.title }}
    </div>
    <div class="prose prose-sm dark:prose-invert w-full max-w-none">
      <NodeRenderer :content="content.content" :custom-id="'content-md'" :is-dark="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MarkdownContent } from '@shared/types/content'
import NodeRenderer from 'markstream-vue'

defineProps<{ content: MarkdownContent }>()
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/renderers/MarkdownRenderer.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/renderers/MarkdownRenderer.vue test/renderer/components/renderers/MarkdownRenderer.test.ts
git commit -m "feat(ui): add MarkdownRenderer component"
```

---

### Task 7: ProgressRenderer

**Files:**
- Create: `src/renderer/src/components/function/renderers/ProgressRenderer.vue`
- Test: `test/renderer/components/renderers/ProgressRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/renderers/ProgressRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProgressRenderer from '@/components/function/renderers/ProgressRenderer.vue'
import type { ProgressContent } from '@shared/types/content'

describe('ProgressRenderer', () => {
  const base: ProgressContent = {
    type: 'progress',
    percentage: 42,
    label: 'Compiling...',
    stage: 'coding',
  }

  it('should display percentage', () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } })
    expect(wrapper.text()).toContain('42%')
  })

  it('should display label', () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } })
    expect(wrapper.text()).toContain('Compiling...')
  })

  it('should display stage', () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } })
    expect(wrapper.text()).toContain('coding')
  })

  it('should set bar width via style', () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } })
    const bar = wrapper.find('[data-testid="progress-bar"]')
    expect(bar.attributes('style')).toContain('width: 42%')
  })

  it('should not show cancel button by default', () => {
    const wrapper = mount(ProgressRenderer, { props: { content: base } })
    expect(wrapper.find('[data-testid="progress-cancel"]').exists()).toBe(false)
  })

  it('should show cancel button when cancellable', () => {
    const wrapper = mount(ProgressRenderer, {
      props: { content: { ...base, cancellable: true } },
    })
    expect(wrapper.find('[data-testid="progress-cancel"]').exists()).toBe(true)
  })

  it('should emit cancel on button click', async () => {
    const wrapper = mount(ProgressRenderer, {
      props: { content: { ...base, cancellable: true } },
    })
    await wrapper.find('[data-testid="progress-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/renderers/ProgressRenderer.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement ProgressRenderer**

Create `src/renderer/src/components/function/renderers/ProgressRenderer.vue`:

```vue
<template>
  <div class="flex flex-col items-center gap-4 p-8">
    <div class="text-3xl">
      <svg
        class="inline-block h-8 w-8 animate-spin text-primary"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
    <h3 class="text-base font-semibold text-foreground">{{ content.stage }}</h3>
    <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        data-testid="progress-bar"
        class="h-full rounded-full bg-primary transition-all duration-300"
        :style="{ width: `${content.percentage}%` }"
      />
    </div>
    <div class="flex items-center gap-2">
      <span class="text-2xl font-bold text-primary">{{ content.percentage }}%</span>
      <span class="text-sm text-muted-foreground">{{ content.label }}</span>
    </div>
    <button
      v-if="content.cancellable"
      data-testid="progress-cancel"
      class="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
      @click="$emit('cancel')"
    >
      取消
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ProgressContent } from '@shared/types/content'

defineProps<{ content: ProgressContent }>()
defineEmits<{ cancel: [] }>()
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/renderers/ProgressRenderer.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/renderers/ProgressRenderer.vue test/renderer/components/renderers/ProgressRenderer.test.ts
git commit -m "feat(ui): add ProgressRenderer component"
```

---

### Task 8: PreviewRenderer

**Files:**
- Create: `src/renderer/src/components/function/renderers/PreviewRenderer.vue`
- Test: `test/renderer/components/renderers/PreviewRenderer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/renderer/components/renderers/PreviewRenderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviewRenderer from '@/components/function/renderers/PreviewRenderer.vue'
import type { PreviewContent } from '@shared/types/content'

describe('PreviewRenderer', () => {
  const base: PreviewContent = {
    type: 'preview',
    html: '<h1>Hello</h1>',
  }

  it('should render iframe with srcdoc', () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } })
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('srcdoc')).toBe('<h1>Hello</h1>')
  })

  it('should set sandbox without allow-same-origin', () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } })
    const iframe = wrapper.find('iframe')
    const sandbox = iframe.attributes('sandbox')
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
  })

  it('should show title when provided', () => {
    const wrapper = mount(PreviewRenderer, {
      props: { content: { ...base, title: 'design.html' } },
    })
    expect(wrapper.text()).toContain('design.html')
  })

  it('should emit confirm on confirm button click', async () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } })
    await wrapper.find('[data-testid="preview-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('should emit adjust on adjust button click', async () => {
    const wrapper = mount(PreviewRenderer, { props: { content: base } })
    await wrapper.find('[data-testid="preview-adjust"]').trigger('click')
    expect(wrapper.emitted('adjust')).toBeTruthy()
  })

  it('should use custom button labels', () => {
    const wrapper = mount(PreviewRenderer, {
      props: {
        content: { ...base, confirmLabel: 'LGTM', adjustLabel: 'Redo' },
      },
    })
    expect(wrapper.find('[data-testid="preview-confirm"]').text()).toContain('LGTM')
    expect(wrapper.find('[data-testid="preview-adjust"]').text()).toContain('Redo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/renderers/PreviewRenderer.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement PreviewRenderer**

Create `src/renderer/src/components/function/renderers/PreviewRenderer.vue`:

```vue
<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-foreground">效果预览</span>
      <span
        v-if="content.title"
        data-testid="preview-title"
        class="text-xs text-muted-foreground"
      >
        {{ content.title }}
      </span>
    </div>

    <div class="min-h-[200px] flex-1 overflow-hidden rounded-lg border border-border bg-white">
      <iframe class="h-full w-full border-none" sandbox="allow-scripts" :srcdoc="content.html" />
    </div>

    <div class="flex gap-2">
      <button
        data-testid="preview-confirm"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        @click="$emit('confirm')"
      >
        {{ content.confirmLabel || '效果满意，开始进化' }}
      </button>
      <button
        data-testid="preview-adjust"
        class="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        @click="$emit('adjust')"
      >
        {{ content.adjustLabel || '我想调整一下' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PreviewContent } from '@shared/types/content'

defineProps<{ content: PreviewContent }>()
defineEmits<{ confirm: []; adjust: [] }>()
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/renderers/PreviewRenderer.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/renderers/PreviewRenderer.vue test/renderer/components/renderers/PreviewRenderer.test.ts
git commit -m "feat(ui): add PreviewRenderer with iframe sandbox"
```

---

### Task 9: ContentDispatcher + FunctionPanel integration

**Files:**
- Create: `src/renderer/src/components/function/ContentDispatcher.vue`
- Modify: `src/renderer/src/components/function/FunctionPanel.vue`
- Modify: `src/renderer/src/views/EvolutionCenter.vue`
- Modify: `test/renderer/components/FunctionPanel.test.ts`
- Test: `test/renderer/components/ContentDispatcher.test.ts`

- [ ] **Step 1: Write ContentDispatcher test**

Create `test/renderer/components/ContentDispatcher.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('markstream-vue', () => ({
  default: {
    name: 'NodeRenderer',
    props: ['content', 'customId', 'isDark'],
    template: '<div>{{ content }}</div>',
  },
}))

import ContentDispatcher from '@/components/function/ContentDispatcher.vue'
import type { FunctionContent } from '@shared/types/content'

describe('ContentDispatcher', () => {
  it('should show empty state when content is null', () => {
    const wrapper = mount(ContentDispatcher, { props: { content: null } })
    expect(wrapper.text()).toContain('暂无预览内容')
  })

  it('should render QuizRenderer for quiz type', () => {
    const content: FunctionContent = {
      type: 'quiz',
      questions: [{ id: 'q1', text: 'Q?', options: [{ value: 'a', label: 'A' }], allowCustom: false }],
    }
    const wrapper = mount(ContentDispatcher, { props: { content } })
    expect(wrapper.text()).toContain('Q?')
  })

  it('should render MarkdownRenderer for markdown type', () => {
    const content: FunctionContent = { type: 'markdown', content: '# Title' }
    const wrapper = mount(ContentDispatcher, { props: { content } })
    expect(wrapper.text()).toContain('# Title')
  })

  it('should render ProgressRenderer for progress type', () => {
    const content: FunctionContent = {
      type: 'progress',
      percentage: 75,
      label: 'Building',
      stage: 'coding',
    }
    const wrapper = mount(ContentDispatcher, { props: { content } })
    expect(wrapper.text()).toContain('75%')
  })

  it('should render PreviewRenderer for preview type', () => {
    const content: FunctionContent = { type: 'preview', html: '<p>Hi</p>' }
    const wrapper = mount(ContentDispatcher, { props: { content } })
    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('srcdoc')).toBe('<p>Hi</p>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/renderer/components/ContentDispatcher.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Implement ContentDispatcher**

Create `src/renderer/src/components/function/ContentDispatcher.vue`:

```vue
<template>
  <div class="h-full">
    <div
      v-if="!content"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无预览内容
    </div>
    <QuizRenderer v-else-if="content.type === 'quiz'" :content="content" @submit="$emit('quiz-submit', $event)" />
    <MarkdownRenderer v-else-if="content.type === 'markdown'" :content="content" />
    <ProgressRenderer v-else-if="content.type === 'progress'" :content="content" @cancel="$emit('progress-cancel')" />
    <PreviewRenderer v-else-if="content.type === 'preview'" :content="content" @confirm="$emit('preview-confirm')" @adjust="$emit('preview-adjust')" />
  </div>
</template>

<script setup lang="ts">
import type { FunctionContent } from '@shared/types/content'
import QuizRenderer from './renderers/QuizRenderer.vue'
import MarkdownRenderer from './renderers/MarkdownRenderer.vue'
import ProgressRenderer from './renderers/ProgressRenderer.vue'
import PreviewRenderer from './renderers/PreviewRenderer.vue'

defineProps<{ content: FunctionContent | null }>()
defineEmits<{
  'quiz-submit': [answers: Record<string, string | string[]>]
  'preview-confirm': []
  'preview-adjust': []
  'progress-cancel': []
}>()
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/renderer/components/ContentDispatcher.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update FunctionPanel to add preview tab**

Replace `src/renderer/src/components/function/FunctionPanel.vue` with:

```vue
<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="tab-workflow"
        class="px-4 py-2 text-xs font-medium transition-colors"
        :class="
          activeTab === 'workflow'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'workflow')"
      >
        流程
      </button>
      <button
        data-testid="tab-tools"
        class="px-4 py-2 text-xs font-medium transition-colors"
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
        data-testid="tab-preview"
        class="px-4 py-2 text-xs font-medium transition-colors"
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
      <WorkflowPanel v-if="activeTab === 'workflow'" />
      <ToolPanel
        v-else-if="activeTab === 'tools'"
        :blocks="toolCallBlocks"
        :selected-id="selectedToolCallId"
        @select="$emit('select-tool-call', $event)"
        @back="$emit('select-tool-call', null)"
      />
      <ContentDispatcher
        v-else-if="activeTab === 'preview'"
        :content="contentStore.content"
        @quiz-submit="onQuizSubmit"
        @preview-confirm="onPreviewConfirm"
        @preview-adjust="onPreviewAdjust"
        @progress-cancel="onProgressCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from '@shared/types/chat'
import WorkflowPanel from './WorkflowPanel.vue'
import ToolPanel from './ToolPanel.vue'
import ContentDispatcher from './ContentDispatcher.vue'
import { useContentStore } from '@/stores/content'
import { usePresenter } from '@/composables/usePresenter'

defineProps<{
  activeTab: 'workflow' | 'tools' | 'preview'
  toolCallBlocks: AssistantMessageBlock[]
  selectedToolCallId?: string | null
}>()

defineEmits<{
  'update:activeTab': [tab: 'workflow' | 'tools' | 'preview']
  'select-tool-call': [id: string | null]
}>()

const contentStore = useContentStore()
const contentPresenter = usePresenter('contentPresenter')

function onQuizSubmit(answers: Record<string, string | string[]>) {
  contentPresenter.submitQuizAnswer('current', answers)
}

function onPreviewConfirm() {
  contentPresenter.confirmPreview('current')
}

function onPreviewAdjust() {
  contentPresenter.adjustPreview('current')
}

function onProgressCancel() {
  contentPresenter.cancelProgress('current')
}
</script>
```

- [ ] **Step 6: Update EvolutionCenter.vue activeTab type**

In `src/renderer/src/views/EvolutionCenter.vue`, change:

```typescript
const activeTab = ref<'workflow' | 'tools'>('workflow')
```

to:

```typescript
const activeTab = ref<'workflow' | 'tools' | 'preview'>('workflow')
```

- [ ] **Step 7: Add auto-switch to preview tab**

In `src/renderer/src/views/EvolutionCenter.vue`, add imports and watcher:

```typescript
import { useContentStore, setupContentIpc } from '@/stores/content'
import { onUnmounted, watch } from 'vue'
```

After existing store setup:

```typescript
const contentStore = useContentStore()
const cleanupContentIpc = setupContentIpc(contentStore)
onUnmounted(cleanupContentIpc)

watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = 'preview'
  },
)
```

- [ ] **Step 8: Update FunctionPanel test**

In `test/renderer/components/FunctionPanel.test.ts`, add:

```typescript
it('should show preview tab and emit update:activeTab', async () => {
  const wrapper = mount(FunctionPanel, {
    props: { activeTab: 'workflow', toolCallBlocks: [] },
  })
  const previewTab = wrapper.find('[data-testid="tab-preview"]')
  expect(previewTab.exists()).toBe(true)
  await previewTab.trigger('click')
  expect(wrapper.emitted('update:activeTab')).toBeTruthy()
  expect(wrapper.emitted('update:activeTab')![0]).toEqual(['preview'])
})

it('should show ContentDispatcher when activeTab is preview', () => {
  const wrapper = mount(FunctionPanel, {
    props: { activeTab: 'preview', toolCallBlocks: [] },
  })
  expect(wrapper.text()).toContain('暂无预览内容')
})
```

- [ ] **Step 9: Run all tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 10: Run format + lint**

Run: `pnpm run format && pnpm run lint`
Expected: clean

- [ ] **Step 11: Commit**

```bash
git add src/renderer/src/components/function/ContentDispatcher.vue src/renderer/src/components/function/FunctionPanel.vue src/renderer/src/views/EvolutionCenter.vue test/renderer/components/ContentDispatcher.test.ts test/renderer/components/FunctionPanel.test.ts
git commit -m "feat(ui): add preview tab with ContentDispatcher integration"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Run format + lint**

Run: `pnpm run format && pnpm run lint`
Expected: clean

- [ ] **Step 4: Run dev and manually verify**

Run: `pnpm run dev`
Verify:
- FunctionPanel has 3 tabs (流程, 工具, 预览)
- 预览 tab shows "暂无预览内容" when empty
- Agent can use `open` tool to display files in preview

- [ ] **Step 5: Final commit if any format changes**

```bash
git add -A && git status
# If there are format changes:
git commit -m "style: format"
```
