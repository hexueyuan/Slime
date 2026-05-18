<script setup lang="ts">
import { computed, ref } from "vue";

type RankMetric = {
  value: string;
  label: string;
};

type RankItem = {
  id: string | number;
  label: string;
  value?: string;
  values?: Record<string, string>;
  sortValues?: Record<string, number>;
  tone?: "gold" | "neutral";
};

const props = withDefaults(
  defineProps<{
    title: string;
    items: RankItem[];
    metrics?: RankMetric[];
  }>(),
  {
    metrics: () => [],
  },
);

const activeMetric = ref<string | null>(null);

const currentMetric = computed(() => props.metrics[0]?.value ?? null);
const selectedMetric = computed(() => activeMetric.value ?? currentMetric.value);

const rankedItems = computed(() => {
  const metric = selectedMetric.value;
  return [...props.items]
    .sort((a, b) => {
      if (!metric) return 0;
      return (b.sortValues?.[metric] ?? 0) - (a.sortValues?.[metric] ?? 0);
    })
    .slice(0, 5)
    .map((item) => ({
      ...item,
      value: metric ? (item.values?.[metric] ?? item.value ?? "-") : (item.value ?? "-"),
    }));
});

function selectMetric(metric: string) {
  activeMetric.value = metric;
}
</script>

<template>
  <section
    class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
  >
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="min-w-0 truncate text-sm font-semibold text-[var(--color-text-primary)]">
        {{ title }}
      </h3>
      <div
        v-if="metrics.length"
        class="flex shrink-0 gap-1 rounded-full bg-[var(--color-control)] p-0.5"
      >
        <button
          v-for="metric in metrics"
          :key="metric.value"
          type="button"
          :class="[
            'h-6 rounded-full px-2 text-[11px] font-medium transition-colors',
            selectedMetric === metric.value
              ? 'bg-[var(--color-control-active)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
          ]"
          @click="selectMetric(metric.value)"
        >
          {{ metric.label }}
        </button>
      </div>
    </div>
    <div v-if="rankedItems.length" class="space-y-2">
      <div
        v-for="(item, index) in rankedItems"
        :key="item.id"
        class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm"
      >
        <span
          :class="[
            'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
            index === 0 || item.tone === 'gold'
              ? 'bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]'
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
