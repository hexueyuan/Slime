<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

onMounted(() => {
  chatStore.fetchUserProfile();
});

const session = computed(() => sessionStore.activeSession);
const agent = computed(() => {
  if (!session.value) return null;
  return agentStore.agents.find((a) => a.id === session.value!.agentId) ?? null;
});

async function onSend(content: string) {
  if (!session.value) return;
  messageListRef.value?.scrollToBottom(true);
  await chatStore.sendMessage(session.value.id, content);
}

function onStop() {
  if (!session.value) return;
  chatStore.stopGeneration(session.value.id);
}
</script>

<template>
  <div v-if="session" class="relative flex h-full flex-col">
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
    <ChatMessageList ref="messageListRef" />

    <!-- Input -->
    <ChatInput
      :is-streaming="chatStore.isGenerating"
      :error="chatStore.error"
      @submit="onSend"
      @stop="onStop"
      @dismiss-error="chatStore.clearError()"
      @retry="chatStore.retryLast(session!.id)"
    />
  </div>
</template>
