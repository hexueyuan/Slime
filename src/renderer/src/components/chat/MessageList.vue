<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto" @scroll="onScroll">
    <div class="mx-auto w-full space-y-1 px-6 pt-14 pb-44">
      <template v-for="msg in messages" :key="msg.id">
        <MessageItemUser v-if="msg.role === 'user' && !msg.hidden" :message="msg" />
        <MessageItemAssistant
          v-else-if="msg.role === 'assistant'"
          :message="msg"
          :streaming-blocks="msg.id === currentStreamMessageId ? streamingBlocks : undefined"
          :selected-tool-call-id="selectedToolCallId"
          :is-streaming="isGenerating"
          @select-tool-call="$emit('select-tool-call', $event)"
        />
      </template>
      <!-- 流式消息（新消息还没有 record） -->
      <MessageItemAssistant
        v-if="currentStreamMessageId && !hasStreamMessageInList"
        :message="streamingPlaceholder"
        :streaming-blocks="streamingBlocks"
        :selected-tool-call-id="selectedToolCallId"
        :is-streaming="isGenerating"
        @select-tool-call="$emit('select-tool-call', $event)"
      />
      <!-- 生成中细胞膜指示器 -->
      <div v-if="isGenerating" class="flex items-center gap-2 pl-4 pt-2 pb-1">
        <div
          class="relative flex shrink-0 items-center justify-center"
          style="width: 20px; height: 20px"
        >
          <div
            class="streaming-breathe absolute inset-0 rounded-full border border-violet-500/50"
          />
          <div
            class="streaming-breathe-inner absolute inset-[2px] rounded-full border border-violet-500/20"
          />
          <div class="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgb(139_92_246)]" />
        </div>
        <span class="text-xs text-violet-500/70">进化中...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from "vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";
import MessageItemUser from "@/components/message/MessageItemUser.vue";
import MessageItemAssistant from "@/components/message/MessageItemAssistant.vue";

const props = defineProps<{
  messages: ChatMessageRecord[];
  streamingBlocks: AssistantMessageBlock[];
  currentStreamMessageId: string | null;
  isGenerating?: boolean;
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "select-tool-call": [id: string];
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const isNearBottom = ref(true);
const NEAR_BOTTOM_THRESHOLD = 80;

const hasStreamMessageInList = computed(() => {
  if (!props.currentStreamMessageId) return false;
  return props.messages.some((m) => m.id === props.currentStreamMessageId);
});

const streamingPlaceholder = computed<ChatMessageRecord>(() => ({
  id: props.currentStreamMessageId || "streaming",
  sessionId: "",
  role: "assistant",
  content: "[]",
  status: "pending",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}));

function onScroll() {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const distFromBottom = scrollHeight - scrollTop - clientHeight;
  isNearBottom.value = distFromBottom < NEAR_BOTTOM_THRESHOLD;
}

function scrollToBottom(force = false) {
  if (!scrollContainer.value) return;
  if (!force && !isNearBottom.value) return;
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  });
}

// 新消息或流式更新时自动滚底
watch(
  () => [props.messages.length, props.streamingBlocks.length],
  () => {
    scrollToBottom();
  },
  { flush: "post" },
);

// 暴露 scrollToBottom 供父组件调用（发送消息时强制滚底）
defineExpose({ scrollToBottom });

onMounted(() => {
  scrollToBottom(true);
});
</script>

<style scoped>
@keyframes cell-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

.streaming-breathe {
  animation: cell-breathe 2.5s ease-in-out infinite;
}

.streaming-breathe-inner {
  animation: cell-breathe 2.5s ease-in-out infinite 0.3s;
}
</style>
