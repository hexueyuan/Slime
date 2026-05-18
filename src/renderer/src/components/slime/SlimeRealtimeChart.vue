<script setup lang="ts">
import { computed, ref } from "vue";

type Metric = {
  id?: string;
  label: string;
  value: string | number;
  trend?: string;
  color?: "accent" | "success" | "warning" | "danger" | "blue";
  points?: number[];
  labels?: string[];
  formatValue?: (value: number) => string;
};

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    metrics: Metric[];
    compact?: boolean;
  }>(),
  {
    subtitle: "",
    compact: false,
  },
);

const colorMap = {
  accent: "var(--color-accent-brand)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  blue: "color-mix(in srgb, var(--color-success) 42%, var(--color-accent-brand-hover))",
};

const chartWindowStyle = {
  backgroundImage:
    "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
  backgroundSize: "100% 29px, 44px 100%",
};

function polyline(points: number[] | undefined, height = 92): string {
  return chartPoints(points, height)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function chartPoints(points: number[] | undefined, height = 92) {
  if (!points?.length) return [];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  return points.map((value, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = height - 14 - ((value - min) / range) * (height - 40);
    return {
      index,
      value,
      x,
      y,
      labelX: Math.min(96, Math.max(4, x)),
    };
  });
}

function formatCompactValue(value: number): string {
  if (Number.isInteger(value)) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value >= 1 ? value.toFixed(2) : value.toFixed(4);
}

function visibleLabelIndexes(total: number, preferredMax: number): Set<number> {
  if (total <= preferredMax) return new Set(Array.from({ length: total }, (_, index) => index));
  const step = Math.ceil((total - 1) / (preferredMax - 1));
  return new Set(
    Array.from({ length: total }, (_, index) => index).filter(
      (index) => index === 0 || index === total - 1 || index % step === 0,
    ),
  );
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

const activeGradientId = computed(() => `chartFill-${activeMetric.value?.index ?? "empty"}`);
const activeLine = computed(() => polyline(activeMetric.value?.points, 92));
const activeArea = computed(() => (activeLine.value ? `0,92 ${activeLine.value} 100,92` : ""));
const activePoints = computed(() => {
  const metric = activeMetric.value;
  const points = chartPoints(metric?.points, 92);
  const visibleAxisIndexes = visibleLabelIndexes(points.length, 8);
  const visibleValueIndexes = visibleLabelIndexes(points.length, 10);
  return points.map((point) => ({
    ...point,
    label: metric?.labels?.[point.index] ?? String(point.index + 1),
    displayValue: metric?.formatValue?.(point.value) ?? formatCompactValue(point.value),
    showAxis: visibleAxisIndexes.has(point.index),
    showValue: visibleValueIndexes.has(point.index),
  }));
});
const axisLabels = computed(() => activePoints.value.filter((point) => point.showAxis));
const valueLabels = computed(() => activePoints.value.filter((point) => point.showValue));
const barItems = computed(() => {
  const points = activeMetric.value?.points ?? [];
  if (!points.length) return [];
  const max = Math.max(...points, 1);
  return points.map((value, index) => ({
    index,
    height: `${Math.max(10, (value / max) * 78)}%`,
  }));
});
</script>

<template>
  <section
    data-testid="slime-realtime-chart"
    :data-density="props.compact ? 'compact' : 'regular'"
    class="min-w-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)]"
  >
    <div class="flex min-w-0 flex-wrap items-start justify-between gap-3 px-3 pb-2 pt-3">
      <div class="min-w-0">
        <h3 class="truncate text-xs font-semibold text-[var(--color-text-secondary)]">
          {{ title }}
        </h3>
        <div
          v-if="activeMetric"
          data-testid="chart-summary-value"
          class="mt-1 truncate text-xl font-semibold text-[var(--color-text-primary)]"
        >
          {{ activeMetric.value }}
        </div>
        <p v-if="subtitle" class="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">
          {{ subtitle }}
        </p>
      </div>
      <slot name="actions" />
    </div>

    <div class="grid min-w-0 grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
      <button
        v-for="metric in normalizedMetrics"
        :key="metric.id"
        data-testid="chart-metric-pill"
        type="button"
        :style="{ '--metric-color': metric.colorValue }"
        :class="[
          'relative min-h-14 min-w-0 overflow-hidden rounded-[var(--radius-md)] border px-3 py-2 text-left transition-colors',
          activeMetric?.id === metric.id
            ? 'border-[color-mix(in_srgb,var(--metric-color)_48%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--metric-color)_18%,transparent),var(--color-control))] text-[var(--color-text-primary)]'
            : 'border-[var(--color-border-subtle)] bg-[var(--color-control)] text-[var(--color-text-muted)] hover:bg-[var(--color-control-hover)]',
        ]"
        @click="activeId = metric.id"
      >
        <span
          class="absolute bottom-2 left-0 top-2 w-0.5 rounded-full opacity-75"
          style="background: var(--metric-color)"
        />
        <span class="block truncate text-[10px] font-medium text-[var(--color-text-muted)]">
          {{ metric.label }}
        </span>
        <span class="mt-1 block truncate text-sm font-semibold text-[var(--color-text-primary)]">
          {{ metric.value }}
          <span
            v-if="metric.trend"
            class="ml-1 text-[10px] font-semibold"
            style="color: var(--metric-color)"
          >
            {{ metric.trend }}
          </span>
        </span>
      </button>
    </div>

    <div
      data-testid="chart-window"
      :class="[
        'relative mx-3 mb-3 min-w-0 overflow-hidden rounded-[var(--radius-md)]',
        props.compact ? 'h-[clamp(112px,16vh,148px)]' : 'h-[148px]',
      ]"
      :style="chartWindowStyle"
    >
      <template v-if="activeLine">
        <div
          class="pointer-events-none absolute inset-x-3 bottom-8 z-0 grid h-11 items-end gap-1"
          :style="{ gridTemplateColumns: `repeat(${barItems.length}, minmax(0, 1fr))` }"
          aria-hidden="true"
        >
          <span
            v-for="bar in barItems"
            :key="bar.index"
            data-testid="chart-bar"
            class="block min-h-1 rounded-t-full bg-[color-mix(in_srgb,var(--color-text-muted)_18%,transparent)]"
            :style="{ height: bar.height }"
          />
        </div>

        <svg
          class="absolute inset-0 z-10 h-full w-full"
          viewBox="0 0 100 92"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient :id="activeGradientId" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" :stop-color="activeMetric?.colorValue" stop-opacity="0.28" />
              <stop offset="100%" :stop-color="activeMetric?.colorValue" stop-opacity="0" />
            </linearGradient>
          </defs>
          <polygon :points="activeArea" :fill="`url(#${activeGradientId})`" stroke="none" />
          <polyline
            :points="activeLine"
            fill="none"
            :stroke="activeMetric?.colorValue"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <span
          v-for="point in valueLabels"
          :key="point.index"
          data-testid="chart-value-label"
          class="pointer-events-none absolute z-20 -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          :style="{
            left: `${point.labelX}%`,
            top: `${point.y}%`,
            color: activeMetric?.colorValue,
            transform: 'translate(-50%, calc(-100% - 6px))',
          }"
        >
          {{ point.displayValue }}
        </span>

        <div
          class="absolute inset-x-3 bottom-3 z-20 h-4 border-t border-[var(--color-border-subtle)]"
        >
          <span
            v-for="point in axisLabels"
            :key="point.index"
            data-testid="chart-x-label"
            class="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-[var(--color-text-muted)]"
            :style="{ left: `${point.labelX}%` }"
          >
            {{ point.label }}
          </span>
        </div>
      </template>
      <div
        v-else
        class="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]"
      >
        暂无趋势数据
      </div>
    </div>
  </section>
</template>
