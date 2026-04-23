<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-primary font-medium">{{ filePath }}</span>
      <span v-if="lineRange" class="text-muted-foreground">{{ lineRange }}</span>
    </div>
    <div class="max-h-96 overflow-y-auto rounded-md bg-muted/30 p-2">
      <div v-for="(line, i) in lines" :key="i" class="flex text-xs leading-6 font-mono">
        <span class="w-8 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">{{
          startLine + i
        }}</span>
        <span class="whitespace-pre-wrap break-all text-foreground/80">{{ line }}</span>
      </div>
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

const filePath = computed(() => parsedParams.value.path || "");
const startLine = computed(() => (parsedParams.value.offset || 0) + 1);

const lineRange = computed(() => {
  const p = parsedParams.value;
  if (p.offset != null || p.limit != null) {
    const start = (p.offset || 0) + 1;
    const end = p.limit ? start + p.limit - 1 : "...";
    return `行 ${start}-${end}`;
  }
  return "";
});

const fileContent = computed(() => {
  if (!props.response) return "";
  try {
    const parsed = JSON.parse(props.response);
    if (typeof parsed === "string") return parsed;
    if (parsed.content) return parsed.content;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return props.response;
  }
});

const lines = computed(() => fileContent.value.split("\n"));
</script>
