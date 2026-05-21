<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import SlimeBadge from "@/components/ui/SlimeBadge.vue";

type SelectValue = string | number;

export type SlimeSelectOption = {
  value: SelectValue;
  label: string;
  description?: string;
  badge?: string;
  badgeVariant?: "neutral" | "accent" | "success" | "warning" | "danger";
  mark?: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue?: SelectValue | SelectValue[] | null;
    options?: SlimeSelectOption[];
    mode?: "single" | "multiple";
    placeholder?: string;
    disabled?: boolean;
    density?: "default" | "compact";
    defaultOpen?: boolean;
    showSelectedDescription?: boolean;
  }>(),
  {
    modelValue: null,
    options: () => [],
    mode: "single",
    placeholder: "请选择",
    disabled: false,
    density: "default",
    defaultOpen: false,
    showSelectedDescription: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: SelectValue | SelectValue[] | null];
}>();

const rootRef = ref<HTMLElement | null>(null);
const open = ref(props.defaultOpen);

const isMultiple = computed(() => props.mode === "multiple");

const selectedValues = computed<SelectValue[]>(() => {
  if (isMultiple.value) {
    return Array.isArray(props.modelValue) ? props.modelValue : [];
  }
  return props.modelValue == null || Array.isArray(props.modelValue) ? [] : [props.modelValue];
});

const selectedOptions = computed(() =>
  props.options.filter((option) => selectedValues.value.includes(option.value)),
);

const selectedOption = computed(() => selectedOptions.value[0] ?? null);

const triggerClasses = computed(() => [
  "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] text-left text-[var(--color-text-secondary)] transition-colors",
  "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  props.density === "compact"
    ? "min-h-8 px-2.5 py-1.5 text-xs"
    : "min-h-[38px] px-[11px] py-1.5 text-sm",
  open.value && "border-[var(--color-accent-brand)] bg-[var(--color-control-hover)]",
]);

function isSelected(value: SelectValue) {
  return selectedValues.value.includes(value);
}

function optionMark(option: SlimeSelectOption) {
  return option.mark ?? option.label.slice(0, 1).toUpperCase();
}

function toggleOpen() {
  if (props.disabled) return;
  open.value = !open.value;
}

function selectOption(option: SlimeSelectOption) {
  if (option.disabled) return;

  if (!isMultiple.value) {
    emit("update:modelValue", option.value);
    open.value = false;
    return;
  }

  const next = new Set(selectedValues.value);
  if (next.has(option.value)) {
    next.delete(option.value);
  } else {
    next.add(option.value);
  }
  emit("update:modelValue", Array.from(next));
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    open.value = false;
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  document.removeEventListener("keydown", handleDocumentKeydown);
});
</script>

<template>
  <div
    ref="rootRef"
    class="relative w-full min-w-0"
    data-component-id="SlimeSelect"
    data-layout="adaptive"
    :data-open="open ? 'true' : undefined"
    :data-mode="mode"
  >
    <button
      data-testid="slime-select-trigger"
      type="button"
      :class="triggerClasses"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
    >
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <template v-if="isMultiple && selectedOptions.length">
          <span
            v-for="option in selectedOptions"
            :key="option.value"
            data-testid="slime-select-chip"
            class="inline-flex max-w-full min-w-0 items-center rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-control-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-primary)]"
          >
            <span class="truncate">{{ option.label }}</span>
          </span>
        </template>
        <span v-else-if="selectedOption" class="min-w-0 text-[var(--color-text-primary)]">
          <strong class="block truncate text-xs font-semibold leading-5 sm:text-[13px]">
            {{ selectedOption.label }}
          </strong>
          <span
            v-if="showSelectedDescription && selectedOption.description"
            class="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]"
          >
            {{ selectedOption.description }}
          </span>
        </span>
        <span v-else class="min-w-0 truncate text-[var(--color-text-muted)]">
          {{ placeholder }}
        </span>
      </div>
      <Icon
        icon="lucide:chevron-down"
        class="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform"
        :class="open && 'rotate-180'"
      />
    </button>

    <div
      v-if="open"
      data-testid="slime-select-menu"
      role="listbox"
      class="absolute left-0 right-0 z-50 mt-1 max-h-64 min-w-0 overflow-y-auto rounded-[11px] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-[5px] shadow-[var(--shadow-floating)]"
      :aria-multiselectable="isMultiple"
    >
      <button
        v-for="option in options"
        :key="option.value"
        :data-testid="`slime-select-option-${option.value}`"
        type="button"
        role="option"
        :aria-selected="isSelected(option.value)"
        :disabled="option.disabled"
        class="flex min-h-[42px] w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--color-control-hover)] disabled:cursor-not-allowed disabled:opacity-45"
        @click="selectOption(option)"
      >
        <span
          class="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-accent-brand)]"
          :class="
            isSelected(option.value) &&
            'border-[var(--color-accent-brand)] bg-[var(--color-accent-brand-soft)]'
          "
        >
          <Icon v-if="isSelected(option.value)" icon="lucide:check" class="h-3 w-3" />
          <span v-else class="text-[10px] font-bold">{{ optionMark(option) }}</span>
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-medium text-[var(--color-text-primary)]">
            {{ option.label }}
          </span>
          <span
            v-if="option.description"
            class="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]"
          >
            {{ option.description }}
          </span>
        </span>
        <SlimeBadge
          v-if="option.badge"
          :variant="option.badgeVariant ?? 'neutral'"
          class="shrink-0"
        >
          {{ option.badge }}
        </SlimeBadge>
      </button>

      <div
        v-if="!options.length"
        class="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]"
      >
        暂无选项
      </div>
    </div>
  </div>
</template>
