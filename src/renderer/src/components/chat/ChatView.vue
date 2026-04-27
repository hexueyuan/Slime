<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import ChatMessageList from "./ChatMessageList.vue";
import ChatInput from "./ChatInput.vue";
import AgentAvatar from "./AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";

const emit = defineEmits<{
  openAgentEdit: [agentId: string];
}>();

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();

const session = computed(() => sessionStore.activeSession);
const agent = computed(() => {
  if (!session.value) return null;
  return agentStore.agents.find((a) => a.id === session.value!.agentId) ?? null;
});

async function onSend(content: string) {
  if (!session.value) return;
  await chatStore.sendMessage(session.value.id, content);
}

function onStop() {
  if (!session.value) return;
  chatStore.stopGeneration(session.value.id);
}
</script>

<template>
  <div v-if="session" class="flex h-full flex-col">
    <!-- Top bar -->
    <div class="flex items-center gap-2 border-b border-border px-4 py-2">
      <AgentAvatar v-if="agent" :avatar="agent.avatar" size="sm" />
      <div class="flex-1 truncate">
        <span class="text-sm font-medium text-foreground">{{ session.title }}</span>
        <span v-if="agent" class="ml-2 text-xs text-muted-foreground">{{ agent.name }}</span>
      </div>
      <button
        v-if="agent"
        class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Agent 设置"
        @click="emit('openAgentEdit', agent!.id)"
      >
        <Icon icon="lucide:settings" class="h-4 w-4" />
      </button>
    </div>

    <!-- Message list -->
    <ChatMessageList />

    <!-- Error banner -->
    <div
      v-if="chatStore.error"
      class="mx-4 mb-2 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
    >
      <Icon icon="lucide:alert-circle" class="h-3.5 w-3.5 shrink-0" />
      <span class="flex-1">{{ chatStore.error }}</span>
      <button
        class="rounded px-2 py-0.5 text-xs hover:bg-red-500/20"
        @click="chatStore.retryLast(session!.id)"
      >
        重试
      </button>
    </div>

    <!-- Input -->
    <div class="relative">
      <ChatInput :is-streaming="chatStore.isGenerating" @submit="onSend" @stop="onStop" />
    </div>
  </div>
</template>
