<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { MinutePoint } from "@shared/types/gateway";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const props = defineProps<{
  points: MinutePoint[];
}>();

// 生成最近 30 个整分钟的本地时间串，与 relay_logs.created_at 本地时间对齐
function getLast30Minutes(): string[] {
  const result: string[] = [];
  const now = new Date();
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  for (let i = 29; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 60 * 1000);
    const yyyy = t.getFullYear();
    const mo = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    result.push(`${yyyy}-${mo}-${dd}T${hh}:${mm}`);
  }
  return result;
}

const filledPoints = computed(() => {
  const byMinute = new Map<string, MinutePoint>();
  for (const p of props.points) {
    byMinute.set(p.minute, p);
  }
  const slots = getLast30Minutes();
  return slots.map(
    (m) => byMinute.get(m) ?? { minute: m, successCount: 0, failCount: 0, avgLatencyMs: null },
  );
});

const hasData = computed(() => props.points.some((p) => p.successCount + p.failCount > 0));

// minute key 已经是本地时间，直接提取 HH:MM 显示
const xLabels = computed(() =>
  filledPoints.value.map((p) => {
    const timePart = p.minute.split("T")[1];
    return timePart;
  }),
);

const availabilityData = computed(() =>
  filledPoints.value.map((p) => {
    const total = p.successCount + p.failCount;
    if (total === 0) return null;
    return Number(((p.successCount / total) * 100).toFixed(1));
  }),
);

const latencyData = computed(() =>
  filledPoints.value.map((p) =>
    p.successCount + p.failCount > 0 && p.avgLatencyMs !== null ? Math.round(p.avgLatencyMs) : null,
  ),
);

const summaryAvailability = computed(() => {
  const valid = props.points.filter((p) => p.successCount + p.failCount > 0);
  if (valid.length === 0) return null;
  const totalSuccess = valid.reduce((s, p) => s + p.successCount, 0);
  const totalAll = valid.reduce((s, p) => s + p.successCount + p.failCount, 0);
  return ((totalSuccess / totalAll) * 100).toFixed(1);
});

const summaryAvgLatency = computed(() => {
  const valid = props.points.filter(
    (p) => p.avgLatencyMs !== null && p.successCount + p.failCount > 0,
  );
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((s, p) => s + (p.avgLatencyMs as number), 0) / valid.length);
});

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

const availOption = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 4, right: 4, bottom: 16, left: 36 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLabel: {
      color: "#555",
      fontSize: 9,
      interval: 4, // 每 5 个显示一个标签，避免拥挤
    },
    axisLine: { lineStyle: { color: "#222" } },
  },
  yAxis: {
    type: "value",
    min: 0,
    max: 100,
    axisLabel: { color: "#555", fontSize: 9, formatter: "{value}%" },
    splitLine: { lineStyle: { color: "#1a1a2a" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 11 },
    formatter: (params: Array<{ value: number | null; axisValue: string }>) =>
      params[0].value != null
        ? `${params[0].axisValue}  ${params[0].value}%`
        : `${params[0].axisValue}  无流量`,
  },
  series: [
    {
      type: "line",
      data: availabilityData.value,
      smooth: false,
      symbol: "circle",
      symbolSize: 3,
      lineStyle: { color: "#4ade80", width: 1.5 },
      itemStyle: {
        color: (p: { value: number | null }) =>
          p.value !== null && p.value < 80 ? "#f87171" : "#4ade80",
      },
      connectNulls: false,
    },
  ],
}));

const latencyOption = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 4, right: 4, bottom: 16, left: 44 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLabel: {
      color: "#555",
      fontSize: 9,
      interval: 4,
    },
    axisLine: { lineStyle: { color: "#222" } },
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#555", fontSize: 9, formatter: (v: number) => formatLatency(v) },
    splitLine: { lineStyle: { color: "#1a1a2a" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 11 },
    formatter: (params: Array<{ value: number | null; axisValue: string; seriesName: string }>) =>
      params[0].value != null
        ? `${params[0].axisValue}<br/>${params[0].seriesName} &nbsp; ${formatLatency(params[0].value)}`
        : `${params[0].axisValue}<br/>无流量`,
  },
  series: [
    {
      name: "avg",
      type: "line",
      data: latencyData.value,
      smooth: false,
      symbol: "circle",
      symbolSize: 3,
      lineStyle: { color: "#60a5fa", width: 1.5 },
      connectNulls: false,
    },
  ],
}));
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/20 p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-muted-foreground">稳定性 · 近30分钟</span>
      <div class="flex gap-4">
        <div class="text-center">
          <div
            :class="[
              'text-sm font-semibold',
              summaryAvailability !== null && Number(summaryAvailability) >= 95
                ? 'text-emerald-400'
                : summaryAvailability !== null && Number(summaryAvailability) >= 80
                  ? 'text-amber-400'
                  : 'text-red-400',
            ]"
          >
            {{ summaryAvailability !== null ? `${summaryAvailability}%` : "-" }}
          </div>
          <div class="text-xs text-muted-foreground/60">可用率</div>
        </div>
        <div class="text-center">
          <div class="text-sm font-semibold text-blue-400">
            {{ summaryAvgLatency > 0 ? formatLatency(summaryAvgLatency) : "-" }}
          </div>
          <div class="text-xs text-muted-foreground/60">平均延迟</div>
        </div>
      </div>
    </div>
    <div v-if="!hasData" class="py-4 text-center text-xs text-muted-foreground">暂无流量数据</div>
    <div v-else class="grid grid-cols-2 gap-2">
      <div>
        <div class="mb-1 text-xs text-muted-foreground/60">可用率</div>
        <v-chart :option="availOption" :autoresize="true" style="height: 60px" />
      </div>
      <div>
        <div class="mb-1 text-xs text-muted-foreground/60">延迟 (avg)</div>
        <v-chart :option="latencyOption" :autoresize="true" style="height: 60px" />
      </div>
    </div>
  </div>
</template>
