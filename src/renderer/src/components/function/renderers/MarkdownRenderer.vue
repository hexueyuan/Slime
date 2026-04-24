<template>
  <div class="flex h-full flex-col overflow-auto p-4">
    <div
      v-if="content.title"
      data-testid="md-title"
      class="mb-3 border-b border-border pb-2 text-xs text-muted-foreground"
    >
      {{ content.title }}
    </div>
    <div class="prose prose-sm dark:prose-invert w-full max-w-none">
      <NodeRenderer :content="content.content" :custom-id="'content-md'" :is-dark="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MarkdownContent } from "@shared/types/content";
import NodeRenderer from "markstream-vue";

defineProps<{ content: MarkdownContent }>();
</script>
