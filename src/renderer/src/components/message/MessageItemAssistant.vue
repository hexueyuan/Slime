<template>
  <div class="group flex flex-col pt-5 pl-4 pr-11 gap-1.5 w-full">
    <template v-for="block in displayBlocks" :key="block.timestamp">
      <MessageBlockReasoning v-if="block.type === 'reasoning_content'" :block="block" />
      <MessageBlockContent
        v-else-if="block.type === 'content'"
        :content="block.content || ''"
        :block-id="`${message.id}-${block.timestamp}`"
      />
      <MessageBlockToolCall v-else-if="block.type === 'tool_call'" :block="block" />
      <MessageBlockError v-else-if="block.type === 'error'" :block="block" />
      <MessageBlockImage v-else-if="block.type === 'image'" :block="block" />
    </template>
    <MessageToolbar :is-assistant="true" @copy="onCopy" @retry="$emit('retry')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageRecord, AssistantMessageBlock } from "@shared/types/chat";
import MessageBlockContent from "./MessageBlockContent.vue";
import MessageBlockReasoning from "./MessageBlockReasoning.vue";
import MessageBlockToolCall from "./MessageBlockToolCall.vue";
import MessageBlockError from "./MessageBlockError.vue";
import MessageBlockImage from "./MessageBlockImage.vue";
import MessageToolbar from "./MessageToolbar.vue";

const props = defineProps<{
  message: ChatMessageRecord;
  streamingBlocks?: AssistantMessageBlock[];
}>();

defineEmits<{
  retry: [];
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

function onCopy() {
  const text = displayBlocks.value
    .filter((b) => b.type === "content")
    .map((b) => b.content || "")
    .join("\n");
  navigator.clipboard.writeText(text).catch(() => {});
}
</script>
