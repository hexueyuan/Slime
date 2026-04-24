<template>
  <div class="flex flex-col items-center gap-4 p-8">
    <div class="text-3xl">
      <svg class="inline-block h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
    <h3 class="text-base font-semibold text-foreground">{{ content.stage }}</h3>
    <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        data-testid="progress-bar"
        class="h-full rounded-full bg-primary transition-all duration-300"
        :style="{ width: `${content.percentage}%` }"
      />
    </div>
    <div class="flex items-center gap-2">
      <span class="text-2xl font-bold text-primary">{{ content.percentage }}%</span>
      <span class="text-sm text-muted-foreground">{{ content.label }}</span>
    </div>
    <button
      v-if="content.cancellable"
      data-testid="progress-cancel"
      class="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
      @click="$emit('cancel')"
    >
      取消
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ProgressContent } from "@shared/types/content";

defineProps<{ content: ProgressContent }>();
defineEmits<{ cancel: [] }>();
</script>
