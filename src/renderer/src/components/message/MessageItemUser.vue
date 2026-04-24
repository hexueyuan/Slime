<template>
  <div class="group flex flex-row-reverse pt-5 pl-11 gap-2">
    <div class="bg-muted/50 rounded-md p-2 text-base leading-[1.5] whitespace-pre-wrap break-all">
      {{ parsedContent.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageRecord, UserMessageContent } from "@shared/types/chat";

const props = defineProps<{
  message: ChatMessageRecord;
}>();

const parsedContent = computed<UserMessageContent>(() => {
  try {
    return JSON.parse(props.message.content);
  } catch {
    return { text: props.message.content, files: [] };
  }
});
</script>
