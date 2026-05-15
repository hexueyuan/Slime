<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    status?: "success" | "warning" | "danger" | "neutral";
    meta?: string;
  }>(),
  {
    subtitle: "",
    status: "neutral",
    meta: "",
  },
);
</script>

<template>
  <article
    :class="[
      'rounded-[var(--radius-md)] border bg-[var(--color-control)] p-3 transition-colors hover:bg-[var(--color-control-hover)]',
      status === 'success' && 'border-emerald-400/20',
      status === 'warning' && 'border-amber-400/24',
      status === 'danger' && 'border-red-400/24',
      status === 'neutral' && 'border-[var(--color-border-subtle)]',
    ]"
  >
    <div class="flex items-start gap-3">
      <span
        :class="[
          'mt-1 h-2 w-2 shrink-0 rounded-full',
          status === 'success' && 'bg-[var(--color-success)]',
          status === 'warning' && 'bg-[var(--color-warning)]',
          status === 'danger' && 'bg-[var(--color-danger)]',
          status === 'neutral' && 'bg-[var(--color-text-muted)]',
        ]"
      />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h4 class="truncate text-sm font-medium text-[var(--color-text-primary)]">{{ title }}</h4>
          <span v-if="meta" class="shrink-0 text-[11px] text-[var(--color-text-muted)]">{{
            meta
          }}</span>
        </div>
        <p
          v-if="subtitle"
          class="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]"
        >
          {{ subtitle }}
        </p>
        <div v-if="$slots.default" class="mt-2 text-xs text-[var(--color-text-secondary)]">
          <slot />
        </div>
      </div>
    </div>
  </article>
</template>
