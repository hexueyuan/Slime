<script setup lang="ts">
import { computed } from "vue";

type Metric = {
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
  blue: "#72a7ff",
};

function polyline(points: number[] | undefined): string {
  if (!points?.length) return "";
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  return points
    .map((value, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 34 - ((value - min) / range) * 28;
      return `${x},${y}`;
    })
    .join(" ");
}

const normalizedMetrics = computed(() =>
  props.metrics.map((metric) => ({
    ...metric,
    colorValue: colorMap[metric.color ?? "accent"],
    line: polyline(metric.points),
  })),
);
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

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="metric in normalizedMetrics"
        :key="metric.label"
        :style="{ '--metric-color': metric.colorValue }"
        class="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[color-mix(in_srgb,var(--metric-color)_8%,transparent)] p-3"
      >
        <div class="text-xs text-[var(--color-text-muted)]">{{ metric.label }}</div>
        <div class="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
          {{ metric.value }}
        </div>
        <svg v-if="metric.line" class="mt-3 h-9 w-full overflow-visible" viewBox="0 0 100 36">
          <polyline
            :points="metric.line"
            fill="none"
            stroke="var(--metric-color)"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </article>
    </div>
  </section>
</template>
