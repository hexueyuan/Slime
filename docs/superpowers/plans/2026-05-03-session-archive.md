# Session Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 SessionList 中增加归档区，将三天前无对话（且非置顶）的会话自动归入折叠的归档分组。

**Architecture:** 纯前端计算，不改动数据库/DAO/Presenter。在 `agentSession` store 中将 `sortedSessions` 拆分为 `activeSessions`（活跃区）和 `archivedSessions`（归档区）两个 computed，SessionList.vue 消费两个列表分组渲染，归档区默认折叠在列表底部。

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, Vitest, @vue/test-utils

---

## 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/renderer/src/stores/agentSession.ts` | Modify | 拆分 `sortedSessions` → `activeSessions` + `archivedSessions` |
| `src/renderer/src/components/chat/SessionList.vue` | Modify | 分组渲染 + 折叠 toggle + 搜索联动，更新 `sortedSessions` → `activeSessions` 引用 |
| `test/renderer/stores/agentSession.test.ts` | Create | Store 归档逻辑单元测试 |
| `test/renderer/components/chat/SessionList.test.ts` | Create | SessionList 归档 UI 测试 |

---

## Task 1: 拆分 Store computed

**Files:**
- Modify: `src/renderer/src/stores/agentSession.ts`
- Test: `test/renderer/stores/agentSession.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/renderer/stores/agentSession.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();
(globalThis as any).window = {
  electron: {
    ipcRenderer: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), removeAllListeners: vi.fn() },
  },
};

import { useAgentSessionStore } from "@/stores/agentSession";

const NOW = 1000000000000; // 固定基准时间
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_MS = 3 * DAY_MS;

function makeSession(overrides: Partial<{ id: string; updatedAt: number; isPinned: boolean }>) {
  return {
    id: "s1",
    agentId: "a1",
    title: "test",
    isPinned: false,
    sessionKind: "regular" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("agentSession store - archive logic", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("recent session appears in activeSessions", async () => {
    const recent = makeSession({ id: "s1", updatedAt: NOW - DAY_MS });
    mockInvoke.mockResolvedValue([recent]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.activeSessions.map((s) => s.id)).toContain("s1");
    expect(store.archivedSessions.map((s) => s.id)).not.toContain("s1");
  });

  it("session older than 3 days appears in archivedSessions", async () => {
    const old = makeSession({ id: "s2", updatedAt: NOW - THRESHOLD_MS - 1 });
    mockInvoke.mockResolvedValue([old]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.archivedSessions.map((s) => s.id)).toContain("s2");
    expect(store.activeSessions.map((s) => s.id)).not.toContain("s2");
  });

  it("pinned session stays in activeSessions even if older than 3 days", async () => {
    const pinned = makeSession({ id: "s3", updatedAt: NOW - THRESHOLD_MS - 1, isPinned: true });
    mockInvoke.mockResolvedValue([pinned]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.activeSessions.map((s) => s.id)).toContain("s3");
    expect(store.archivedSessions.map((s) => s.id)).not.toContain("s3");
  });

  it("session exactly at threshold boundary goes to archivedSessions", async () => {
    const boundary = makeSession({ id: "s4", updatedAt: NOW - THRESHOLD_MS });
    mockInvoke.mockResolvedValue([boundary]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.archivedSessions.map((s) => s.id)).toContain("s4");
  });

  it("activeSessions sorted: pinned first then by updatedAt DESC", async () => {
    const s1 = makeSession({ id: "s1", updatedAt: NOW - 1000, isPinned: false });
    const s2 = makeSession({ id: "s2", updatedAt: NOW - 500, isPinned: false });
    const s3 = makeSession({ id: "s3", updatedAt: NOW - 2000, isPinned: true });
    mockInvoke.mockResolvedValue([s1, s2, s3]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    const ids = store.activeSessions.map((s) => s.id);
    expect(ids[0]).toBe("s3"); // pinned first
    expect(ids[1]).toBe("s2"); // then newest
    expect(ids[2]).toBe("s1");
  });

  it("archivedSessions sorted by updatedAt DESC", async () => {
    const s1 = makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - DAY_MS });
    const s2 = makeSession({ id: "s2", updatedAt: NOW - THRESHOLD_MS - 2 * DAY_MS });
    mockInvoke.mockResolvedValue([s1, s2]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    const ids = store.archivedSessions.map((s) => s.id);
    expect(ids[0]).toBe("s1"); // less old = first
    expect(ids[1]).toBe("s2");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm test test/renderer/stores/agentSession.test.ts
```

期望输出：`FAIL` — `activeSessions is not a function` 或类似错误（store 还没有这两个 computed）

- [ ] **Step 3: 修改 store**

将 `src/renderer/src/stores/agentSession.ts` 中的 `sortedSessions` 替换为 `activeSessions` 和 `archivedSessions`：

```typescript
import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentChatStore } from "./agentChat";
import type { SessionRecord } from "@shared/types/agent";

const ARCHIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export const useAgentSessionStore = defineStore("agentSession", () => {
  const chatPresenter = usePresenter("agentChatPresenter");

  const sessions = ref<SessionRecord[]>([]);
  const activeSessionId = ref<string | null>(null);

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeSessionId.value) ?? null,
  );

  const activeSessions = computed(() =>
    [...sessions.value]
      .filter((s) => s.isPinned || s.updatedAt >= Date.now() - ARCHIVE_THRESHOLD_MS)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
  );

  const archivedSessions = computed(() =>
    [...sessions.value]
      .filter((s) => !s.isPinned && s.updatedAt < Date.now() - ARCHIVE_THRESHOLD_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  async function fetchSessions(agentId?: string) {
    const result = await chatPresenter.getSessions(agentId);
    sessions.value = (Array.isArray(result) ? result : []) as SessionRecord[];
  }

  function setActiveSession(id: string | null) {
    activeSessionId.value = id;
  }

  async function createSession(agentId: string): Promise<SessionRecord> {
    const session = (await chatPresenter.createSession(agentId)) as SessionRecord;
    await fetchSessions();
    activeSessionId.value = session.id;
    return session;
  }

  async function deleteSession(id: string) {
    await chatPresenter.deleteSession(id);
    if (activeSessionId.value === id) {
      activeSessionId.value = null;
      useAgentChatStore().clearMessages();
    }
    await fetchSessions();
  }

  async function updateTitle(id: string, title: string) {
    await chatPresenter.updateSessionTitle(id, title);
    await fetchSessions();
  }

  async function togglePin(id: string) {
    await chatPresenter.togglePin(id);
    await fetchSessions();
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeSessions,
    archivedSessions,
    fetchSessions,
    setActiveSession,
    createSession,
    deleteSession,
    updateTitle,
    togglePin,
  };
});
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/renderer/stores/agentSession.test.ts
```

期望输出：所有 6 个 test case `PASS`

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/stores/agentSession.ts test/renderer/stores/agentSession.test.ts
git commit -m "feat(agent): split sortedSessions into activeSessions + archivedSessions"
```

---

## Task 2: 更新 SessionList.vue 分组渲染

**Files:**
- Modify: `src/renderer/src/components/chat/SessionList.vue`
- Test: `test/renderer/components/chat/SessionList.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/renderer/components/chat/SessionList.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();
(window as any).electron = {
  ipcRenderer: {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    removeAllListeners: vi.fn(),
  },
};

vi.mock("@iconify/vue", () => ({ Icon: { template: "<span />" } }));

import SessionList from "@/components/chat/SessionList.vue";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentStore } from "@/stores/agent";

const NOW = 1000000000000;
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_MS = 3 * DAY_MS;

function makeSession(overrides: Partial<{ id: string; updatedAt: number; isPinned: boolean; agentId: string; title: string }>) {
  return {
    id: "s1",
    agentId: "a1",
    title: "Test Session",
    isPinned: false,
    sessionKind: "regular" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("SessionList - archive", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("no archived section when all sessions are active", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - DAY_MS })];
    const agentStore = useAgentStore();
    agentStore.agents = [{ id: "a1", name: "Bot", type: "builtin", enabled: true, protected: false, config: {} as any, avatar: null }];

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archive-header"]').exists()).toBe(false);
  });

  it("archived section appears when there are archived sessions", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })];
    const agentStore = useAgentStore();
    agentStore.agents = [{ id: "a1", name: "Bot", type: "builtin", enabled: true, protected: false, config: {} as any, avatar: null }];

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archive-header"]').exists()).toBe(true);
  });

  it("archived section is collapsed by default", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })];

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(false);
  });

  it("clicking archive header expands the archived section", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })];

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(true);
  });

  it("clicking archive header again collapses the archived section", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })];

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(false);
  });

  it("auto-expands archive when active session is archived", async () => {
    const store = useAgentSessionStore();
    const archivedSession = makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 });
    store.sessions = [archivedSession];
    store.activeSessionId = "s1";

    const wrapper = mount(SessionList);
    expect(wrapper.find('[data-testid="archived-session-list"]').exists()).toBe(true);
  });

  it("archived sessions do not show pin menu item", async () => {
    const store = useAgentSessionStore();
    store.sessions = [makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - 1 })];

    const wrapper = mount(SessionList);
    await wrapper.find('[data-testid="archive-header"]').trigger("click");
    const item = wrapper.find('[data-testid="archived-session-list"] [data-testid="session-item"]');
    await item.trigger("contextmenu");
    expect(wrapper.find('[data-testid="pin-menu-item"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/renderer/components/chat/SessionList.test.ts
```

期望输出：`FAIL` — `archive-header` 找不到等错误

- [ ] **Step 3: 修改 SessionList.vue**

用以下内容完整替换 `src/renderer/src/components/chat/SessionList.vue`：

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import { usePresenter } from "@/composables/usePresenter";

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();
const emit = defineEmits<{
  select: [id: string];
}>();
const searchQuery = ref("");

// 活跃区：搜索过滤
const filteredActive = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return sessionStore.activeSessions;
  return sessionStore.activeSessions.filter((s) => s.title.toLowerCase().includes(q));
});

// 归档区：搜索过滤
const filteredArchived = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return sessionStore.archivedSessions;
  return sessionStore.archivedSessions.filter((s) => s.title.toLowerCase().includes(q));
});

// 归档区折叠状态：若当前激活会话在归档区则初始展开；搜索命中归档时自动展开
const isArchivedExpanded = computed({
  get() {
    if (searchQuery.value.trim() && filteredArchived.value.length > 0) return true;
    return _isArchivedExpandedManual.value ||
      sessionStore.archivedSessions.some((s) => s.id === sessionStore.activeSessionId);
  },
  set(val: boolean) {
    _isArchivedExpandedManual.value = val;
  },
});
const _isArchivedExpandedManual = ref(false);

function toggleArchive() {
  // 若当前是因搜索或 activeSession 自动展开，点击后切换手动状态
  _isArchivedExpandedManual.value = !isArchivedExpanded.value;
}

function getAgentName(agentId: string): string {
  const agent = agentStore.agents.find((a) => a.id === agentId);
  return agent?.name ?? "Unknown";
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

function onNewSession() {
  sessionStore.setActiveSession(null);
  chatStore.clearMessages();
}

// Context menu
const contextMenuSessionId = ref<string | null>(null);
const contextMenuPos = ref({ x: 0, y: 0 });
const showContextMenu = ref(false);
const isContextMenuArchived = ref(false);

const MENU_WIDTH = 160;
const MENU_HEIGHT = 100;

function onContextMenu(e: MouseEvent, sessionId: string, archived = false) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuSessionId.value = sessionId;
  isContextMenuArchived.value = archived;
  const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT - 8);
  contextMenuPos.value = { x, y };
  showContextMenu.value = true;
}

function closeContextMenu() {
  showContextMenu.value = false;
  contextMenuSessionId.value = null;
  isContextMenuArchived.value = false;
}

onMounted(() => document.addEventListener("click", closeContextMenu, true));
onUnmounted(() => document.removeEventListener("click", closeContextMenu, true));

async function onPin() {
  if (contextMenuSessionId.value) {
    await sessionStore.togglePin(contextMenuSessionId.value);
  }
  closeContextMenu();
}

async function onDelete() {
  if (contextMenuSessionId.value) {
    await sessionStore.deleteSession(contextMenuSessionId.value);
  }
  closeContextMenu();
}

const renaming = ref<string | null>(null);
const renameInput = ref("");

function onRename() {
  if (contextMenuSessionId.value) {
    const session = sessionStore.sessions.find((s) => s.id === contextMenuSessionId.value);
    renaming.value = contextMenuSessionId.value;
    renameInput.value = session?.title ?? "";
  }
  closeContextMenu();
}

async function onRenameConfirm() {
  if (renaming.value && renameInput.value.trim()) {
    await sessionStore.updateTitle(renaming.value, renameInput.value.trim());
    const chatPresenter = usePresenter("agentChatPresenter");
    await chatPresenter.updateSessionMetadata(renaming.value, { titleManuallyEdited: true });
  }
  renaming.value = null;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-3 py-2">
      <span class="text-sm font-medium text-foreground">会话</span>
      <button
        data-testid="new-session-btn"
        class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="新建对话"
        @click="onNewSession"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <!-- Search -->
    <div class="px-3 py-2">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索会话..."
        class="w-full rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none"
      />
    </div>

    <!-- Session list -->
    <div class="flex-1 overflow-y-auto px-2">
      <!-- Active sessions -->
      <div
        v-for="session in filteredActive"
        :key="session.id"
        data-testid="session-item"
        :class="[
          'mb-0.5 cursor-pointer rounded-md px-2.5 py-2 transition-colors',
          session.id === sessionStore.activeSessionId
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        ]"
        @click="emit('select', session.id)"
        @contextmenu="onContextMenu($event, session.id, false)"
      >
        <input
          v-if="renaming === session.id"
          v-model="renameInput"
          class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
          @blur="onRenameConfirm"
          @keydown.enter="onRenameConfirm"
          @keydown.escape="renaming = null"
          @click.stop
        />
        <template v-else>
          <div class="flex items-center gap-1.5">
            <span
              class="inline-block max-w-[60px] truncate rounded-sm bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
            >
              {{ getAgentName(session.agentId) }}
            </span>
            <Icon v-if="session.isPinned" icon="lucide:pin" class="h-3 w-3 text-muted-foreground" />
          </div>
          <div class="mt-0.5 truncate text-sm">{{ session.title }}</div>
          <div class="mt-0.5 text-[10px] text-muted-foreground">
            {{ formatTime(session.updatedAt) }}
          </div>
        </template>
      </div>

      <div
        v-if="filteredActive.length === 0 && filteredArchived.length === 0"
        class="px-2 py-4 text-center text-xs text-muted-foreground"
      >
        暂无会话
      </div>

      <!-- Archive section (only rendered when there are archived sessions) -->
      <template v-if="sessionStore.archivedSessions.length > 0">
        <!-- Archive header -->
        <button
          data-testid="archive-header"
          class="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          @click="toggleArchive"
        >
          <Icon
            :icon="isArchivedExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
            class="h-3 w-3"
          />
          <span>归档 ({{ sessionStore.archivedSessions.length }})</span>
        </button>

        <!-- Archived sessions list -->
        <div v-if="isArchivedExpanded" data-testid="archived-session-list">
          <div
            v-for="session in filteredArchived"
            :key="session.id"
            data-testid="session-item"
            :class="[
              'mb-0.5 cursor-pointer rounded-md px-2.5 py-2 transition-colors',
              session.id === sessionStore.activeSessionId
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            ]"
            @click="emit('select', session.id)"
            @contextmenu="onContextMenu($event, session.id, true)"
          >
            <input
              v-if="renaming === session.id"
              v-model="renameInput"
              class="w-full rounded border border-violet-500 bg-transparent px-1 text-sm text-foreground focus:outline-none"
              @blur="onRenameConfirm"
              @keydown.enter="onRenameConfirm"
              @keydown.escape="renaming = null"
              @click.stop
            />
            <template v-else>
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-block max-w-[60px] truncate rounded-sm bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
                >
                  {{ getAgentName(session.agentId) }}
                </span>
              </div>
              <div class="mt-0.5 truncate text-sm">{{ session.title }}</div>
              <div class="mt-0.5 text-[10px] text-muted-foreground">
                {{ formatTime(session.updatedAt) }}
              </div>
            </template>
          </div>

          <div
            v-if="filteredArchived.length === 0 && searchQuery.trim()"
            class="px-2 py-2 text-center text-xs text-muted-foreground"
          >
            无匹配归档会话
          </div>
        </div>
      </template>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="fixed z-50 min-w-[140px] rounded-md border border-border bg-neutral-900 py-1 shadow-lg"
        :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
      >
        <button
          v-if="!isContextMenuArchived"
          data-testid="pin-menu-item"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          @click="onPin"
        >
          <Icon icon="lucide:pin" class="h-3 w-3" />
          置顶 / 取消置顶
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          @click="onRename"
        >
          <Icon icon="lucide:pencil" class="h-3 w-3" />
          重命名
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-muted"
          @click="onDelete"
        >
          <Icon icon="lucide:trash-2" class="h-3 w-3" />
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/renderer/components/chat/SessionList.test.ts
```

期望输出：所有 7 个 test case `PASS`

- [ ] **Step 5: 运行全量测试，确认无回归**

```bash
pnpm test
```

期望输出：全部 `PASS`，无新增失败

- [ ] **Step 6: 格式化 + lint**

```bash
pnpm run format && pnpm run lint
```

期望输出：无错误

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/chat/SessionList.vue test/renderer/components/chat/SessionList.test.ts
git commit -m "feat(agent): add archive section to SessionList"
```
