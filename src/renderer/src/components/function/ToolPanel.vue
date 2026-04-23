<template>
  <div class="flex h-full flex-col p-4">
    <div
      v-if="blocks.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无工具调用
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";

defineProps<{
  blocks: AssistantMessageBlock[];
  selectedId?: string | null;
}>();

defineEmits<{
  select: [id: string];
  back: [];
}>();
</script>
