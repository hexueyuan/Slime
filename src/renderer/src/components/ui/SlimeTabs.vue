<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T;
  tabs: Array<{ value: T; label: string; disabled?: boolean }>;
}>();

defineEmits<{
  "update:modelValue": [value: T];
}>();
</script>

<template>
  <div
    class="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-1"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      :disabled="tab.disabled"
      :class="[
        'h-7 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
        'disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)]',
        modelValue === tab.value
          ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)] shadow-sm'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
      ]"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
