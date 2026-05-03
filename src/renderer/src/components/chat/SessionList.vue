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
const _isArchivedExpandedManual = ref(false);
const isArchivedExpanded = computed({
  get() {
    if (searchQuery.value.trim() && filteredArchived.value.length > 0) return true;
    return (
      _isArchivedExpandedManual.value ||
      sessionStore.archivedSessions.some((s) => s.id === sessionStore.activeSessionId)
    );
  },
  set(val: boolean) {
    _isArchivedExpandedManual.value = val;
  },
});

function toggleArchive() {
  _isArchivedExpandedManual.value = !_isArchivedExpandedManual.value;
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
const chatPresenter = usePresenter("agentChatPresenter");

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
          @click.stop="onPin"
        >
          <Icon icon="lucide:pin" class="h-3 w-3" />
          置顶 / 取消置顶
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
          @click.stop="onRename"
        >
          <Icon icon="lucide:pencil" class="h-3 w-3" />
          重命名
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-muted"
          @click.stop="onDelete"
        >
          <Icon icon="lucide:trash-2" class="h-3 w-3" />
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>
