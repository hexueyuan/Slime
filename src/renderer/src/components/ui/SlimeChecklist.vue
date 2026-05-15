<script setup lang="ts">
export type SlimeChecklistItem = {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  badge?: string;
  control?: "checkbox" | "switch";
};

defineProps<{
  items: SlimeChecklistItem[];
}>();

const emit = defineEmits<{
  toggle: [id: string, checked: boolean];
}>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :data-testid="`check-row-${item.id}`"
      :disabled="item.disabled"
      :class="[
        'grid min-h-10 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors',
        item.checked
          ? 'border-[color-mix(in_srgb,var(--color-accent-brand)_34%,transparent)] bg-[var(--color-accent-brand-soft)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-control)] hover:bg-[var(--color-control-hover)]',
        item.disabled && 'cursor-not-allowed opacity-70 hover:bg-[var(--color-control)]',
      ]"
      @click="emit('toggle', item.id, !item.checked)"
    >
      <span
        v-if="item.control !== 'switch'"
        :class="[
          'grid h-[18px] w-[18px] place-items-center rounded-[5px] border text-xs font-bold',
          item.checked
            ? 'border-[var(--color-accent-brand-hover)] bg-[var(--color-accent-brand)] text-white'
            : 'border-white/20 bg-[var(--color-control)] text-transparent',
        ]"
      >
        ✓
      </span>
      <span v-else class="h-[18px] w-[18px]" />

      <span class="min-w-0">
        <span class="block truncate text-xs font-semibold text-[var(--color-text-secondary)]">
          {{ item.title }}
        </span>
        <span
          v-if="item.description"
          class="mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]"
        >
          {{ item.description }}
        </span>
      </span>

      <span
        v-if="item.control === 'switch'"
        :class="[
          'relative h-5 w-[34px] rounded-full transition-colors',
          item.checked
            ? 'bg-[color-mix(in_srgb,var(--color-accent-brand)_58%,transparent)]'
            : 'bg-white/15',
        ]"
      >
        <span
          :class="[
            'absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-transform',
            item.checked ? 'translate-x-[17px]' : 'translate-x-[3px]',
          ]"
        />
      </span>
      <span
        v-else-if="item.badge"
        class="inline-flex h-6 items-center rounded-full bg-[var(--color-control-hover)] px-2 text-xs font-medium text-[var(--color-text-secondary)]"
      >
        {{ item.badge }}
      </span>
    </button>
  </div>
</template>
