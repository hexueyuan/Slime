<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    type?: string;
    density?: "normal" | "compact";
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "",
    type: "text",
    density: "normal",
    disabled: false,
  },
);

defineEmits<{
  "update:modelValue": [value: string];
}>();

const classes = computed(() => [
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors",
  "focus:border-[var(--color-accent-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-brand-soft)]",
  "disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:opacity-80",
  props.density === "compact" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
]);
</script>

<template>
  <input
    :value="modelValue"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="classes"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
