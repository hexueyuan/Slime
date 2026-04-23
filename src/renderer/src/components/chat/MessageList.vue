<template>
  <div ref="scrollContainer" class="flex-1 overflow-y-auto" @scroll="onScroll">
    <div class="mx-auto w-full space-y-1 px-6 pt-14 pb-44">
      <template v-for="msg in messages" :key="msg.id">
        <MessageItemUser v-if="msg.role === 'user'" :message="msg" />
        <MessageItemAssistant
          v-else-if="msg.role === 'assistant'"
          :message="msg"
          :streaming-blocks="msg.id === currentStreamMessageId ? streamingBlocks : undefined"
          :selected-tool-call-id="selectedToolCallId"
          @select-tool-call="$emit('select-tool-call', $event)"
        />
      </template>
      <!-- 流式消息（新消息还没有 record） -->
      <MessageItemAssistant
        v-if="currentStreamMessageId && !hasStreamMessageInList"
        :message="streamingPlaceholder"
        :streaming-blocks="streamingBlocks"
        :selected-tool-call-id="selectedToolCallId"
        @select-tool-call="$emit('select-tool-call', $event)"
      />
      <!-- 状态指示器 -->
      <GeneratingIndicator
        v-if="isGenerating && generatingPhaseText && phaseColor"
        :text="generatingPhaseText"
        :color="phaseColor"
        class="pl-3 pt-2"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from "vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";
import MessageItemUser from "@/components/message/MessageItemUser.vue";
import MessageItemAssistant from "@/components/message/MessageItemAssistant.vue";
import GeneratingIndicator from "./GeneratingIndicator.vue";

const props = defineProps<{
  messages: ChatMessageRecord[];
  streamingBlocks: AssistantMessageBlock[];
  currentStreamMessageId: string | null;
  isGenerating?: boolean;
  generatingPhaseText?: string;
  phaseColor?: string;
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
