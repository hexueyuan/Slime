<template>
  <div class="flex h-full flex-col gap-3 p-4">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-foreground">效果预览</span>
      <span v-if="content.title" data-testid="preview-title" class="text-xs text-muted-foreground">
        {{ content.title }}
      </span>
    </div>

    <div class="min-h-[200px] flex-1 overflow-hidden rounded-lg border border-border bg-white">
      <iframe class="h-full w-full border-none" sandbox="allow-scripts" :srcdoc="content.html" />
    </div>

    <div class="flex gap-2">
      <button
        data-testid="preview-confirm"
        class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        @click="$emit('confirm')"
      >
        {{ content.confirmLabel || "效果满意，开始进化" }}
      </button>
      <button
        data-testid="preview-adjust"
        class="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        @click="$emit('adjust')"
      >
        {{ content.adjustLabel || "我想调整一下" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PreviewContent } from "@shared/types/content";

defineProps<{ content: PreviewContent }>();
defineEmits<{ confirm: []; adjust: [] }>();
</script>
