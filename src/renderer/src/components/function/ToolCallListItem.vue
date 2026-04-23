<template>
  <button
    data-testid="tool-list-item"
    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
    @click="$emit('select', block.id)"
  >
    <svg
      v-if="block.status === 'loading'"
      class="h-3.5 w-3.5 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
    <svg
      v-else-if="block.status === 'error'"
      class="h-3.5 w-3.5 shrink-0 text-destructive"
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
      class="h-3.5 w-3.5 shrink-0 text-green-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <span class="font-medium text-foreground">{{ block.tool_call?.name || "unknown" }}</span>
    <span class="truncate text-muted-foreground/70">{{ summary }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

defineEmits<{
  select: [id: string];
}>();

const summary = computed(() => {
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
