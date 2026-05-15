<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    minRows?: number;
    maxHeight?: number;
    disabled?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "",
    minRows: 3,
    maxHeight: 240,
    disabled: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, props.maxHeight)}px`;
}

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  nextTick(() => autoResize());
}

watch(
  () => props.modelValue,
  () => nextTick(() => autoResize()),
);

onMounted(() => autoResize());
</script>

<template>
  <textarea
    ref="textareaRef"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="minRows"
    :style="{ maxHeight: `${maxHeight}px` }"
    class="w-full resize-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-2 text-sm leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-accent-brand)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-brand-soft)] disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)] disabled:opacity-80"
    @input="onInput"
  />
</template>
