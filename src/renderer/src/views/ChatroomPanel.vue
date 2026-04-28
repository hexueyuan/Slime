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
import { useSplitPane } from "@/composables/useSplitPane";
import { AGENT_EVENTS, SESSION_EVENTS } from "@shared/events";
import type { AssistantMessageBlock } from "@shared/types/chat";

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

// Split pane（mainRef 绑在 center+right 的包裹 div 上）
const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.65,
  minLeftPx: 280,
  minRightPx: 320,
});

// Function panel state
const activeTab = ref<"tools" | "preview">("tools");
const selectedToolCallId = ref<string | null>(null);

// Auto-switch to preview when content arrives
watch(
  () => contentStore.content,
  (newContent) => {
    if (newContent) activeTab.value = "preview";
  },
);

// Aggregate tool call blocks from all messages + streaming
const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const all: AssistantMessageBlock[] = [];
  for (const msg of chatStore.messages) {
    if (msg.role === "assistant") {
      try {
        const blocks = JSON.parse(msg.content) as AssistantMessageBlock[];
        for (const b of blocks) {
          if (b.type === "tool_call") all.push(b);
        }
      } catch {
        /* ignore */
      }
    }
  }
  for (const b of chatStore.streamingBlocks) {
    if (b.type === "tool_call") all.push(b as unknown as AssistantMessageBlock);
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
      <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
        <NewThread v-if="!sessionStore.activeSessionId" @open-agent-edit="openAgentEdit()" />
        <ChatView
          v-else
          :selected-tool-call-id="selectedToolCallId"
          @open-agent-edit="openAgentEdit($event)"
          @select-tool-call="onSelectToolCall"
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
      <div class="min-w-[320px] flex-1 overflow-hidden">
        <ChatFunctionPanel
          :active-tab="activeTab"
          :tool-call-blocks="toolCallBlocks"
          :selected-tool-call-id="selectedToolCallId"
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
