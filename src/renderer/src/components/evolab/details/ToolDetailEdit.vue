<template>
  <div class="space-y-2">
    <div class="text-xs text-primary font-medium">{{ filePath }}</div>
    <div class="max-h-96 overflow-y-auto rounded-md bg-muted/30 p-2 font-mono text-xs leading-6">
      <div
        v-for="(line, i) in diffLines"
        :key="i"
        class="flex"
        :class="{
          'bg-destructive/10 border-l-3 border-destructive': line.type === 'remove',
          'bg-green-500/10 border-l-3 border-green-500': line.type === 'add',
        }"
      >
        <span
          class="w-6 shrink-0 text-center select-none"
          :class="{
            'text-destructive': line.type === 'remove',
            'text-green-500': line.type === 'add',
            'text-muted-foreground/30': line.type === 'context',
          }"
          >{{ line.type === "remove" ? "-" : line.type === "add" ? "+" : " " }}</span
        >
        <span
          class="whitespace-pre-wrap break-all pl-2"
          :class="{
            'text-destructive/80': line.type === 'remove',
            'text-green-600': line.type === 'add',
            'text-foreground/60': line.type === 'context',
          }"
          >{{ line.text }}</span
        >
      </div>
    </div>
    <div v-if="responseText" class="text-xs text-muted-foreground">{{ responseText }}</div>
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

interface DiffLine {
  type: "remove" | "add" | "context";
  text: string;
}

const diffLines = computed<DiffLine[]>(() => {
  const oldText: string = parsedParams.value.old_text || "";
  const newText: string = parsedParams.value.new_text || "";
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];
  for (const line of oldLines) {
    result.push({ type: "remove", text: line });
  }
  for (const line of newLines) {
    result.push({ type: "add", text: line });
  }
  return result;
});

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
