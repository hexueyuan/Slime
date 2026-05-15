<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "secondary",
    size: "md",
    disabled: false,
    type: "button",
  },
);

const classes = computed(() => [
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]",
  "disabled:cursor-not-allowed disabled:border-[var(--color-border-subtle)] disabled:bg-[var(--color-control)] disabled:text-[var(--color-text-disabled)]",
  props.size === "sm" && "h-7 px-2.5 text-xs",
  props.size === "md" && "h-8 px-3 text-[13px]",
  props.size === "lg" && "h-9 px-4 text-sm",
  props.variant === "primary" &&
    "border border-white/10 bg-[var(--color-accent-brand)] text-white hover:bg-[var(--color-accent-brand-hover)] disabled:text-[var(--color-text-disabled)]",
  props.variant === "secondary" &&
    "border border-[var(--color-border-strong)] bg-[var(--color-control)] text-[var(--color-text-primary)] hover:bg-[var(--color-control-hover)]",
  props.variant === "ghost" &&
    "border border-transparent bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] disabled:hover:bg-transparent",
  props.variant === "danger" &&
    "border border-red-400/30 bg-red-500/10 text-[var(--color-danger)] hover:bg-red-500/15 disabled:border-[var(--color-border-subtle)] disabled:text-[var(--color-text-disabled)]",
]);
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes">
    <slot />
  </button>
</template>
