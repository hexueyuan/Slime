<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    description?: string;
    selected?: boolean;
    disabled?: boolean;
    toneColor?: string;
  }>(),
  {
    description: "",
    selected: false,
    disabled: false,
    toneColor: "var(--color-accent-brand)",
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
    :style="{ '--agent-tone': toneColor }"
    :class="[
      'group flex min-h-[132px] w-[168px] flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border px-4 py-4 text-center transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
      'disabled:cursor-not-allowed disabled:opacity-45',
      selected
        ? 'border-[color:var(--agent-tone)] bg-[color-mix(in_srgb,var(--agent-tone)_14%,transparent)] text-[var(--color-text-primary)]'
        : 'border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
    ]"
    @click="$emit('select')"
  >
    <div
      class="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-control)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-subtle)] transition-colors group-hover:bg-[var(--color-control-hover)]"
    >
      <slot name="avatar">
        <span class="text-sm font-semibold">{{ name.slice(0, 1) }}</span>
      </slot>
    </div>

    <div class="min-w-0">
      <div class="truncate text-sm font-semibold text-[var(--color-text-primary)]">
        {{ name }}
      </div>
      <div
        v-if="description"
        class="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]"
      >
        {{ description }}
      </div>
    </div>
  </button>
</template>
