<template>
  <div
    class="flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs shadow-sm"
  >
    <svg
      class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
    <span class="max-w-[120px] truncate text-foreground">{{ file.name }}</span>
    <button
      data-testid="remove-file"
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      @click="$emit('remove', file.id)"
    >
      <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MessageFile } from "@shared/types/chat";

defineProps<{
  file: MessageFile;
}>();

defineEmits<{
  remove: [id: string];
}>();
</script>
