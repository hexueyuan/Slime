<script setup lang="ts">
import { Icon } from "@iconify/vue";

withDefaults(
  defineProps<{
    icon: string;
    title: string;
    size?: "sm" | "md";
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    size: "md",
    disabled: false,
    type: "button",
  },
);
</script>

<template>
  <button
    :type="type"
    :title="title"
    :aria-label="title"
    :disabled="disabled"
    :class="[
      'inline-grid place-items-center border border-transparent bg-transparent text-[var(--color-text-muted)] transition-colors',
      'hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-secondary)]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
      'disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:hover:border-transparent disabled:hover:bg-transparent',
      size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-[var(--radius-sm)]',
    ]"
  >
    <Icon :icon="icon" :class="size === 'sm' ? 'h-4 w-4' : 'h-[17px] w-[17px]'" />
  </button>
</template>
