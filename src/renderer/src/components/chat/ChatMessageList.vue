<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from "vue";
import ChatMessageUser from "./ChatMessageUser.vue";
import ChatMessageAssistant from "./ChatMessageAssistant.vue";
import { useAgentChatStore } from "@/stores/agentChat";
import { useAgentSessionStore } from "@/stores/agentSession";

const chatStore = useAgentChatStore();
const sessionStore = useAgentSessionStore();
const scrollContainer = ref<HTMLElement | null>(null);

const activeAgentId = computed(() => sessionStore.activeSession?.agentId);

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
}

function shouldShowTimestamp(messages: { role: string; createdAt: number }[], index: number) {
  if (index === 0) return true;
  const curr = messages[index];
  const prev = messages[index - 1];
  if (curr.role !== prev.role) return true;
  return curr.createdAt - prev.createdAt > 5 * 60 * 1000;
}

function isLastMessage(messages: unknown[], index: number) {
  return index === messages.length - 1;
}

watch(
  () => [chatStore.messages.length, chatStore.streamingBlocks.length],
  () => scrollToBottom(),
);

onMounted(scrollToBottom);
</script>

<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto px-4 py-4">
    <!-- History messages -->
    <template v-for="(msg, idx) in chatStore.messages" :key="msg.id">
      <ChatMessageUser
        v-if="msg.role === 'user'"
        :message="msg"
        :show-timestamp="shouldShowTimestamp(chatStore.messages, idx)"
      />
      <ChatMessageAssistant
        v-else-if="msg.role === 'assistant'"
        :message="msg"
        :agent-id="activeAgentId ?? undefined"
        :show-timestamp="shouldShowTimestamp(chatStore.messages, idx)"
        :is-last="isLastMessage(chatStore.messages, idx)"
      />
    </template>

    <!-- Streaming blocks (current generation) -->
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
      class="flex items-center gap-2 px-2 py-3"
    >
      <div class="flex gap-1">
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 0ms"
        />
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 150ms"
        />
        <span
          class="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
          style="animation-delay: 300ms"
        />
      </div>
      <span class="text-xs text-muted-foreground">思考中...</span>
    </div>
  </div>
</template>
