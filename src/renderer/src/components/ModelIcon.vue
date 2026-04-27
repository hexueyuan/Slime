<script setup lang="ts">
import { computed } from "vue";
import { getModelIconInfo } from "@/utils/modelIcon";

const props = withDefaults(
  defineProps<{
    modelName: string;
    size?: number;
  }>(),
  { size: 20 },
);

const info = computed(() => getModelIconInfo(props.modelName));
const iconSize = computed(() => Math.round(props.size * 0.6));
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
    :style="{ width: `${size}px`, height: `${size}px`, background: info.bg }"
  >
    <img
      v-if="info.svg"
      :src="info.svg"
      :width="iconSize"
      :height="iconSize"
      :alt="modelName"
      :style="{
        filter:
          info.color === '#fff'
            ? 'brightness(0) invert(1)'
            : info.color === '#000' || info.color === '#141413'
              ? 'brightness(0)'
              : 'none',
      }"
    />
    <span
      v-else
      :style="{ fontSize: `${Math.round(size * 0.38)}px`, lineHeight: 1, color: info.color }"
    >
      {{ info.initials }}
    </span>
  </span>
</template>
