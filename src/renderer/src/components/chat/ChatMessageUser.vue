<script setup lang="ts">
import type { ChatMessageRecord } from "@shared/types/agent";

defineProps<{
  message: ChatMessageRecord;
}>();
</script>

<template>
  <div class="mb-4 flex justify-end">
    <div class="max-w-[80%] rounded-lg bg-violet-600/20 px-3 py-2 text-sm text-foreground">
      <div class="whitespace-pre-wrap">{{ message.content }}</div>
    </div>
  </div>
</template>
