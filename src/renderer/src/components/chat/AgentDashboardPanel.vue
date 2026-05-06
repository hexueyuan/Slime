<template>
  <div class="h-full w-full">
    <iframe
      v-if="renderedHtml"
      :srcdoc="renderedHtml"
      class="h-full w-full border-none"
      sandbox="allow-scripts"
    />
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      等待数据更新...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  template: string;
  data: Record<string, unknown>;
}>();

const renderedHtml = computed(() => {
  if (!props.template) return null;
  return props.template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = props.data[key];
    return val !== undefined ? String(val) : "";
  });
});
</script>
