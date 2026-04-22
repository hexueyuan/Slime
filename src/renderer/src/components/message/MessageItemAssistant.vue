<template>
  <div class="flex flex-col pt-5 pl-4 pr-11 gap-1.5 w-full">
    <template v-for="block in displayBlocks" :key="block.timestamp">
      <MessageBlockContent
        v-if="block.type === 'content'"
        :content="block.content || ''"
        :block-id="`${message.id}-${block.timestamp}`"
      />
      <!-- 005c 将添加 reasoning/tool_call/error/image block 渲染 -->
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";
import MessageBlockContent from "./MessageBlockContent.vue";

const props = defineProps<{
  message: ChatMessageRecord;
  streamingBlocks?: AssistantMessageBlock[];
}>();

const parsedBlocks = computed<AssistantMessageBlock[]>(() => {
  try {
    return JSON.parse(props.message.content);
  } catch {
    return [];
  }
});

const displayBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.streamingBlocks && props.streamingBlocks.length > 0) {
    return props.streamingBlocks;
  }
  return parsedBlocks.value;
});
</script>
