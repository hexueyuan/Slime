<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 text-xs">
      <span class="text-primary font-medium">{{ filePath }}</span>
      <span class="text-green-500 text-[10px]">新建文件</span>
    </div>
    <div class="max-h-96 overflow-y-auto rounded-md border-l-3 border-green-500 bg-muted/30 p-2">
      <div v-for="(line, i) in lines" :key="i" class="flex text-xs leading-6 font-mono">
        <span class="w-8 shrink-0 text-right pr-3 text-muted-foreground/50 select-none">{{
          i + 1
        }}</span>
        <span class="whitespace-pre-wrap break-all text-foreground/80">{{ line }}</span>
      </div>
    </div>
    <div
      v-if="responseText"
      class="text-xs"
      :class="status === 'success' ? 'text-green-500' : 'text-destructive'"
    >
      {{ status === "success" ? "✓" : "✗" }} {{ responseText }}
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
const content = computed(() => parsedParams.value.content || "");
const lines = computed(() => content.value.split("\n"));

const responseText = computed(() => {
  if (!props.response) return "";
  try {
    const parsed = JSON.parse(props.response);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return props.response;
  }
});
</script>
