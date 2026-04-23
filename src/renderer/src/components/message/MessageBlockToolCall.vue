<template>
  <div class="w-full max-w-3xl">
    <button
      data-testid="tool-call-toggle"
      class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      :class="isSelected ? 'border-primary' : 'border-border'"
      @click="$emit('select-tool-call', block.id)"
    >
      <svg
        v-if="block.status === 'loading'"
        class="h-3.5 w-3.5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <svg
        v-else-if="block.status === 'error'"
        data-testid="tool-status-error"
        class="h-3.5 w-3.5 text-destructive"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
      <svg
        v-else
        data-testid="tool-status-success"
        class="h-3.5 w-3.5 text-green-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class="font-medium">{{ block.tool_call?.name || "unknown" }}</span>
      <span class="truncate text-muted-foreground/70">{{ paramsSummary }}</span>
      <svg
        class="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
  selectedToolCallId?: string | null;
}>();

defineEmits<{
  "select-tool-call": [id: string];
}>();

const isSelected = computed(() => props.selectedToolCallId === props.block.id);

const paramsSummary = computed(() => {
  try {
    const params = JSON.parse(props.block.tool_call?.params || "{}");
    const firstValue = Object.values(params)[0];
    if (typeof firstValue === "string") return firstValue.slice(0, 60);
    return JSON.stringify(firstValue).slice(0, 60);
  } catch {
    return "";
  }
});
</script>
