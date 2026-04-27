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
  metric: "requests" | "cost" | "tokens";
  granularity: "hourly" | "daily";
}>();

const xLabels = computed(() =>
  props.points.map((p) =>
    props.granularity === "hourly" ? `${String(p.hour ?? 0).padStart(2, "0")}:00` : p.date.slice(5),
  ),
);

const series = computed(() => {
  if (props.metric === "requests") {
    return [{ name: "请求数", data: props.points.map((p) => p.requests) }];
  }
  if (props.metric === "cost") {
    return [{ name: "费用($)", data: props.points.map((p) => Number(p.cost.toFixed(4))) }];
  }
  return [
    { name: "Input Token", data: props.points.map((p) => p.inputTokens) },
    { name: "Output Token", data: props.points.map((p) => p.outputTokens) },
  ];
});

const option = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 8, right: 8, bottom: 20, left: 50 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLine: { lineStyle: { color: "#333" } },
    axisLabel: { color: "#555", fontSize: 10 },
  },
  yAxis: {
    type: "value",
    axisLine: { show: false },
    axisLabel: { color: "#555", fontSize: 10 },
    splitLine: { lineStyle: { color: "#1e1e2e" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 12 },
  },
  series: series.value.map((s, i) => ({
    name: s.name,
    type: "line",
    data: s.data,
    smooth: true,
    symbol: "none",
    areaStyle: { opacity: 0.15 },
    lineStyle: { width: 1.5, color: i === 0 ? "#7c3aed" : "#3b82f6" },
    itemStyle: { color: i === 0 ? "#7c3aed" : "#3b82f6" },
  })),
}));
</script>

<template>
  <v-chart :option="option" :autoresize="true" style="height: 90px; width: 100%" />
</template>
