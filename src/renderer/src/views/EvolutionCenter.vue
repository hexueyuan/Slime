<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import WorkspaceSetup from "../components/workspace/WorkspaceSetup.vue";
import EvolutionStatusBar from "../components/evolution/EvolutionStatusBar.vue";
import CyberClock from "../components/clock/CyberClock.vue";
import { useSplitPane } from "../composables/useSplitPane";
import { usePresenter } from "@/composables/usePresenter";
import { useMessageStore } from "@/stores/chat";
import { useContentStore, setupContentIpc } from "@/stores/content";
import { useEvolutionStore, setupEvolutionIpc } from "@/stores/evolution";
import { useSessionStore } from "@/stores/session";
import type { AssistantMessageBlock } from "@shared/types/chat";

// Sidebar active view
const activeView = ref<"evolution" | "clock">("evolution");

// Workspace init check
const workspacePresenter = usePresenter("workspacePresenter");
const needsWorkspaceInit = ref<boolean | null>(null);

onMounted(async () => {
  needsWorkspaceInit.value = await workspacePresenter.needsInit();
});

function onWorkspaceReady() {
  needsWorkspaceInit.value = false;
}

const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.65,
  minLeftPx: 280,
  minRightPx: 320,
});

const messageStore = useMessageStore();
const activeTab = ref<"tools" | "preview" | "history">("tools");
const selectedToolCallId = ref<string | null>(null);

const contentStore = useContentStore();
const cleanupContentIpc = setupContentIpc(contentStore);
onUnmounted(cleanupContentIpc);

const evolutionStore = useEvolutionStore();
setupEvolutionIpc(evolutionStore);

const sessionStore = useSessionStore();

// Check for pending recovery
onMounted(async () => {
  const recovery = (await window.electron.ipcRenderer.invoke("recovery:check")) as {
    stage: string;
    description: string;
    sessionId: string;
  } | null;
  if (recovery && recovery.stage !== "idle") {
    evolutionStore.setRecovery(recovery);
  }
});

async function onRecoveryContinue() {
  const recovery = evolutionStore.recoveryContext;
  if (!recovery) return;
  if (recovery.sessionId) {
    sessionStore.setActiveSession(recovery.sessionId);
  }
  evolutionStore.setRecovery(null);
  await window.electron.ipcRenderer.invoke("recovery:continue", recovery.sessionId);
}

async function onRecoveryAbandon() {
  evolutionStore.setRecovery(null);
  await window.electron.ipcRenderer.invoke("recovery:abandon");
}

watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = "preview";
  },
);

const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const all: AssistantMessageBlock[] = [];
  for (const id of messageStore.messageIds) {
    const msg = messageStore.getMessage(id);
    if (msg?.role === "assistant") {
      try {
        const blocks: AssistantMessageBlock[] = JSON.parse(msg.content);
        for (const b of blocks) {
          if (b.type === "tool_call") all.push(b);
        }
      } catch {
        /* ignore */
      }
    }
  }
  // 追加流式中的工具调用
  for (const b of messageStore.streamingBlocks) {
    if (b.type === "tool_call") all.push(b);
  }
  return all;
});

function onSelectToolCall(id: string | null) {
  if (id) {
    selectedToolCallId.value = id;
    activeTab.value = "tools";
  } else {
    selectedToolCallId.value = null;
  }
}
</script>

<template>
  <!-- Loading -->
  <div
    v-if="needsWorkspaceInit === null"
    class="flex h-full items-center justify-center bg-background"
  >
    <div class="text-muted-foreground">加载中...</div>
  </div>

  <!-- Workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" @ready="onWorkspaceReady" />

  <!-- Main layout -->
  <div v-else class="flex h-full flex-col bg-sidebar">
    <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
    <div class="flex min-h-0 flex-1">
      <AppSidebar v-model:active-view="activeView" />
      <div
        ref="mainRef"
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
      >
        <!-- Clock view: full-screen cyberpunk clock -->
        <CyberClock v-if="activeView === 'clock'" />

        <!-- Evolution view: chat + function panel -->
        <template v-else>
          <EvolutionStatusBar />
          <!-- Recovery banner -->
          <div
            v-if="evolutionStore.recoveryContext"
            class="mx-4 mt-2 flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3"
          >
            <div class="text-sm">
              <span class="text-violet-400">检测到未完成的进化任务：</span>
              <span class="text-foreground"
                >「{{ evolutionStore.recoveryContext.description }}」</span
              >
              <span class="ml-2 text-muted-foreground"
                >({{ evolutionStore.recoveryContext.stage }})</span
              >
            </div>
            <div class="flex gap-2">
              <button
                class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
                @click="onRecoveryContinue"
              >
                继续进化
              </button>
              <button
                class="rounded px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                @click="onRecoveryAbandon"
              >
                放弃并回滚
              </button>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 overflow-hidden">
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
        </template>
      </div>
    </div>
  </div>
</template>
