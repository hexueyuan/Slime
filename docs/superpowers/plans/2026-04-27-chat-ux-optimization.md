# Chat UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Optimize Slime's chat with iMessage-style avatars, message actions (timestamp/copy/regenerate), auto-generated titles, and configurable user profile.

**Architecture:** Renderer-side layout restructure (ChatMessageUser/Assistant → iMessage-style with avatar+timestamp+actions). Main-process title generation via `generateText` in adapter. User profile stored in ConfigPresenter, session title metadata in new `metadata_json` column.

**Tech Stack:** Vue 3, Pinia, TailwindCSS, better-sqlite3, AI SDK `generateText`

---

### Task 1: Add UserProfile type + SessionMetadata + DB migration

**Files:**

- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/models/agentSessionDao.ts`
- Test: `test/main/agentSessionDao.test.ts`

- [x] **Step 1: Write failing test for session metadata read/write**

```ts
// test/main/agentSessionDao.test.ts — add inside existing describe
it("reads and writes session metadata", () => {
  sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });

  // Initially no metadata
  const session = sessionDao.getSessionById(db, "s1")!;
  expect(session.metadata).toBeNull();

  // Write metadata
  sessionDao.updateMetadata(db, "s1", { titleGeneratedCount: 1, titleManuallyEdited: false });

  const updated = sessionDao.getSessionById(db, "s1")!;
  expect(updated.metadata).toEqual({ titleGeneratedCount: 1, titleManuallyEdited: false });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test test/main/agentSessionDao.test.ts`
Expected: FAIL — `updateMetadata` is not a function, `metadata` field missing from SessionRecord

- [x] **Step 3: Add SessionMetadata type to agent.d.ts**

Add after `SubagentMeta` type in `src/shared/types/agent.d.ts`:

```ts
export interface SessionMetadata {
  titleGeneratedCount?: number;
  titleManuallyEdited?: boolean;
}
```

Add `metadata?: SessionMetadata | null` field to `SessionRecord` interface:

```ts
export interface SessionRecord {
  // ... existing fields ...
  subagentMeta?: SubagentMeta | null;
  metadata?: SessionMetadata | null;
  createdAt: number;
  updatedAt: number;
}
```

Add `UserProfile` type after `AgentAvatar`:

```ts
export type UserProfile = {
  name?: string;
  avatar?: AgentAvatar;
};
```

- [x] **Step 4: Add metadata_json column to agent_sessions table**

In `src/main/db/database.ts`, add inside the `migrate()` function (after the last `ALTER TABLE` try/catch):

```ts
try {
  instance.exec("ALTER TABLE agent_sessions ADD COLUMN metadata_json TEXT");
} catch {
  // column already exists
}
```

- [x] **Step 5: Update agentSessionDao to handle metadata_json**

Add `metadata_json: string | null` to `SessionRow` interface.

Update `rowToSession` to parse metadata:

```ts
function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    isPinned: !!row.is_pinned,
    sessionKind: row.session_kind as SessionRecord["sessionKind"],
    parentSessionId: row.parent_session_id,
    subagentMeta: row.subagent_meta_json
      ? (JSON.parse(row.subagent_meta_json) as SubagentMeta)
      : null,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as SessionMetadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

Add import for `SessionMetadata` and add `updateMetadata` function:

```ts
export function updateMetadata(
  db: BetterSqlite3.Database,
  id: string,
  metadata: SessionMetadata,
): void {
  db.prepare("UPDATE agent_sessions SET metadata_json = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(metadata),
    Date.now(),
    id,
  );
}
```

- [x] **Step 6: Run test to verify it passes**

Run: `pnpm test test/main/agentSessionDao.test.ts`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/db/database.ts src/main/db/models/agentSessionDao.ts test/main/agentSessionDao.test.ts
git commit -m "feat(chat): add UserProfile type, SessionMetadata, and DB migration"
```

---

### Task 2: Add formatMessageTime helper + agentChatStore userProfile

**Files:**

- Create: `src/renderer/src/utils/formatTime.ts`
- Test: `test/renderer/utils/formatTime.test.ts`
- Modify: `src/renderer/src/stores/agentChat.ts`

- [x] **Step 1: Write failing test for formatMessageTime**

```ts
// test/renderer/utils/formatTime.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock Date.now to a fixed time: 2026-04-27 14:00:00
const MOCK_NOW = new Date(2026, 3, 27, 14, 0, 0).getTime();
vi.stubGlobal(
  "Date",
  class extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(MOCK_NOW);
      else super(...(args as [number]));
    }
    static now() {
      return MOCK_NOW;
    }
  },
);

import { formatMessageTime } from "@/utils/formatTime";

describe("formatMessageTime", () => {
  it("shows HH:mm for today", () => {
    const today = new Date(2026, 3, 27, 9, 32).getTime();
    expect(formatMessageTime(today)).toBe("09:32");
  });

  it("shows 昨天 HH:mm for yesterday", () => {
    const yesterday = new Date(2026, 3, 26, 15, 45).getTime();
    expect(formatMessageTime(yesterday)).toBe("昨天 15:45");
  });

  it("shows MM-DD HH:mm for this year", () => {
    const thisYear = new Date(2026, 0, 15, 10, 30).getTime();
    expect(formatMessageTime(thisYear)).toBe("01-15 10:30");
  });

  it("shows YYYY-MM-DD HH:mm for older dates", () => {
    const older = new Date(2025, 5, 10, 8, 5).getTime();
    expect(formatMessageTime(older)).toBe("2025-06-10 08:05");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test test/renderer/utils/formatTime.test.ts`
Expected: FAIL — module not found

- [x] **Step 3: Implement formatMessageTime**

Create `src/renderer/src/utils/formatTime.ts`:

```ts
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) return hhmm;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return `昨天 ${hhmm}`;

  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  if (date.getFullYear() === now.getFullYear()) return `${mmdd} ${hhmm}`;

  const yyyymmdd = `${date.getFullYear()}-${mmdd}`;
  return `${yyyymmdd} ${hhmm}`;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test test/renderer/utils/formatTime.test.ts`
Expected: PASS

- [x] **Step 5: Add userProfile to agentChatStore**

In `src/renderer/src/stores/agentChat.ts`, add imports and state:

```ts
import type { UserProfile, AgentAvatar } from "@shared/types/agent";
```

Add state inside the store:

```ts
const userProfile = ref<UserProfile | null>(null);
const configPresenter = usePresenter("configPresenter");
```

Add methods:

```ts
async function fetchUserProfile() {
  const raw = await configPresenter.get("app.userProfile");
  if (raw && typeof raw === "object") {
    userProfile.value = raw as UserProfile;
  } else {
    // Default: monogram with first char of evolution.user or "U"
    const userName = (await configPresenter.get("evolution.user")) as string | null;
    const firstChar = userName?.charAt(0) || "U";
    userProfile.value = {
      name: userName || undefined,
      avatar: { kind: "monogram", text: firstChar, backgroundColor: "#3b82f6" },
    };
  }
},

async function saveUserProfile(profile: UserProfile) {
  await configPresenter.set("app.userProfile", profile);
  userProfile.value = profile;
},
```

Return `userProfile`, `fetchUserProfile`, `saveUserProfile` from the store.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/utils/formatTime.ts test/renderer/utils/formatTime.test.ts src/renderer/src/stores/agentChat.ts
git commit -m "feat(chat): add formatMessageTime helper and agentChatStore userProfile"
```

---

### Task 3: Restructure ChatMessageUser (avatar + timestamp + copy)

**Files:**

- Modify: `src/renderer/src/components/chat/ChatMessageUser.vue`
- Modify: `src/renderer/src/components/chat/ChatMessageList.vue`

- [x] **Step 1: Rewrite ChatMessageUser.vue with iMessage layout**

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import AgentAvatar from "./AgentAvatar.vue";
import { formatMessageTime } from "@/utils/formatTime";
import { useAgentChatStore } from "@/stores/agentChat";
import type { ChatMessageRecord } from "@shared/types/agent";

const props = defineProps<{
  message: ChatMessageRecord;
  showTimestamp?: boolean;
}>();

const chatStore = useAgentChatStore();
const copied = ref(false);

function onCopy() {
  navigator.clipboard.writeText(props.message.content);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function getUserAvatar() {
  return (
    chatStore.userProfile?.avatar ?? {
      kind: "monogram" as const,
      text: "U",
      backgroundColor: "#3b82f6",
    }
  );
}

function getUserName() {
  return chatStore.userProfile?.name || "你";
}
</script>

<template>
  <div class="flex flex-row-reverse gap-2.5 mb-5 items-start group">
    <!-- Bubble column -->
    <div class="flex flex-col items-end max-w-[80%]">
      <!-- Name + time row -->
      <div v-if="showTimestamp !== false" class="flex items-center gap-1.5 mb-1 flex-row-reverse">
        <span class="text-xs font-medium text-foreground">{{ getUserName() }}</span>
        <span class="text-xs text-muted-foreground">{{
          formatMessageTime(message.createdAt)
        }}</span>
      </div>
      <!-- Bubble -->
      <div
        class="bg-violet-600 text-white rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed"
      >
        {{ message.content }}
      </div>
      <!-- Action bar -->
      <div
        class="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex-row-reverse"
      >
        <button
          class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          @click="onCopy"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
          <span>{{ copied ? "已复制" : "复制" }}</span>
        </button>
      </div>
    </div>
    <!-- Avatar -->
    <AgentAvatar :avatar="getUserAvatar()" size="sm" />
  </div>
</template>
```

- [x] **Step 2: Update ChatMessageList to pass showTimestamp**

In `src/renderer/src/components/chat/ChatMessageList.vue`, update the user message rendering to compute `showTimestamp` based on consecutive same-role within 5 minutes:

```vue
<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from "vue";
import ChatMessageUser from "./ChatMessageUser.vue";
import ChatMessageAssistant from "./ChatMessageAssistant.vue";
import { useAgentChatStore } from "@/stores/agentChat";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import type { ChatMessageRecord } from "@shared/types/agent";

const scrollContainer = ref<HTMLElement | null>(null);
const chatStore = useAgentChatStore();
const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();

const activeAgentId = computed(() => sessionStore.activeSession?.agentId);

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
}

function shouldShowTimestamp(messages: ChatMessageRecord[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  // Different role → always show
  if (prev.role !== curr.role) return true;
  // Same role, > 5 min gap → show
  return curr.createdAt - prev.createdAt > 5 * 60 * 1000;
}

function isLastMessage(messages: ChatMessageRecord[], index: number): boolean {
  return index === messages.length - 1;
}

watch([() => chatStore.messages.length, () => chatStore.streamingBlocks.length], scrollToBottom);
onMounted(scrollToBottom);
</script>

<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto px-4 py-3">
    <!-- History messages -->
    <template v-for="(msg, idx) in chatStore.messages" :key="msg.id">
      <ChatMessageUser
        v-if="msg.role === 'user'"
        :message="msg"
        :show-timestamp="shouldShowTimestamp(chatStore.messages, idx)"
      />
      <ChatMessageAssistant
        v-else
        :message="msg"
        :agent-id="activeAgentId ?? undefined"
        :show-timestamp="shouldShowTimestamp(chatStore.messages, idx)"
        :is-last="isLastMessage(chatStore.messages, idx)"
      />
    </template>

    <!-- Streaming message -->
    <ChatMessageAssistant
      v-if="chatStore.streamingBlocks.length > 0"
      :blocks="chatStore.streamingBlocks"
      :is-streaming="true"
      :agent-id="activeAgentId ?? undefined"
      :show-timestamp="true"
      :is-last="true"
    />

    <!-- Generating indicator -->
    <div
      v-if="chatStore.isGenerating && chatStore.streamingBlocks.length === 0"
      class="flex items-center gap-2 text-muted-foreground text-sm pl-10"
    >
      <div class="flex gap-1">
        <span
          class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
          style="animation-delay: 0ms"
        />
        <span
          class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
          style="animation-delay: 150ms"
        />
        <span
          class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
          style="animation-delay: 300ms"
        />
      </div>
      <span>思考中...</span>
    </div>
  </div>
</template>
```

- [x] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no type errors)

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageUser.vue src/renderer/src/components/chat/ChatMessageList.vue
git commit -m "feat(chat): restructure ChatMessageUser with avatar, timestamp, copy"
```

---

### Task 4: Restructure ChatMessageAssistant (avatar + timestamp + copy + regenerate)

**Files:**

- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`

- [x] **Step 1: Rewrite ChatMessageAssistant.vue with iMessage layout**

The existing `parsedBlocks`, debounce logic, and block rendering stays the same. We wrap it in the iMessage layout with avatar row and action bar.

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { NodeRenderer } from "markstream-vue";
import { Icon } from "@iconify/vue";
import AgentAvatar from "./AgentAvatar.vue";
import { formatMessageTime } from "@/utils/formatTime";
import { useAgentChatStore } from "@/stores/agentChat";
import { useAgentStore } from "@/stores/agent";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/agent";

const props = defineProps<{
  message?: ChatMessageRecord;
  blocks?: AssistantMessageBlock[];
  isStreaming?: boolean;
  agentId?: string;
  showTimestamp?: boolean;
  isLast?: boolean;
}>();

const chatStore = useAgentChatStore();
const agentStore = useAgentStore();
const copied = ref(false);

const parsedBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.blocks) return props.blocks;
  if (!props.message) return [];
  try {
    return JSON.parse(props.message.content) as AssistantMessageBlock[];
  } catch {
    return [
      { type: "content", content: props.message.content, status: "success", timestamp: Date.now() },
    ];
  }
});

const debouncedContents = ref<Map<number, string>>(new Map());

const updateDebounced = useDebounceFn(
  (idx: number, val: string) => {
    debouncedContents.value.set(idx, val);
  },
  32,
  { maxWait: 64 },
);

watch(
  () => parsedBlocks.value,
  (blocks) => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === "content" && blocks[i].content) {
        updateDebounced(i, blocks[i].content);
      }
    }
  },
  { immediate: true, deep: true },
);

function getBlockContent(idx: number, block: AssistantMessageBlock): string {
  return debouncedContents.value.get(idx) ?? block.content ?? "";
}

function formatToolInput(input: unknown): string {
  const str = JSON.stringify(input);
  return str.length > 100 ? str.slice(0, 100) + "..." : str;
}

function getAgentAvatar() {
  if (!props.agentId) return undefined;
  const agent = agentStore.agents.find((a) => a.id === props.agentId);
  return agent?.avatar;
}

function getAgentName() {
  if (!props.agentId) return "AI";
  const agent = agentStore.agents.find((a) => a.id === props.agentId);
  return agent?.name ?? "AI";
}

function extractPlainText(): string {
  return parsedBlocks.value
    .filter((b) => b.type === "content" && b.content)
    .map((b) => b.content!)
    .join("\n");
}

function onCopy() {
  navigator.clipboard.writeText(extractPlainText());
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function onRegenerate() {
  if (!props.message?.sessionId) return;
  chatStore.retryLast(props.message.sessionId);
}
</script>

<template>
  <div class="flex gap-2.5 mb-5 items-start group">
    <!-- Avatar -->
    <AgentAvatar :avatar="getAgentAvatar()" size="sm" />
    <!-- Bubble column -->
    <div class="flex flex-col min-w-0 flex-1">
      <!-- Name + time row -->
      <div v-if="showTimestamp !== false" class="flex items-center gap-1.5 mb-1">
        <span class="text-xs font-medium text-foreground">{{ getAgentName() }}</span>
        <span v-if="message?.createdAt" class="text-xs text-muted-foreground">{{
          formatMessageTime(message.createdAt)
        }}</span>
      </div>
      <!-- Content blocks -->
      <div class="bg-muted rounded-xl px-3 py-2">
        <template v-for="(block, idx) in parsedBlocks" :key="idx">
          <!-- Content -->
          <div
            v-if="block.type === 'content'"
            class="prose prose-sm prose-invert max-w-none text-sm"
          >
            <NodeRenderer :content="getBlockContent(idx, block)" />
          </div>
          <!-- Reasoning -->
          <details v-else-if="block.type === 'reasoning_content'" class="my-1">
            <summary class="text-xs text-muted-foreground cursor-pointer">推理过程</summary>
            <div class="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
              {{ block.content }}
            </div>
          </details>
          <!-- Tool call -->
          <div
            v-else-if="block.type === 'tool_call'"
            class="flex items-center gap-2 my-1 text-xs text-muted-foreground"
          >
            <Icon
              :icon="
                block.status === 'loading'
                  ? 'lucide:loader-2'
                  : block.status === 'error'
                    ? 'lucide:x-circle'
                    : 'lucide:check-circle'
              "
              :class="block.status === 'loading' ? 'animate-spin' : ''"
              class="h-3.5 w-3.5"
            />
            <span class="font-medium">{{ block.tool_call?.name }}</span>
            <span class="truncate opacity-70">{{ formatToolInput(block.tool_call?.input) }}</span>
          </div>
          <!-- Error -->
          <div
            v-else-if="block.type === 'error'"
            class="my-1 p-2 bg-red-500/10 text-red-400 text-xs rounded"
          >
            {{ block.content }}
          </div>
          <!-- Image -->
          <img
            v-else-if="block.type === 'image' && block.image_data"
            :src="`data:${block.image_data.mimeType};base64,${block.image_data.data}`"
            class="my-1 max-w-full rounded"
          />
        </template>
      </div>
      <!-- Action bar -->
      <div class="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity pl-1">
        <button
          class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          @click="onCopy"
        >
          <Icon :icon="copied ? 'lucide:check' : 'lucide:copy'" class="h-3.5 w-3.5" />
          <span>{{ copied ? "已复制" : "复制" }}</span>
        </button>
        <button
          v-if="isLast && !isStreaming && !chatStore.isGenerating"
          class="text-xs text-muted-foreground hover:text-violet-500 flex items-center gap-1"
          @click="onRegenerate"
        >
          <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
          <span>重新生成</span>
        </button>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue
git commit -m "feat(chat): restructure ChatMessageAssistant with avatar, timestamp, actions"
```

---

### Task 5: Update ChatView to load userProfile

**Files:**

- Modify: `src/renderer/src/components/chat/ChatView.vue`

- [x] **Step 1: Add userProfile fetch to ChatView**

In `src/renderer/src/components/chat/ChatView.vue`, add `onMounted` to fetch user profile:

Add import:

```ts
import { computed, onMounted } from "vue";
```

Add in script setup after store declarations:

```ts
onMounted(() => {
  chatStore.fetchUserProfile();
});
```

- [x] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatView.vue
git commit -m "feat(chat): load userProfile in ChatView"
```

---

### Task 6: Auto-generated conversation titles (main process)

**Files:**

- Modify: `src/main/presenter/agentChatPresenterAdapter.ts`
- Test: `test/main/agentChat/titleGeneration.test.ts`

- [x] **Step 1: Write failing test for generateTitle**

```ts
// test/main/agentChat/titleGeneration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";

const mockSelect = vi.fn();
const mockGetInternalKey = vi.fn();
const mockGetPort = vi.fn();
const mockGatewayPresenter = {
  select: mockSelect,
  getInternalKey: mockGetInternalKey,
  getPort: mockGetPort,
} as any;

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => (name: string) => `mock-model-${name}`),
}));

// Need to set up DB before importing
const db = new Database(":memory:");
vi.mock("@/db", () => ({
  getDb: () => db,
}));

// Initialize schema
import { readFileSync } from "fs";
// Just create the tables we need manually
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0,
    session_kind TEXT NOT NULL DEFAULT 'regular',
    parent_session_id TEXT,
    subagent_meta_json TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    order_seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    is_context_edge INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    enabled INTEGER NOT NULL DEFAULT 1,
    protected INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    avatar_json TEXT,
    config_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS agent_session_configs (
    id TEXT PRIMARY KEY,
    capability_requirements TEXT NOT NULL DEFAULT '["chat"]',
    system_prompt TEXT,
    temperature REAL,
    context_length INTEGER,
    max_tokens INTEGER,
    thinking_budget INTEGER,
    summary_text TEXT,
    summary_cursor_seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

import { AgentChatPresenterAdapter } from "@/main/presenter/agentChatPresenterAdapter";
import * as sessionDao from "@/main/db/models/agentSessionDao";
import * as messageDao from "@/main/db/models/agentMessageDao";

describe("AgentChatPresenterAdapter — generateTitle", () => {
  let adapter: AgentChatPresenterAdapter;

  beforeEach(() => {
    db.exec("DELETE FROM agent_sessions");
    db.exec("DELETE FROM agent_messages");

    const mockEngine = {
      chat: vi.fn(),
      stopGeneration: vi.fn(),
      retryLastMessage: vi.fn(),
      answerQuestion: vi.fn(),
      getSessionState: vi.fn().mockReturnValue("idle"),
    };
    adapter = new AgentChatPresenterAdapter(mockEngine, mockGatewayPresenter);
    mockSelect.mockReturnValue({ matched: { chat: { groupName: "test-group" } }, missing: [] });
    mockGetInternalKey.mockReturnValue("test-key");
    mockGetPort.mockReturnValue(8787);
  });

  it("skips title generation when titleManuallyEdited is true", async () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "手动标题" });
    sessionDao.updateMetadata(db, "s1", { titleManuallyEdited: true });

    const { generateText } = await import("ai");
    await adapter["generateTitle"]("s1", "hello");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips title generation when titleGeneratedCount >= 3", async () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "新对话" });
    sessionDao.updateMetadata(db, "s1", { titleGeneratedCount: 3 });

    const { generateText } = await import("ai");
    await adapter["generateTitle"]("s1", "hello");
    expect(generateText).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test test/main/agentChat/titleGeneration.test.ts`
Expected: FAIL — `generateTitle` method doesn't exist on adapter

- [x] **Step 3: Add generateTitle to AgentChatPresenterAdapter**

Update constructor to accept `gatewayPresenter`:

```ts
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { GatewayPresenter } from "./gatewayPresenter"

export class AgentChatPresenterAdapter {
  constructor(
    private engine: AgentChatPresenter,
    private gatewayPresenter: GatewayPresenter,
  ) {}
```

Add the `generateTitle` method:

```ts
private async generateTitle(sessionId: string, content: string): Promise<void> {
  const db = getDb()
  const session = sessionDao.getSessionById(db, sessionId)
  if (!session) return

  const metadata = session.metadata ?? {}
  if (metadata.titleManuallyEdited) return
  if ((metadata.titleGeneratedCount ?? 0) >= 3) return

  // Collect user messages from DB + current content
  const existingMessages = messageDao
    .listBySession(db, sessionId)
    .filter((m) => m.role === "user")
    .map((m) => m.content)
  const allUserMessages = [...existingMessages, content].slice(0, 3)

  // Select model via capability
  const selectResult = this.gatewayPresenter.select(["chat"] as any)
  const groupName = selectResult.matched["chat"]?.groupName
  if (!groupName) return

  try {
    const provider = createAnthropic({
      apiKey: this.gatewayPresenter.getInternalKey(),
      baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}/v1/`,
    })
    const model = provider(groupName)

    const result = await generateText({
      model,
      prompt: `根据以下对话内容，生成一个简短的标题（不超过20字），只返回标题文本，不要加引号或其他格式：\n\n${allUserMessages.map((msg) => `用户：${msg}`).join("\n")}`,
      maxOutputTokens: 50,
      temperature: 0.7,
    })

    const newTitle = result.text.trim()
    if (newTitle) {
      sessionDao.updateTitle(db, sessionId, newTitle)
      metadata.titleGeneratedCount = (metadata.titleGeneratedCount ?? 0) + 1
      sessionDao.updateMetadata(db, sessionId, metadata)
      eventBus.sendToRenderer(SESSION_EVENTS.LIST_UPDATED, null)
    }
  } catch {
    // Silently ignore
  }
}
```

Update `chat()` to fire-and-forget generateTitle:

```ts
async chat(sessionId: string, content: string): Promise<void> {
  this.generateTitle(sessionId, content).catch(() => {})
  return this.engine.chat(sessionId, content)
}
```

- [x] **Step 4: Update adapter construction in presenter/index.ts**

In `src/main/presenter/index.ts`, update the adapter construction to pass `gatewayPresenter`:

```ts
this.agentChatPresenter = new AgentChatPresenterAdapter(
  this.agentChatEngine,
  this.gatewayPresenter,
);
```

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm test test/main/agentChat/titleGeneration.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/main/presenter/agentChatPresenterAdapter.ts src/main/presenter/index.ts test/main/agentChat/titleGeneration.test.ts
git commit -m "feat(chat): auto-generate conversation titles from first 3 user messages"
```

---

### Task 7: SessionList — mark titleManuallyEdited on rename

**Files:**

- Modify: `src/renderer/src/stores/agentSession.ts`
- Modify: `src/renderer/src/components/chat/SessionList.vue`
- Modify: `src/main/presenter/agentChatPresenterAdapter.ts`
- Modify: `src/shared/types/presenters/agentChat.presenter.d.ts`

- [x] **Step 1: Add updateSessionMetadata method to adapter**

In `src/main/presenter/agentChatPresenterAdapter.ts`, add:

```ts
async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
  const db = getDb()
  sessionDao.updateMetadata(db, sessionId, metadata as any)
}
```

- [x] **Step 2: Add method to IAgentChatPresenter interface**

In `src/shared/types/presenters/agentChat.presenter.d.ts`, add to the interface:

```ts
updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void>;
```

- [x] **Step 3: Update SessionList onRenameConfirm to set titleManuallyEdited**

In `src/renderer/src/components/chat/SessionList.vue`, in the `onRenameConfirm` function, after calling `sessionStore.updateTitle`, also call:

```ts
await chatPresenter.updateSessionMetadata(renaming.value, { titleManuallyEdited: true });
```

Where `chatPresenter` is already accessible via `usePresenter("agentChatPresenter")`.

- [x] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/main/presenter/agentChatPresenterAdapter.ts src/shared/types/presenters/agentChat.presenter.d.ts src/renderer/src/components/chat/SessionList.vue
git commit -m "feat(chat): mark titleManuallyEdited on manual session rename"
```

---

### Task 8: SettingsDialog — Profile tab

**Files:**

- Create: `src/renderer/src/components/settings/ProfileSettings.vue`
- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`

- [x] **Step 1: Create ProfileSettings.vue**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import AgentAvatar from "@/components/chat/AgentAvatar.vue";
import { useAgentChatStore } from "@/stores/agentChat";
import type { AgentAvatar as AgentAvatarType } from "@shared/types/agent";

const chatStore = useAgentChatStore();

const userName = ref("");
const avatarType = ref<"icon" | "monogram">("monogram");
const avatarIcon = ref("lucide:user");
const avatarColor = ref("#3b82f6");
const avatarText = ref("U");
const avatarBgColor = ref("#3b82f6");

const PRESET_ICONS = [
  "lucide:user",
  "lucide:smile",
  "lucide:code",
  "lucide:pen-line",
  "lucide:zap",
  "lucide:star",
  "lucide:heart",
  "lucide:shield",
];
const PRESET_COLORS = ["#3b82f6", "#a855f7", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

onMounted(() => {
  const profile = chatStore.userProfile;
  if (profile) {
    userName.value = profile.name ?? "";
    if (profile.avatar) {
      if (profile.avatar.kind === "lucide") {
        avatarType.value = "icon";
        avatarIcon.value = profile.avatar.icon;
        avatarColor.value = profile.avatar.color ?? "#3b82f6";
      } else {
        avatarType.value = "monogram";
        avatarText.value = profile.avatar.text;
        avatarBgColor.value = profile.avatar.backgroundColor ?? "#3b82f6";
      }
    }
  }
});

const currentAvatar = computed((): AgentAvatarType => {
  return avatarType.value === "icon"
    ? { kind: "lucide", icon: avatarIcon.value, color: avatarColor.value }
    : { kind: "monogram", text: avatarText.value || "U", backgroundColor: avatarBgColor.value };
});

async function onSave() {
  await chatStore.saveUserProfile({
    name: userName.value || undefined,
    avatar: currentAvatar.value,
  });
}
</script>

<template>
  <div class="space-y-6">
    <h3 class="text-sm font-medium">个人资料</h3>

    <!-- Avatar preview -->
    <div class="flex items-center gap-3">
      <AgentAvatar :avatar="currentAvatar" size="lg" />
      <span class="text-sm text-muted-foreground">预览</span>
    </div>

    <!-- Name -->
    <div>
      <label class="text-xs text-muted-foreground">名称</label>
      <input
        v-model="userName"
        class="w-full mt-1 px-3 py-1.5 bg-muted rounded-md text-sm text-foreground outline-none focus:ring-1 focus:ring-violet-500"
        placeholder="你的名字"
      />
    </div>

    <!-- Avatar type toggle -->
    <div class="flex gap-2">
      <button
        :class="
          avatarType === 'icon' ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground'
        "
        class="px-3 py-1 rounded-md text-xs"
        @click="avatarType = 'icon'"
      >
        图标
      </button>
      <button
        :class="
          avatarType === 'monogram' ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground'
        "
        class="px-3 py-1 rounded-md text-xs"
        @click="avatarType = 'monogram'"
      >
        文字
      </button>
    </div>

    <!-- Icon picker -->
    <template v-if="avatarType === 'icon'">
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="icon in PRESET_ICONS"
          :key="icon"
          :class="
            avatarIcon === icon
              ? 'bg-violet-500/20 ring-1 ring-violet-500'
              : 'bg-muted hover:bg-muted/80'
          "
          class="p-2 rounded-md flex items-center justify-center"
          @click="avatarIcon = icon"
        >
          <Icon :icon="icon" class="h-5 w-5" :style="{ color: avatarColor }" />
        </button>
      </div>
      <div class="flex gap-2">
        <button
          v-for="color in PRESET_COLORS"
          :key="color"
          :class="
            avatarColor === color
              ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
              : ''
          "
          class="w-6 h-6 rounded-full"
          :style="{ backgroundColor: color }"
          @click="avatarColor = color"
        />
      </div>
    </template>

    <!-- Monogram picker -->
    <template v-if="avatarType === 'monogram'">
      <div class="flex items-center gap-3">
        <input
          v-model="avatarText"
          class="w-16 px-3 py-1.5 bg-muted rounded-md text-sm text-foreground outline-none focus:ring-1 focus:ring-violet-500"
          maxlength="2"
          placeholder="AB"
        />
        <div class="flex gap-2">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            :class="
              avatarBgColor === color
                ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : ''
            "
            class="w-6 h-6 rounded-full"
            :style="{ backgroundColor: color }"
            @click="avatarBgColor = color"
          />
        </div>
      </div>
    </template>

    <!-- Save -->
    <button
      class="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-md"
      @click="onSave"
    >
      保存
    </button>
  </div>
</template>
```

- [x] **Step 2: Add Profile tab to SettingsDialog.vue**

In `src/renderer/src/components/settings/SettingsDialog.vue`, add the profile nav item and content:

```ts
import ProfileSettings from "./ProfileSettings.vue";
```

Add "个人资料" to the nav list alongside "网关", and conditionally render `<ProfileSettings />` when that tab is selected.

- [x] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/components/settings/ProfileSettings.vue src/renderer/src/components/settings/SettingsDialog.vue
git commit -m "feat(chat): add user profile settings tab with avatar picker"
```

---

### Task 9: Full integration test + lint + format

**Files:**

- Modify: `test/renderer/components/ChatMessageUser.test.ts` (create if needed)
- All modified files

- [x] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All existing tests pass + new tests pass

- [x] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: Run lint + format**

Run: `pnpm run lint && pnpm run format`
Expected: PASS

- [x] **Step 4: Fix any issues found**

Fix lint/type errors if any, then re-run until clean.

- [x] **Step 5: Final commit**

```bash
git add -A
git commit -m "test(chat): integration tests and lint fixes for chat UX optimization"
```
