<template>
  <div class="w-full">
    <button
      data-testid="reasoning-toggle"
      class="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
      @click="expanded = !expanded"
    >
      <svg
        v-if="isLoading"
        class="h-3.5 w-3.5 animate-pulse"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
      <svg
        v-else
        class="h-3.5 w-3.5 transition-transform"
        :class="{ 'rotate-90': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span>{{ headerText }}</span>
    </button>
    <div v-if="expanded" class="mt-2 pl-5">
      <div class="prose prose-sm dark:prose-invert max-w-none text-xs leading-4 text-white/50">
        <NodeRenderer
          :content="block.content || ''"
          :custom-id="`reasoning-${block.timestamp}`"
          :is-dark="true"
        />
      </div>
      <div v-if="isLoading" class="mt-1">
        <svg class="h-3 w-3 text-white/30 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import NodeRenderer from "markstream-vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const expanded = ref(false);

const isLoading = computed(() => props.block.status === "loading");

const durationSeconds = computed(() => {
  const rt = props.block.reasoning_time;
  if (!rt) return 0;
  const end = rt.end || Date.now();
  return ((end - rt.start) / 1000).toFixed(1);
});

const headerText = computed(() => {
  if (isLoading.value) return `正在思考... ${durationSeconds.value}秒`;
  return `已深度思考（用时 ${durationSeconds.value} 秒）`;
});
</script>
