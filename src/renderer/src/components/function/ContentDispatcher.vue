<template>
  <div class="h-full">
    <div
      v-if="!content"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无预览内容
    </div>
    <QuizRenderer
      v-else-if="content.type === 'quiz'"
      :content="content"
      @submit="$emit('quiz-submit', $event)"
    />
    <MarkdownRenderer v-else-if="content.type === 'markdown'" :content="content" />
    <ProgressRenderer
      v-else-if="content.type === 'progress'"
      :content="content"
      @cancel="$emit('progress-cancel')"
    />
    <PreviewRenderer
      v-else-if="content.type === 'preview'"
      :content="content"
      @confirm="$emit('preview-confirm')"
      @adjust="$emit('preview-adjust')"
    />
  </div>
</template>

<script setup lang="ts">
import type { FunctionContent } from "@shared/types/content";
import QuizRenderer from "./renderers/QuizRenderer.vue";
import MarkdownRenderer from "./renderers/MarkdownRenderer.vue";
import ProgressRenderer from "./renderers/ProgressRenderer.vue";
import PreviewRenderer from "./renderers/PreviewRenderer.vue";

defineProps<{ content: FunctionContent | null }>();
defineEmits<{
  "quiz-submit": [answers: Record<string, string | string[]>];
  "preview-confirm": [];
  "preview-adjust": [];
  "progress-cancel": [];
}>();
</script>
