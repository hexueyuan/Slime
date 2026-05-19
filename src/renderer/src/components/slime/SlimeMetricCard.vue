<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    meta?: string;
    tone?: "accent" | "warning" | "success" | "danger" | "blue" | "neutral";
  }>(),
  {
    meta: "",
    tone: "neutral",
  },
);

const colorMap = {
  accent: "var(--color-accent-brand-hover)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  danger: "var(--color-danger)",
  blue: "color-mix(in srgb, var(--color-success) 42%, var(--color-accent-brand-hover))",
  neutral: "var(--color-text-primary)",
};

const color = computed(() => colorMap[props.tone]);
</script>

<template>
  <article
    class="w-full min-w-0 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--metric-color)_24%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--metric-color)_10%,var(--color-control))] px-3 py-1.5"
    :style="{ '--metric-color': color }"
  >
    <div class="truncate text-[11px] font-medium text-[var(--color-text-muted)]">{{ label }}</div>
    <div class="mt-0.5 truncate text-base font-semibold leading-tight" :style="{ color }">
      {{ value }}
    </div>
    <div v-if="meta" class="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
      {{ meta }}
    </div>
  </article>
</template>
