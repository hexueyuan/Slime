<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import SessionList from "../components/chat/SessionList.vue";
import NewThread from "../components/chat/NewThread.vue";
import ChatView from "../components/chat/ChatView.vue";
import ChatFunctionPanel from "../components/chat/ChatFunctionPanel.vue";
import AgentEditDialog from "../components/chat/AgentEditDialog.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import { useContentStore } from "@/stores/content";
import { setupAgentChatIpc } from "@/stores/agentChatIpc";
import { AGENT_EVENTS, SESSION_EVENTS } from "@shared/events";
import type { AssistantMessageBlock, BlockStatus } from "@shared/types/chat";

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();
const contentStore = useContentStore();

// Agent edit dialog
const agentEditOpen = ref(false);
const agentEditId = ref<string | undefined>(undefined);

function openAgentEdit(agentId?: string) {
  agentEditId.value = agentId;
  agentEditOpen.value = true;
}

// IPC event listeners
const cleanupChatIpc = setupAgentChatIpc(chatStore, () => sessionStore.activeSessionId);

const cleanupAgentChanged = window.electron.ipcRenderer.on(AGENT_EVENTS.CHANGED, () => {
  agentStore.fetchAgents();
});

const cleanupSessionUpdated = window.electron.ipcRenderer.on(SESSION_EVENTS.LIST_UPDATED, () => {
  sessionStore.fetchSessions();
});

onUnmounted(() => {
  cleanupChatIpc();
  cleanupAgentChanged();
  cleanupSessionUpdated();
});

onMounted(async () => {
  await Promise.all([agentStore.fetchAgents(), sessionStore.fetchSessions()]);
});

// Session select
function onSessionSelect(id: string) {
  sessionStore.setActiveSession(id);
  chatStore.fetchMessages(id);
}

// Split pane — 右侧固定宽度，左侧 flex-1 自动填满
const mainRef = ref<HTMLElement | null>(null);
const DEFAULT_RIGHT_WIDTH = 320;
const MIN_RIGHT_WIDTH = 200;
const MAX_RIGHT_WIDTH = 600;
const rightWidth = ref(DEFAULT_RIGHT_WIDTH);

let startX = 0;
let startWidth = 0;

function onMouseMove(e: MouseEvent) {
  const delta = startX - e.clientX;
  rightWidth.value = Math.min(Math.max(startWidth + delta, MIN_RIGHT_WIDTH), MAX_RIGHT_WIDTH);
}

function onMouseUp() {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function onMouseDown(e: MouseEvent) {
  startX = e.clientX;
  startWidth = rightWidth.value;
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function resetToDefault() {
  rightWidth.value = DEFAULT_RIGHT_WIDTH;
}

onUnmounted(() => {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});

// Function panel state
const activeTab = ref<"tools" | "preview">("tools");
const selectedToolCallId = ref<string | null>(null);
const thoughtChainBlocks = ref<import("@shared/types/agent").AssistantMessageBlock[] | null>(null);

// Reset state on session change
watch(
  () => sessionStore.activeSessionId,
  () => {
    selectedToolCallId.value = null;
    thoughtChainBlocks.value = null;
  },
);

function onShowThoughtChain() {
  thoughtChainBlocks.value = chatStore.streamingBlocks;
  activeTab.value = "preview";
}

// Auto-switch to preview when content arrives
watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = "preview";
  },
);

// Aggregate tool call blocks from all messages + streaming（转换为 chat 类型供 ToolPanel 使用）
const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const all: AssistantMessageBlock[] = [];

  function convertBlock(
    b: import("@shared/types/agent").AssistantMessageBlock,
  ): AssistantMessageBlock | null {
    if (b.type !== "tool_call" || !b.tool_call) return null;
    return {
      id: b.id,
      type: "tool_call",
      status: (b.status === "pending" ? "loading" : b.status) as BlockStatus,
      timestamp: b.timestamp,
      tool_call: {
        name: b.tool_call.name,
        params: JSON.stringify(b.tool_call.input ?? {}),
        response: b.tool_call.output != null ? JSON.stringify(b.tool_call.output) : undefined,
      },
    };
  }

  for (const msg of chatStore.messages) {
    if (msg.role === "assistant") {
      try {
        const blocks = JSON.parse(
          msg.content,
        ) as import("@shared/types/agent").AssistantMessageBlock[];
        for (const b of blocks) {
          const converted = convertBlock(b);
          if (converted) all.push(converted);
        }
      } catch {
        /* ignore */
      }
    }
  }
  for (const b of chatStore.streamingBlocks) {
    const converted = convertBlock(b);
    if (converted) all.push(converted);
  }
  return all;
});

function onSelectToolCall(id: string | null) {
  selectedToolCallId.value = id;
  if (id) activeTab.value = "tools";
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <SessionList @select="onSessionSelect" />
    </div>

    <!-- Center + Right: Split pane area -->
    <div ref="mainRef" class="flex min-w-0 flex-1 overflow-hidden">
      <!-- Center: Chat area -->
      <div class="min-w-0 flex-1 overflow-hidden">
        <NewThread v-if="!sessionStore.activeSessionId" />
        <ChatView
          v-else
          :selected-tool-call-id="selectedToolCallId"
          @open-agent-edit="openAgentEdit($event)"
          @select-tool-call="onSelectToolCall"
          @show-thought-chain="onShowThoughtChain"
        />
      </div>

      <!-- Divider -->
      <div
        class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
        @mousedown="onMouseDown"
        @dblclick="resetToDefault"
      >
        <div class="absolute inset-y-0 -left-1 -right-1" />
      </div>

      <!-- Right: Function panel -->
      <div class="w-[320px] shrink-0 overflow-hidden" :style="{ width: rightWidth + 'px' }">
        <ChatFunctionPanel
          :active-tab="activeTab"
          :tool-call-blocks="toolCallBlocks"
          :selected-tool-call-id="selectedToolCallId"
          :thought-chain-blocks="thoughtChainBlocks"
          @update:active-tab="activeTab = $event"
          @select-tool-call="onSelectToolCall"
        />
      </div>
    </div>

    <!-- Agent edit dialog -->
    <AgentEditDialog
      v-model:open="agentEditOpen"
      :agent-id="agentEditId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
