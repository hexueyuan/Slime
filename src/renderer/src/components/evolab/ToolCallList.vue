<template>
  <div class="space-y-0.5">
    <ToolCallListItem
      v-for="block in blocks"
      :key="block.id || block.timestamp"
      :block="block"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { AssistantMessageBlock } from "@shared/types/chat";
import ToolCallListItem from "./ToolCallListItem.vue";

defineProps<{
  blocks: AssistantMessageBlock[];
}>();

defineEmits<{
  select: [id: string];
}>();
</script>
