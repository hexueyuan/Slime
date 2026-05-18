<script setup lang="ts">
import { computed, ref } from "vue";

type Metric = {
  id?: string;
  label: string;
  value: string | number;
  color?: "accent" | "success" | "warning" | "danger" | "blue";
  points?: number[];
};

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    metrics: Metric[];
  }>(),
  {
    subtitle: "",
  },
);

const colorMap = {
  accent: "var(--color-accent-brand)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  blue: "color-mix(in srgb, var(--color-success) 42%, var(--color-accent-brand-hover))",
};

function polyline(points: number[] | undefined, height = 92): string {
  if (!points?.length) return "";
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  return points
    .map((value, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = height - 8 - ((value - min) / range) * (height - 18);
      return `${x},${y}`;
    })
    .join(" ");
}

const normalizedMetrics = computed(() =>
  props.metrics.map((metric, index) => ({
    ...metric,
    id: metric.id ?? metric.label,
    index,
    colorValue: colorMap[metric.color ?? "accent"],
  })),
);

const activeId = ref<string | null>(null);

const activeMetric = computed(
  () =>
    normalizedMetrics.value.find((metric) => metric.id === activeId.value) ??
    normalizedMetrics.value[0],
);

const activeLine = computed(() => polyline(activeMetric.value?.points, 92));
const activeArea = computed(() => (activeLine.value ? `0,92 ${activeLine.value} 100,92` : ""));
</script>

<template>
  <section
    class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4"
  >
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-[var(--color-text-primary)]">{{ title }}</h3>
        <p v-if="subtitle" class="mt-1 text-xs text-[var(--color-text-muted)]">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </div>

    <div class="mb-3 flex flex-wrap gap-2">
      <button
        v-for="metric in normalizedMetrics"
        :key="metric.id"
        type="button"
        :style="{ '--metric-color': metric.colorValue }"
        :class="[
          'inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors',
          activeMetric?.id === metric.id
            ? 'border-[color-mix(in_srgb,var(--metric-color)_42%,transparent)] bg-[color-mix(in_srgb,var(--metric-color)_14%,transparent)] text-[var(--color-text-primary)]'
            : 'border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)]',
        ]"
        @click="activeId = metric.id"
      >
        <span class="h-1.5 w-1.5 rounded-full" style="background: var(--metric-color)" />
        <span>{{ metric.label }}</span>
        <span class="text-[var(--color-text-secondary)]">
          {{ metric.value }}
        </span>
      </button>
    </div>

    <div
      class="h-[112px] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-2"
    >
      <svg
        v-if="activeLine"
        class="h-full w-full overflow-visible"
        viewBox="0 0 100 92"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient :id="`chartFill-${activeMetric?.id}`" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" :stop-color="activeMetric?.colorValue" stop-opacity="0.2" />
            <stop offset="100%" :stop-color="activeMetric?.colorValue" stop-opacity="0" />
          </linearGradient>
        </defs>
        <polygon :points="activeArea" :fill="`url(#chartFill-${activeMetric?.id})`" stroke="none" />
        <polyline
          :points="activeLine"
          fill="none"
          :stroke="activeMetric?.colorValue"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div
        v-else
        class="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]"
      >
        暂无趋势数据
      </div>
    </div>
  </section>
</template>
