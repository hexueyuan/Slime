<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    role?: string;
    description?: string;
    selected?: boolean;
    disabled?: boolean;
    toneColor?: string;
  }>(),
  {
    role: "",
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
      'group relative min-h-[88px] w-full min-w-0 overflow-hidden rounded-[11px] border px-[11px] py-[11px] text-left transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]',
      'disabled:cursor-not-allowed disabled:opacity-45',
      selected
        ? 'border-[color:color-mix(in_srgb,var(--agent-tone)_44%,transparent)] bg-[color-mix(in_srgb,var(--agent-tone)_10%,var(--color-control))] text-[var(--color-text-primary)]'
        : 'border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)]',
    ]"
    @click="$emit('select')"
  >
    <div
      v-if="selected"
      class="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-[color-mix(in_srgb,var(--agent-tone)_13%,transparent)]"
    />

    <div class="relative flex items-center gap-[9px]">
      <div
        class="grid h-[34px] w-[34px] shrink-0 place-items-center overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--agent-tone)_28%,transparent)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-subtle)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--agent-tone)_34%,transparent)]"
      >
        <slot name="avatar">
          <span class="text-[13px] font-bold">{{ name.slice(0, 1) }}</span>
        </slot>
      </div>

      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
          {{ name }}
        </div>
        <div v-if="role" class="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
          {{ role }}
        </div>
      </div>
    </div>

    <div class="relative mt-2.5 min-w-0">
      <div
        v-if="description"
        class="line-clamp-2 text-xs leading-[1.45] text-[var(--color-text-muted)]"
      >
        {{ description }}
      </div>
    </div>
  </button>
</template>
