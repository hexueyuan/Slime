<template>
  <div class="flex h-full flex-col">
    <div
      v-if="blocks.length === 0"
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
    >
      暂无工具调用
    </div>
    <ToolCallDetail v-else-if="selectedBlock" :block="selectedBlock" @back="$emit('back')" />
    <div v-else class="flex-1 overflow-y-auto p-2">
      <ToolCallList :blocks="blocks" @select="$emit('select', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";
import ToolCallList from "./ToolCallList.vue";
import ToolCallDetail from "./ToolCallDetail.vue";

const props = defineProps<{
  blocks: AssistantMessageBlock[];
  selectedId?: string | null;
}>();

defineEmits<{
  select: [id: string];
  back: [];
}>();

const selectedBlock = computed(() => {
  if (!props.selectedId) return null;
  return props.blocks.find((b) => b.id === props.selectedId) || null;
});
</script>
