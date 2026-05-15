<script setup lang="ts">
withDefaults(
  defineProps<{
    selected?: boolean;
    disabled?: boolean;
    compact?: boolean;
  }>(),
  {
    selected: false,
    disabled: false,
    compact: false,
  },
);

defineEmits<{
  select: [];
}>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :class="[
      'group flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] text-left transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
      'disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:opacity-70',
      compact ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-sm',
      selected
        ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
    ]"
    @click="$emit('select')"
  >
    <slot name="leading" />
    <span class="min-w-0 flex-1 truncate"><slot /></span>
    <slot name="trailing" />
  </button>
</template>
