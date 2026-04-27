<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import SessionList from "../components/chat/SessionList.vue";
import NewThread from "../components/chat/NewThread.vue";
import ChatView from "../components/chat/ChatView.vue";
import AgentEditDialog from "../components/chat/AgentEditDialog.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import { setupAgentChatIpc } from "@/stores/agentChatIpc";
import { AGENT_EVENTS, SESSION_EVENTS } from "@shared/events";

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();

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

// Load messages when active session changes from SessionList click
// (NOT via watcher — that overwrites optimistic messages from sendMessage)
function onSessionSelect(id: string) {
  sessionStore.setActiveSession(id);
  chatStore.fetchMessages(id);
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <SessionList @select="onSessionSelect" />
    </div>
    <!-- Right: Content area -->
    <div class="flex min-w-0 flex-1 flex-col">
      <NewThread v-if="!sessionStore.activeSessionId" @open-agent-edit="openAgentEdit()" />
      <ChatView v-else @open-agent-edit="openAgentEdit($event)" />
    </div>

    <!-- Agent edit dialog -->
    <AgentEditDialog
      v-model:open="agentEditOpen"
      :agent-id="agentEditId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
