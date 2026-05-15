<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import SlimeInput from "@/components/ui/SlimeInput.vue";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";

const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

// Rename
const renaming = ref<string | null>(null);
const renameInput = ref("");

function onRenameStart(sessionId: string) {
  const session = sessionStore.sessions.find((s) => s.id === sessionId);
  renaming.value = sessionId;
  renameInput.value = session?.title ?? "";
}

async function onRenameConfirm() {
  if (renaming.value && renameInput.value.trim()) {
    await sessionStore.updateTitle(renaming.value, renameInput.value.trim());
  }
  renaming.value = null;
}

// Edit workspace paths
const editingPaths = ref<string | null>(null);
const editPathsList = ref<string[]>([]);
const newPathInput = ref("");

function onEditPathsStart(sessionId: string) {
  const session = sessionStore.sessions.find((s) => s.id === sessionId);
  editingPaths.value = sessionId;
  editPathsList.value = [...(session?.workspacePaths ?? [])];
  newPathInput.value = "";
}

function addPath() {
  const p = newPathInput.value.trim();
  if (p && !editPathsList.value.includes(p)) {
    editPathsList.value.push(p);
  }
  newPathInput.value = "";
}

function removePath(p: string) {
  editPathsList.value = editPathsList.value.filter((x) => x !== p);
}

async function onEditPathsConfirm() {
  if (editingPaths.value) {
    await sessionStore.updateWorkspacePaths(editingPaths.value, editPathsList.value);
  }
  editingPaths.value = null;
}

// Context menu
const contextMenuSessionId = ref<string | null>(null);
const contextMenuPos = ref({ x: 0, y: 0 });
const showContextMenu = ref(false);

function onContextMenu(e: MouseEvent, sessionId: string) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuSessionId.value = sessionId;
  contextMenuPos.value = {
    x: Math.min(e.clientX, window.innerWidth - 160),
    y: Math.min(e.clientY, window.innerHeight - 100),
  };
  showContextMenu.value = true;
}

function closeContextMenu() {
  showContextMenu.value = false;
  contextMenuSessionId.value = null;
}

onMounted(() => document.addEventListener("click", closeContextMenu));
onUnmounted(() => document.removeEventListener("click", closeContextMenu));

async function onDelete() {
  if (contextMenuSessionId.value) {
    await sessionStore.deleteSession(contextMenuSessionId.value);
    chatStore.clearMessages();
  }
  closeContextMenu();
}

function onNewSession() {
  sessionStore.setActiveSession(null);
  chatStore.clearMessages();
}

function onSessionClick(sessionId: string) {
  if (editingPaths.value === sessionId) return;
  if (sessionStore.isDetached(sessionId)) {
    window.electron.ipcRenderer.invoke("group_chat:focus_detached", sessionId);
    return;
  }
  sessionStore.setActiveSession(sessionId);
  chatStore.fetchMessages(sessionId);
}

function onSessionDblclick(sessionId: string) {
  sessionStore.markDetached(sessionId);
  window.electron.ipcRenderer.invoke("group_chat:open_detached", sessionId);
}
</script>

<template>
  <div class="flex h-full flex-col text-[var(--color-text-secondary)]">
    <div class="flex items-center justify-between px-3 pb-2 pt-3">
      <span class="text-sm font-semibold text-[var(--color-text-primary)]">群聊</span>
      <SlimeIconButton icon="lucide:plus" title="新建群聊" size="sm" @click.stop="onNewSession" />
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-1">
      <div
        v-for="session in sessionStore.sessions"
        :key="session.id"
        :class="[
          'mb-1 cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors',
          session.id === sessionStore.activeSessionId && !sessionStore.isDetached(session.id)
            ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
        ]"
        @click="onSessionClick(session.id)"
        @dblclick="onSessionDblclick(session.id)"
        @contextmenu="onContextMenu($event, session.id)"
      >
        <!-- Rename mode -->
        <input
          v-if="renaming === session.id"
          v-model="renameInput"
          class="w-full rounded-[var(--radius-sm)] border border-[var(--color-accent-brand)] bg-transparent px-1 text-sm text-[var(--color-text-primary)] focus:outline-none"
          @blur="onRenameConfirm"
          @keydown.enter="onRenameConfirm"
          @keydown.escape="renaming = null"
          @click.stop
        />

        <!-- Edit workspace paths mode -->
        <div v-else-if="editingPaths === session.id" @click.stop>
          <div class="mb-1 text-xs font-medium text-[var(--color-text-primary)]">工作目录</div>
          <ul v-if="editPathsList.length > 0" class="mb-1.5 space-y-1">
            <li
              v-for="p in editPathsList"
              :key="p"
              class="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-control)] px-2 py-0.5 text-xs"
            >
              <span class="truncate font-mono text-[var(--color-text-primary)]">{{ p }}</span>
              <button
                class="ml-1 shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                @click.stop="removePath(p)"
              >
                ✕
              </button>
            </li>
          </ul>
          <p v-else class="mb-1.5 text-xs text-[var(--color-text-muted)]">暂无</p>
          <div class="flex gap-1">
            <SlimeInput
              v-model="newPathInput"
              placeholder="添加路径（支持 ~）"
              density="compact"
              @keydown.enter.stop="addPath"
              @click.stop
            />
            <SlimeButton size="sm" @click.stop="addPath"> + </SlimeButton>
          </div>
          <div class="mt-1.5 flex gap-1.5">
            <SlimeButton variant="primary" size="sm" @click.stop="onEditPathsConfirm">
              保存
            </SlimeButton>
            <SlimeButton variant="ghost" size="sm" @click.stop="editingPaths = null">
              取消
            </SlimeButton>
          </div>
        </div>

        <!-- Normal mode -->
        <template v-else>
          <div class="flex items-center gap-1">
            <Icon
              v-if="sessionStore.isDetached(session.id)"
              icon="lucide:external-link"
              class="h-3 w-3 shrink-0 text-[var(--color-accent-brand-hover)]"
            />
            <div class="truncate text-sm">{{ session.title }}</div>
          </div>
          <div class="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
            {{ formatTime(session.updatedAt) }}
          </div>
        </template>
      </div>

      <div
        v-if="sessionStore.sessions.length === 0"
        class="py-4 text-center text-xs text-[var(--color-text-muted)]"
      >
        暂无群聊
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="fixed z-50 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] py-1 shadow-[var(--shadow-floating)]"
        :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
        @click.stop
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-control-hover)]"
          @click="
            () => {
              if (contextMenuSessionId) {
                onRenameStart(contextMenuSessionId);
                closeContextMenu();
              }
            }
          "
        >
          <Icon icon="lucide:pencil" class="h-3 w-3" />
          重命名
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-control-hover)]"
          @click="
            () => {
              if (contextMenuSessionId) {
                onEditPathsStart(contextMenuSessionId);
                closeContextMenu();
              }
            }
          "
        >
          <Icon icon="lucide:folder" class="h-3 w-3" />
          编辑工作目录
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-control-hover)]"
          @click="onDelete"
        >
          <Icon icon="lucide:trash-2" class="h-3 w-3" />
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>
