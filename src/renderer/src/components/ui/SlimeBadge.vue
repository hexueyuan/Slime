<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "neutral" | "accent" | "success" | "warning" | "danger";
  }>(),
  {
    variant: "neutral",
  },
);

const classes = computed(() => [
  "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
  props.variant === "neutral" &&
    "bg-[var(--color-control-hover)] text-[var(--color-text-secondary)]",
  props.variant === "accent" &&
    "bg-[var(--color-accent-brand-soft)] text-[var(--color-accent-brand-hover)]",
  props.variant === "success" && "bg-emerald-500/15 text-[var(--color-success)]",
  props.variant === "warning" && "bg-amber-500/15 text-[var(--color-warning)]",
  props.variant === "danger" && "bg-red-500/15 text-[var(--color-danger)]",
]);
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
