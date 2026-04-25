# TASK-008: Evolution History List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "历史" tab to FunctionPanel showing evolution version history with rollback support.

**Architecture:** Enrich `EvolutionPresenter.getHistory()` by parsing `CHANGELOG.slime.md` for request/summary/date/changes metadata, then build a new `HistoryPanel.vue` component rendered inside FunctionPanel's existing tab system. Rollback uses the already-wired `evolutionPresenter.rollback(tag)` IPC method.

**Tech Stack:** TypeScript, Vue 3 Composition API, Pinia, TailwindCSS, Vitest

---

## File Map

| Action | File                                                     | Responsibility                                  |
| ------ | -------------------------------------------------------- | ----------------------------------------------- |
| Modify | `src/main/presenter/evolutionPresenter.ts`               | Enrich `getHistory()` with CHANGELOG parsing    |
| Modify | `test/main/evolutionPresenter.test.ts`                   | Tests for `getHistory()` and `parseChangelog()` |
| Create | `src/renderer/src/components/function/HistoryPanel.vue`  | History list UI with rollback                   |
| Modify | `src/renderer/src/components/function/FunctionPanel.vue` | Add "历史" tab + render HistoryPanel            |
| Modify | `src/renderer/src/views/EvolutionCenter.vue`             | Extend `activeTab` type to include `"history"`  |
| Modify | `test/renderer/components/FunctionPanel.test.ts`         | Test new tab rendering                          |
| Create | `test/renderer/components/HistoryPanel.test.ts`          | Tests for HistoryPanel                          |

---

### Task 1: Enrich `getHistory()` with CHANGELOG Parsing (Backend)

**Files:**

- Modify: `src/main/presenter/evolutionPresenter.ts:101-113`
- Modify: `test/main/evolutionPresenter.test.ts`

- [x] **Step 1: Write failing tests for `getHistory()` with CHANGELOG data**

Add to `test/main/evolutionPresenter.test.ts`:

```typescript
import { readFile } from "fs/promises";

// At the top, update the fs/promises mock to support dynamic returns:
// Replace the existing vi.mock("fs/promises") with:
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Add these tests inside the describe block:

it("getHistory returns enriched nodes from CHANGELOG", async () => {
  const git = mockGit();
  git.listTags.mockResolvedValue(["egg-v0.1-dev.2", "egg-v0.1-dev.1"]);
  const { readFile: mockReadFile } = await import("fs/promises");
  (mockReadFile as any).mockResolvedValue(
    `# Slime Evolution Changelog

## [egg-v0.1-dev.2] - 2026-04-24

### Evolution

- Request: "添加时钟功能"
- Summary: 新增赛博时钟
- Status: Success

### Changes

- src/components/Clock.vue
- src/views/Main.vue

---

## [egg-v0.1-dev.1] - 2026-04-24

### Evolution

- Request: "缩小字体"
- Summary: 缩小对话字体
- Status: Success

### Changes

- (no file changes recorded)

---
`,
  );
  evo = new EvolutionPresenter(git, mockConfig());
  const history = await evo.getHistory();

  expect(history).toHaveLength(2);
  expect(history[0].tag).toBe("egg-v0.1-dev.2");
  expect(history[0].request).toBe("添加时钟功能");
  expect(history[0].description).toBe("新增赛博时钟");
  expect(history[0].createdAt).toBe("2026-04-24");
  expect(history[0].changes).toEqual(["src/components/Clock.vue", "src/views/Main.vue"]);
  expect(history[1].tag).toBe("egg-v0.1-dev.1");
  expect(history[1].request).toBe("缩小字体");
  expect(history[1].changes).toEqual([]);
});

it("getHistory returns basic nodes when CHANGELOG is missing", async () => {
  const git = mockGit();
  git.listTags.mockResolvedValue(["egg-v0.1-dev.1"]);
  const { readFile: mockReadFile } = await import("fs/promises");
  (mockReadFile as any).mockRejectedValue(new Error("not found"));
  evo = new EvolutionPresenter(git, mockConfig());
  const history = await evo.getHistory();

  expect(history).toHaveLength(1);
  expect(history[0].tag).toBe("egg-v0.1-dev.1");
  expect(history[0].request).toBe("");
  expect(history[0].description).toBe("egg-v0.1-dev.1");
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`
Expected: FAIL — `getHistory` returns empty request/description/createdAt

- [x] **Step 3: Implement `parseChangelog()` and enrich `getHistory()`**

In `src/main/presenter/evolutionPresenter.ts`, replace the `getHistory()` method (lines 101-113) and add `parseChangelog()`:

```typescript
async getHistory(): Promise<EvolutionNode[]> {
  const tags = await this.git.listTags("egg-*");
  const changelog = await this.parseChangelog();

  return tags.map((tag, i) => {
    const entry = changelog.get(tag);
    return {
      id: tag,
      tag,
      description: entry?.summary || tag,
      request: entry?.request || "",
      changes: entry?.changes || [],
      createdAt: entry?.date || "",
      gitRef: tag,
      parent: tags[i + 1],
    };
  });
}

private async parseChangelog(): Promise<
  Map<string, { request: string; summary: string; date: string; changes: string[] }>
> {
  const result = new Map<
    string,
    { request: string; summary: string; date: string; changes: string[] }
  >();

  let content: string;
  try {
    content = await readFile(join(paths.effectiveProjectRoot, CHANGELOG_FILE), "utf-8");
  } catch {
    return result;
  }

  const entries = content.split(/(?=^## \[)/m).slice(1);
  for (const entry of entries) {
    const headerMatch = entry.match(/^## \[(.+?)\] - (\d{4}-\d{2}-\d{2})/);
    if (!headerMatch) continue;
    const [, tag, date] = headerMatch;

    const requestMatch = entry.match(/- Request: "(.+?)"/);
    const summaryMatch = entry.match(/- Summary: (.+)/);

    const changes: string[] = [];
    const changesSection = entry.match(/### Changes\n([\s\S]*?)(?:\n---|\n## |$)/);
    if (changesSection) {
      const lines = changesSection[1].split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") && !trimmed.includes("(no file changes recorded)")) {
          changes.push(trimmed.slice(2));
        }
      }
    }

    result.set(tag, {
      request: requestMatch?.[1] || "",
      summary: summaryMatch?.[1] || "",
      date,
      changes,
    });
  }

  return result;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`
Expected: ALL PASS

- [x] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): enrich getHistory with CHANGELOG parsing"
```

---

### Task 2: Add "历史" Tab to FunctionPanel

**Files:**

- Modify: `src/renderer/src/components/function/FunctionPanel.vue`
- Modify: `src/renderer/src/views/EvolutionCenter.vue:40`
- Modify: `test/renderer/components/FunctionPanel.test.ts`

- [x] **Step 1: Write failing test for the new tab**

Add to `test/renderer/components/FunctionPanel.test.ts`:

```typescript
it("should show history tab button", () => {
  const wrapper = mount(FunctionPanel, {
    props: { activeTab: "tools", toolCallBlocks: [] },
  });
  const historyTab = wrapper.find('[data-testid="tab-history"]');
  expect(historyTab.exists()).toBe(true);
  expect(historyTab.text()).toContain("历史");
});

it("should emit update:activeTab with history on tab click", async () => {
  const wrapper = mount(FunctionPanel, {
    props: { activeTab: "tools", toolCallBlocks: [] },
  });
  await wrapper.find('[data-testid="tab-history"]').trigger("click");
  expect(wrapper.emitted("update:activeTab")).toBeTruthy();
  expect(wrapper.emitted("update:activeTab")![0]).toEqual(["history"]);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/renderer/components/FunctionPanel.test.ts`
Expected: FAIL — no element with `data-testid="tab-history"`

- [x] **Step 3: Add the history tab button and HistoryPanel rendering to FunctionPanel**

Replace `src/renderer/src/components/function/FunctionPanel.vue` entirely:

```vue
<template>
  <div class="flex h-full flex-col">
    <div class="flex shrink-0 border-b border-border">
      <button
        data-testid="tab-tools"
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
        data-testid="tab-preview"
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
      <button
        data-testid="tab-history"
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="
          activeTab === 'history'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="$emit('update:activeTab', 'history')"
      >
        历史
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
      <HistoryPanel v-else-if="activeTab === 'history'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import ToolPanel from "./ToolPanel.vue";
import ContentDispatcher from "./ContentDispatcher.vue";
import HistoryPanel from "./HistoryPanel.vue";
import { useContentStore } from "@/stores/content";
import { usePresenter } from "@/composables/usePresenter";

defineProps<{
  activeTab: "tools" | "preview" | "history";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "update:activeTab": [tab: "tools" | "preview" | "history"];
  "select-tool-call": [id: string | null];
}>();

const contentStore = useContentStore();
const contentPresenter = usePresenter("contentPresenter");
const agentPresenter = usePresenter("agentPresenter");

function onInteractionSubmit(result: { selected?: string | string[]; extra_input?: string }) {
  const content = contentStore.content;
  if (content?.type !== "interaction") return;
  agentPresenter.answerQuestion(content.sessionId, content.toolCallId, JSON.stringify(result));
}

function onProgressCancel() {
  contentPresenter.cancelProgress("current");
}
</script>
```

Also update the `activeTab` type in `src/renderer/src/views/EvolutionCenter.vue` line 40:

```typescript
const activeTab = ref<"tools" | "preview" | "history">("tools");
```

**Note:** `HistoryPanel.vue` does not exist yet. Create a minimal stub to allow compilation:

Create `src/renderer/src/components/function/HistoryPanel.vue`:

```vue
<template>
  <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
    还没有进化记录
  </div>
</template>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/renderer/components/FunctionPanel.test.ts`
Expected: ALL PASS

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/FunctionPanel.vue src/renderer/src/components/function/HistoryPanel.vue src/renderer/src/views/EvolutionCenter.vue test/renderer/components/FunctionPanel.test.ts
git commit -m "feat(ui): add history tab to FunctionPanel"
```

---

### Task 3: Implement HistoryPanel Component

**Files:**

- Modify: `src/renderer/src/components/function/HistoryPanel.vue`
- Create: `test/renderer/components/HistoryPanel.test.ts`

- [x] **Step 1: Write failing tests for HistoryPanel**

Create `test/renderer/components/HistoryPanel.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import HistoryPanel from "@/components/function/HistoryPanel.vue";

const mockGetHistory = vi.fn();
const mockRollback = vi.fn();

vi.mock("@/composables/usePresenter", () => ({
  usePresenter: (name: string) => {
    if (name === "evolutionPresenter") {
      return { getHistory: mockGetHistory, rollback: mockRollback };
    }
    return new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) });
  },
}));

(window as any).electron = {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  },
};

const TWO_NODES = [
  {
    id: "egg-v0.1-dev.2",
    tag: "egg-v0.1-dev.2",
    description: "新增赛博时钟",
    request: "添加时钟功能",
    changes: ["src/Clock.vue"],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.2",
    parent: "egg-v0.1-dev.1",
  },
  {
    id: "egg-v0.1-dev.1",
    tag: "egg-v0.1-dev.1",
    description: "缩小字体",
    request: "缩小字体",
    changes: [],
    createdAt: "2026-04-24",
    gitRef: "egg-v0.1-dev.1",
  },
];

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockGetHistory.mockResolvedValue(TWO_NODES);
    mockRollback.mockResolvedValue(true);
  });

  it("shows loading state initially", () => {
    mockGetHistory.mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = mount(HistoryPanel);
    expect(wrapper.find('[data-testid="history-loading"]').exists()).toBe(true);
  });

  it("shows empty state when no history", async () => {
    mockGetHistory.mockResolvedValue([]);
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("还没有进化记录");
  });

  it("renders version list after loading", async () => {
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    const items = wrapper.findAll('[data-testid="history-item"]');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain("egg-v0.1-dev.2");
    expect(items[0].text()).toContain("添加时钟功能");
    expect(items[0].text()).toContain("当前");
  });

  it("shows rollback button on non-current items", async () => {
    const wrapper = mount(HistoryPanel);
    await flushPromises();
    const items = wrapper.findAll('[data-testid="history-item"]');
    // First item (current) should NOT have rollback button
    expect(items[0].find('[data-testid="rollback-btn"]').exists()).toBe(false);
    // Second item should have rollback button
    expect(items[1].find('[data-testid="rollback-btn"]').exists()).toBe(true);
  });

  it("shows confirm dialog and executes rollback", async () => {
    const wrapper = mount(HistoryPanel, {
      global: { stubs: { teleport: true } },
    });
    await flushPromises();

    // Click rollback on second item
    await wrapper
      .findAll('[data-testid="history-item"]')[1]
      .find('[data-testid="rollback-btn"]')
      .trigger("click");

    // Confirm dialog should appear
    expect(wrapper.find('[data-testid="rollback-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("确认回滚");
    expect(wrapper.text()).toContain("egg-v0.1-dev.1");

    // Confirm rollback
    await wrapper.find('[data-testid="rollback-confirm-btn"]').trigger("click");
    await flushPromises();

    expect(mockRollback).toHaveBeenCalledWith("egg-v0.1-dev.1");
    // Should reload history after rollback
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/renderer/components/HistoryPanel.test.ts`
Expected: FAIL — HistoryPanel is a stub with no data-testid attributes

- [x] **Step 3: Implement HistoryPanel.vue**

Replace `src/renderer/src/components/function/HistoryPanel.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import type { EvolutionNode } from "@shared/types/evolution";
import { usePresenter } from "@/composables/usePresenter";
import { EVOLUTION_EVENTS } from "@shared/events";

const evolutionPresenter = usePresenter("evolutionPresenter");

const nodes = ref<EvolutionNode[]>([]);
const isLoading = ref(true);
const rollbackTarget = ref<EvolutionNode | null>(null);

async function loadHistory() {
  isLoading.value = true;
  try {
    nodes.value = await evolutionPresenter.getHistory();
  } catch {
    nodes.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function confirmRollback() {
  if (!rollbackTarget.value) return;
  await evolutionPresenter.rollback(rollbackTarget.value.tag);
  rollbackTarget.value = null;
  await loadHistory();
}

onMounted(() => {
  loadHistory();
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, () => loadHistory());
});

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners(EVOLUTION_EVENTS.COMPLETED);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <!-- Loading -->
    <div
      v-if="isLoading"
      data-testid="history-loading"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      加载中...
    </div>

    <!-- Empty -->
    <div
      v-else-if="nodes.length === 0"
      data-testid="history-empty"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      还没有进化记录
    </div>

    <!-- List -->
    <div v-else class="p-3">
      <div
        v-for="(node, index) in nodes"
        :key="node.tag"
        data-testid="history-item"
        class="relative flex gap-3 pb-4"
      >
        <!-- Timeline indicator -->
        <div class="flex flex-col items-center pt-1">
          <div
            class="h-2.5 w-2.5 shrink-0 rounded-full border-2"
            :class="
              index === 0
                ? 'border-violet-500 bg-violet-500'
                : 'border-muted-foreground/40 bg-transparent'
            "
          />
          <div v-if="index < nodes.length - 1" class="mt-1 w-px flex-1 bg-border" />
        </div>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span
              class="font-mono text-xs font-semibold"
              :class="index === 0 ? 'text-violet-500' : 'text-foreground'"
            >
              {{ node.tag }}
            </span>
            <span
              v-if="index === 0"
              class="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-400"
            >
              当前
            </span>
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            <span v-if="node.createdAt">{{ node.createdAt }}</span>
            <template v-if="node.request">
              <span v-if="node.createdAt" class="mx-1 opacity-40">|</span>
              <span class="truncate">{{ node.request }}</span>
            </template>
          </div>

          <!-- Rollback button (non-current only) -->
          <button
            v-if="index !== 0"
            data-testid="rollback-btn"
            class="mt-1.5 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-violet-500 hover:text-violet-400"
            @click="rollbackTarget = node"
          >
            回滚到此版本
          </button>
        </div>
      </div>
    </div>

    <!-- Rollback confirm dialog -->
    <Teleport to="body">
      <div
        v-if="rollbackTarget"
        data-testid="rollback-dialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="rollbackTarget = null"
      >
        <div class="w-80 rounded-lg border border-border bg-background p-5 shadow-xl">
          <h3 class="text-sm font-semibold text-foreground">确认回滚</h3>
          <p class="mt-2 text-xs text-muted-foreground">
            即将回滚到
            <code class="rounded bg-muted px-1 py-0.5 font-mono text-violet-400">{{
              rollbackTarget.tag
            }}</code>
          </p>
          <div class="mt-4 flex gap-2">
            <button
              data-testid="rollback-confirm-btn"
              class="flex-1 rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
              @click="confirmRollback"
            >
              确认回滚
            </button>
            <button
              class="flex-1 rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              @click="rollbackTarget = null"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/renderer/components/HistoryPanel.test.ts`
Expected: ALL PASS

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/components/function/HistoryPanel.vue test/renderer/components/HistoryPanel.test.ts
git commit -m "feat(ui): implement HistoryPanel with timeline and rollback"
```

---

### Task 4: Lint, Format, and Verify

**Files:** All modified files

- [x] **Step 1: Run format**

Run: `pnpm run format`
Expected: Files formatted

- [x] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: No errors

- [x] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No type errors

- [x] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [x] **Step 5: Fix any issues found and commit**

```bash
git add -A
git commit -m "chore: format and lint for TASK-008"
```
