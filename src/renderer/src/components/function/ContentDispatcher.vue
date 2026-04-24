<template>
  <div class="h-full">
    <div
      v-if="!content"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无预览内容
    </div>
    <InteractionRenderer
      v-else-if="content.type === 'interaction'"
      :content="content"
      @submit="$emit('interaction-submit', $event)"
    />
    <MarkdownRenderer v-else-if="content.type === 'markdown'" :content="content" />
    <ProgressRenderer
      v-else-if="content.type === 'progress'"
      :content="content"
      @cancel="$emit('progress-cancel')"
    />
  </div>
</template>

<script setup lang="ts">
import type { FunctionContent } from "@shared/types/content";
import InteractionRenderer from "./renderers/InteractionRenderer.vue";
import MarkdownRenderer from "./renderers/MarkdownRenderer.vue";
import ProgressRenderer from "./renderers/ProgressRenderer.vue";

defineProps<{ content: FunctionContent | null }>();
defineEmits<{
  "interaction-submit": [result: { selected?: string | string[]; extra_input?: string }];
  "progress-cancel": [];
}>();
</script>
