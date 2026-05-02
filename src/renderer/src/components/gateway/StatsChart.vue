<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { TrendPoint } from "@shared/types/gateway";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent]);

const props = defineProps<{
  points: TrendPoint[];
  granularity: "hourly" | "daily";
}>();

const SERIES_CONFIG = [
  { key: "requests" as const, name: "请求数", color: "#7c3aed" },
  { key: "cost" as const, name: "费用", color: "#f59e0b" },
  { key: "inputTokens" as const, name: "Input Token", color: "#3b82f6" },
  { key: "outputTokens" as const, name: "Output Token", color: "#10b981" },
];

const xLabels = computed(() =>
  props.points.map((p) =>
    props.granularity === "hourly" ? `${String(p.hour ?? 0).padStart(2, "0")}:00` : p.date.slice(5),
  ),
);

function formatVal(key: (typeof SERIES_CONFIG)[number]["key"], val: number): string {
  if (key === "cost") return `$${val.toFixed(4)}`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return String(val);
}

const option = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 8, right: 8, bottom: 20, left: 8 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLine: { lineStyle: { color: "#333" } },
    axisLabel: { color: "#555", fontSize: 10 },
  },
  yAxis: {
    type: "value",
    axisLine: { show: false },
    axisLabel: { show: false },
    splitLine: { lineStyle: { color: "#1e1e2e" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 12 },
    formatter(params: { seriesName: string; value: unknown; color: string }[]) {
      return params
        .map((p) => {
          const cfg = SERIES_CONFIG.find((s) => s.name === p.seriesName);
          if (!cfg) return "";
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px;"></span>`;
          const val = typeof p.value === "number" ? p.value : null;
          if (val === null) return `${dot}${p.seriesName}: -`;
          return `${dot}${p.seriesName}: ${formatVal(cfg.key, val)}`;
        })
        .join("<br/>");
    },
  },
  series: SERIES_CONFIG.map((cfg) => ({
    name: cfg.name,
    type: "line",
    data: props.points.map((p) => p[cfg.key]),
    smooth: true,
    symbol: "none",
    areaStyle: { opacity: 0.1, color: cfg.color },
    lineStyle: { width: 1.5, color: cfg.color },
    itemStyle: { color: cfg.color },
  })),
}));
</script>

<template>
  <v-chart :option="option" :autoresize="true" style="height: 100%; width: 100%" />
</template>
