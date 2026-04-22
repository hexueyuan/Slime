<template>
  <div class="w-full max-w-3xl">
    <button
      data-testid="tool-call-toggle"
      class="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      @click="expanded = !expanded"
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
        class="ml-auto h-3 w-3 shrink-0 transition-transform"
        :class="{ 'rotate-90': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
    <div v-if="expanded" class="mt-1.5 space-y-1.5 pl-3">
      <div v-if="block.tool_call?.params" class="rounded-md border border-border bg-muted/30 p-2">
        <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">参数</div>
        <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{
          formattedParams
        }}</pre>
      </div>
      <div v-if="block.tool_call?.response" class="rounded-md border border-border bg-muted/30 p-2">
        <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">响应</div>
        <pre class="text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80">{{
          formattedResponse
        }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const expanded = ref(false);

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
