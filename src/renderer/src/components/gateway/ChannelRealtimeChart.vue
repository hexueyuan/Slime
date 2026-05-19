<script setup lang="ts">
import { computed } from "vue";
import SlimeRealtimeChart from "@/components/slime/SlimeRealtimeChart.vue";
import type { MinutePoint } from "@shared/types/gateway";

const props = withDefaults(
  defineProps<{
    points: MinutePoint[];
    metric?: "all" | MetricKey;
    compact?: boolean;
  }>(),
  {
    metric: "all",
    compact: false,
  },
);

type MetricKey = "availability" | "latency";

function sortedTrafficPoints(): MinutePoint[] {
  return [...props.points]
    .filter((point) => point.successCount + point.failCount > 0)
    .sort((a, b) => a.minute.localeCompare(b.minute));
}

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function formatAvailability(value: number): string {
  return `${value.toFixed(1)}%`;
}

function availabilityOf(point: MinutePoint): number {
  const total = point.successCount + point.failCount;
  return total === 0 ? 0 : Number(((point.successCount / total) * 100).toFixed(1));
}

function latencyOf(point: MinutePoint): number {
  return point.avgLatencyMs === null ? 0 : Math.round(point.avgLatencyMs);
}

function minuteLabel(point: MinutePoint): string {
  return point.minute.split("T")[1] ?? point.minute;
}

const trafficPoints = computed(() => sortedTrafficPoints());

const hasData = computed(() => trafficPoints.value.length > 0);

const summaryAvailability = computed(() => {
  if (!hasData.value) return null;
  const totalSuccess = trafficPoints.value.reduce((sum, point) => sum + point.successCount, 0);
  const totalAll = trafficPoints.value.reduce(
    (sum, point) => sum + point.successCount + point.failCount,
    0,
  );
  return totalAll === 0 ? null : (totalSuccess / totalAll) * 100;
});

const summaryAvgLatency = computed(() => {
  const valid = trafficPoints.value.filter((point) => point.avgLatencyMs !== null);
  if (valid.length === 0) return null;
  return Math.round(
    valid.reduce((sum, point) => sum + (point.avgLatencyMs as number), 0) / valid.length,
  );
});

const trendLabels = computed(() => trafficPoints.value.map(minuteLabel));
const latencyPoints = computed(() =>
  trafficPoints.value.filter((point) => point.avgLatencyMs !== null),
);

const metricPoints = computed<Record<MetricKey, number[]>>(() => {
  if (!hasData.value) return { availability: [], latency: [] };
  return {
    availability: trafficPoints.value.map(availabilityOf),
    latency: latencyPoints.value.map(latencyOf),
  };
});

const metricLabels = computed<Record<MetricKey, string[]>>(() => ({
  availability: trendLabels.value,
  latency: latencyPoints.value.map(minuteLabel),
}));

const metrics = computed(() => [
  {
    id: "availability",
    label: "可用率",
    value: summaryAvailability.value === null ? "-" : formatAvailability(summaryAvailability.value),
    color: "success" as const,
    points: metricPoints.value.availability,
    labels: metricLabels.value.availability,
    formatValue: formatAvailability,
  },
  {
    id: "latency",
    label: "平均延迟",
    value: summaryAvgLatency.value === null ? "-" : formatLatency(summaryAvgLatency.value),
    color: "blue" as const,
    points: metricPoints.value.latency,
    labels: metricLabels.value.latency,
    formatValue: formatLatency,
  },
]);

const chartTitle = computed(() => {
  if (props.metric === "availability") return "可用率";
  if (props.metric === "latency") return "平均延迟";
  return "稳定性";
});

const displayMetrics = computed(() => {
  if (props.metric === "all") return metrics.value;
  return metrics.value.filter((metric) => metric.id === props.metric);
});
</script>

<template>
  <SlimeRealtimeChart
    :title="chartTitle"
    subtitle="近30分钟"
    :metrics="displayMetrics"
    :compact="compact"
  />
</template>
