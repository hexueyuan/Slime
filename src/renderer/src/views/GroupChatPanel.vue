<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import GroupSessionList from "../components/groupchat/GroupSessionList.vue";
import NewGroupThread from "../components/groupchat/NewGroupThread.vue";
import GroupChatView from "../components/groupchat/GroupChatView.vue";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";
import { useAgentStore } from "@/stores/agent";
import { setupGroupChatIpc } from "@/stores/groupChatIpc";
import { AGENT_EVENTS } from "@shared/events";

const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();
const agentStore = useAgentStore();

const cleanupGroupChatIpc = setupGroupChatIpc(
  chatStore,
  sessionStore,
  () => sessionStore.activeSessionId,
);

const cleanupAgentChanged = window.electron.ipcRenderer.on(AGENT_EVENTS.CHANGED, () => {
  agentStore.fetchAgents();
});

onMounted(async () => {
  await Promise.all([agentStore.fetchAgents(), sessionStore.fetchSessions()]);
  // Check if this is a detached window with a specific session
  const urlParams = new URLSearchParams(window.location.search);
  const detachedSessionId = urlParams.get("sessionId");
  if (urlParams.get("detached") === "1" && detachedSessionId) {
    sessionStore.setActiveSession(detachedSessionId);
    await chatStore.fetchMessages(detachedSessionId);
  }
});

onUnmounted(() => {
  cleanupGroupChatIpc();
  cleanupAgentChanged();
});
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Session list -->
    <div class="w-[220px] shrink-0 border-r border-border">
      <GroupSessionList />
    </div>

    <!-- Right: Content -->
    <div class="min-w-0 flex-1 overflow-hidden">
      <NewGroupThread v-if="!sessionStore.activeSessionId" />
      <GroupChatView v-else />
    </div>
  </div>
</template>
