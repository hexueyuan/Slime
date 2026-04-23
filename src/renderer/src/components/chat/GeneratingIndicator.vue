<template>
  <div class="flex items-center gap-1.5">
    <span
      data-testid="spinner"
      class="spinner"
      :style="{ borderTopColor: color, borderColor: fadedColor }"
    />
    <span class="text-xs" :style="{ color }">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  color: string;
}>();

const fadedColor = computed(() => {
  // 将 hsl 颜色转为 20% 透明度版本
  const match = props.color.match(/hsl\(([^)]+)\)/);
  if (match) {
    return `hsl(${match[1]} / 0.2)`;
  }
  return props.color;
});
</script>

<style scoped>
.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
