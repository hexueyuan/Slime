<template>
  <div class="space-y-3">
    <div>
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">参数</div>
      <pre
        class="rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80"
        >{{ formattedParams }}</pre
      >
    </div>
    <div v-if="response">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">响应</div>
      <pre
        class="max-h-80 overflow-y-auto rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80"
        >{{ formattedResponse }}</pre
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { BlockStatus } from "@shared/types/chat";

const props = defineProps<{
  params: string;
  response?: string;
  status: BlockStatus;
}>();

const formattedParams = computed(() => {
  try {
    return JSON.stringify(JSON.parse(props.params), null, 2);
  } catch {
    return props.params;
  }
});

const formattedResponse = computed(() => {
  if (!props.response) return "";
  try {
    return JSON.stringify(JSON.parse(props.response), null, 2);
  } catch {
    return props.response;
  }
});
</script>
