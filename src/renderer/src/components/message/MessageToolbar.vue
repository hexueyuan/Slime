<template>
  <div
    v-if="!disabled"
    class="flex items-center gap-1 h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <button
      data-testid="toolbar-copy"
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors"
      title="复制"
      @click="$emit('copy')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
    <button
      v-if="isAssistant"
      data-testid="toolbar-retry"
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors"
      title="重试"
      @click="$emit('retry')"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isAssistant: boolean;
  disabled?: boolean;
}>();

defineEmits<{
  copy: [];
  retry: [];
}>();
</script>
