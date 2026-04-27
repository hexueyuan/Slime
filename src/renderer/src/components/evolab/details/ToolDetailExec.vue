<template>
  <div class="space-y-3">
    <div>
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">命令</div>
      <div class="rounded-md border-l-3 border-primary bg-muted/30 px-3 py-2">
        <code class="text-xs text-foreground">{{ command }}</code>
      </div>
    </div>
    <div v-if="stdout">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
        输出 <span class="text-muted-foreground/50">stdout</span>
      </div>
      <pre
        class="max-h-80 overflow-y-auto rounded-md bg-muted/30 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-foreground/80"
        >{{ stdout }}</pre
      >
    </div>
    <div v-if="stderr">
      <div class="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
        错误 <span class="text-destructive/70">stderr</span>
      </div>
      <pre
        class="max-h-40 overflow-y-auto rounded-md bg-destructive/5 p-2 text-xs leading-5 whitespace-pre-wrap break-all text-destructive/80"
        >{{ stderr }}</pre
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

const parsedParams = computed(() => {
  try {
    return JSON.parse(props.params);
  } catch {
    return {};
  }
});

const parsedResponse = computed(() => {
  if (!props.response) return null;
  try {
    return JSON.parse(props.response);
  } catch {
    return null;
  }
});

const command = computed(() => parsedParams.value.command || "");

const stdout = computed(() => {
  if (!parsedResponse.value) return props.response || "";
  return parsedResponse.value.stdout || "";
});

const stderr = computed(() => parsedResponse.value?.stderr || "");
</script>
