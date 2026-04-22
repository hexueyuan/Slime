<template>
  <div class="w-fit rounded-lg border border-border bg-card p-2">
    <div
      v-if="block.status === 'loading' && !imageSrc"
      class="flex h-32 w-48 items-center justify-center"
    >
      <svg
        class="h-5 w-5 animate-spin text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
    <img
      v-else-if="imageSrc"
      :src="imageSrc"
      class="max-w-[300px] rounded-md"
      alt="generated image"
    />
    <div v-else class="p-2 text-sm text-red-500">无法加载图片</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssistantMessageBlock } from "@shared/types/chat";

const props = defineProps<{
  block: AssistantMessageBlock;
}>();

const imageSrc = computed(() => {
  const data = props.block.image_data;
  if (!data?.data) return null;
  if (data.data.startsWith("data:")) return data.data;
  return `data:${data.mimeType || "image/png"};base64,${data.data}`;
});
</script>
