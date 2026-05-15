<script setup lang="ts">
defineProps<{
  title: string;
  items: Array<{ id: string | number; label: string; value: string; tone?: "gold" | "neutral" }>;
}>();
</script>

<template>
  <section
    class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
  >
    <h3 class="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">{{ title }}</h3>
    <div v-if="items.length" class="space-y-2">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm"
      >
        <span
          :class="[
            'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
            index === 0 || item.tone === 'gold'
              ? 'bg-amber-500/15 text-[var(--color-warning)]'
              : 'bg-[var(--color-control-hover)] text-[var(--color-text-muted)]',
          ]"
        >
          {{ index + 1 }}
        </span>
        <span class="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">{{
          item.label
        }}</span>
        <span class="shrink-0 text-xs font-medium text-[var(--color-text-primary)]">{{
          item.value
        }}</span>
      </div>
    </div>
    <div v-else class="py-6 text-center text-xs text-[var(--color-text-muted)]">暂无数据</div>
  </section>
</template>
