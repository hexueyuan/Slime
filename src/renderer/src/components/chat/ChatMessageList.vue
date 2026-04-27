<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from "vue";
import ChatMessageUser from "./ChatMessageUser.vue";
import ChatMessageAssistant from "./ChatMessageAssistant.vue";
import { useAgentChatStore } from "@/stores/agentChat";

const chatStore = useAgentChatStore();
const scrollContainer = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
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
    <template v-for="msg in chatStore.messages" :key="msg.id">
      <ChatMessageUser v-if="msg.role === 'user'" :message="msg" />
      <ChatMessageAssistant v-else-if="msg.role === 'assistant'" :message="msg" />
    </template>

    <!-- Streaming blocks (current generation) -->
    <div v-if="chatStore.streamingBlocks.length > 0" class="mb-4">
      <ChatMessageAssistant :blocks="chatStore.streamingBlocks" :is-streaming="true" />
    </div>

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
