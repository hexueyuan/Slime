<template>
  <div data-testid="tool-detail" class="flex h-full flex-col">
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <button
        data-testid="tool-detail-back"
        class="text-muted-foreground hover:text-foreground transition-colors"
        @click="$emit('back')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span class="text-xs font-medium">{{ block.tool_call?.name || "unknown" }}</span>
    </div>
    <div class="flex-1 overflow-y-auto p-3">
      <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{
        formattedParams
      }}</pre>
      <pre
        v-if="block.tool_call?.response"
        class="mt-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80"
        >{{ formattedResponse }}</pre
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

defineEmits<{
  back: [];
}>();

const formattedParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.params || "{}"), null, 2);
  } catch {
    return props.block.tool_call?.params || "";
  }
});

const formattedResponse = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.block.tool_call?.response || ""), null, 2);
  } catch {
    return props.block.tool_call?.response || "";
  }
});
</script>
