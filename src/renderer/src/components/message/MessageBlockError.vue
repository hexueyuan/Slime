<template>
  <div
    v-if="block.status === 'cancel'"
    class="flex items-center gap-1.5 text-sm text-muted-foreground"
  >
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L3.34 4.74A9.75 9.75 0 0 0 3 12" />
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L20.66 19.26A9.75 9.75 0 0 0 21 12" />
    </svg>
    <span>{{ block.content || "已取消" }}</span>
  </div>
  <div v-else class="w-full rounded-md border-l-2 border-red-500 bg-red-500/5 px-3 py-2">
    <div class="text-xs font-medium text-red-500">请求失败</div>
    <div class="mt-1 text-xs text-red-400 break-all whitespace-pre-wrap leading-5">
      {{ block.content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";

defineProps<{
  block: AssistantMessageBlock;
}>();
</script>
