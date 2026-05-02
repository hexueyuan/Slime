# Gateway Dashboard UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 LLM Gateway Dashboard 的统计卡片颜色标记、趋势图合并多线单图、布局紧凑化。

**Architecture:** 仅修改两个文件：`StatsChart.vue` 重写为固定 4 线无 metric prop 的组件，`GatewayPanel.vue` 更新卡片颜色、移除 metric tab、调整趋势图+RankBoard 为同行布局。

**Tech Stack:** Vue 3, ECharts + vue-echarts, TailwindCSS

---

## File Map

| 操作 | 文件 |
|------|------|
| Modify | `src/renderer/src/components/gateway/StatsChart.vue` |
| Modify | `src/renderer/src/views/GatewayPanel.vue` |

---

### Task 1: 改造 StatsChart.vue

**Files:**
- Modify: `src/renderer/src/components/gateway/StatsChart.vue`

- [ ] **Step 1: 完整替换 StatsChart.vue**

将文件内容替换为以下（移除 `metric` prop，固定 4 线，Y 轴无数字，tooltip 带单位）：

```vue
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
    formatter(params: { seriesName: string; value: number; color: string }[]) {
      return params
        .map((p) => {
          const cfg = SERIES_CONFIG.find((s) => s.name === p.seriesName)!;
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:4px;"></span>`;
          return `${dot}${p.seriesName}: ${formatVal(cfg.key, p.value)}`;
        })
        .join("<br/>");
    },
  },
  series: SERIES_CONFIG.map((cfg) => ({
    name: cfg.name,
    type: "line",
    data: props.points.map((p) =>
      cfg.key === "cost" ? Number(p[cfg.key].toFixed(4)) : p[cfg.key],
    ),
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
```

- [ ] **Step 2: 确认类型兼容**

检查 `TrendPoint` 类型包含 `requests`、`cost`、`inputTokens`、`outputTokens`、`date`、`hour?` 字段（在 `src/shared/types/gateway.d.ts` 中已有，无需修改）。

- [ ] **Step 3: 运行类型检查**

```bash
pnpm run typecheck
```

期望：无错误（或仅有其他无关错误）。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/gateway/StatsChart.vue
git commit -m "feat(gateway): refactor StatsChart to 4-line combined chart"
```

---

### Task 2: 更新 GatewayPanel.vue — 卡片颜色 + 移除 metric tab + 布局调整

**Files:**
- Modify: `src/renderer/src/views/GatewayPanel.vue`

- [ ] **Step 1: 移除 script 中的 metric 相关代码**

删除以下行（约第 68-78 行）：

```ts
// 删除这些：
type MetricKey = "requests" | "cost" | "tokens" | "cachedTokens";
const activeMetric = ref<MetricKey>("requests");
const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
);
const metricOptions: { key: MetricKey; label: string }[] = [
  { key: "requests", label: "请求" },
  { key: "cost", label: "费用" },
  { key: "tokens", label: "Token" },
  { key: "cachedTokens", label: "缓存Token" },
];
```

只保留 `trendGranularity`（移除 metric tab 后仍需传给 StatsChart）：

```ts
const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
);
```

同时从 `import` 中移除 `ref`（如果 `activeMetric` 是唯一用到 `ref` 的地方；检查其他 ref 用法，若有则保留）。

- [ ] **Step 2: 更新 6 个统计卡片数值的颜色类**

在 template 中，将 6 个卡片的 `text-lg font-semibold` 分别改为带颜色的版本：

```html
<!-- 请求 -->
<div class="text-lg font-semibold text-violet-400">{{ formatNumber(store.stats.requests) }}</div>

<!-- 费用 -->
<div class="text-lg font-semibold text-amber-400">{{ formatCost(store.stats.cost) }}</div>

<!-- Input Token -->
<div class="text-lg font-semibold text-blue-400">{{ formatNumber(store.stats.inputTokens) }}</div>

<!-- Output Token -->
<div class="text-lg font-semibold text-emerald-400">{{ formatNumber(store.stats.outputTokens) }}</div>

<!-- 缓存率 -->
<div class="text-lg font-semibold text-cyan-400">{{ formatPercent(store.cacheRate) }}</div>

<!-- 平均延迟 -->
<div class="text-lg font-semibold text-rose-400">{{ formatLatency(store.stats.avgLatencyMs) }}</div>
```

- [ ] **Step 3: 替换趋势图区域 + RankBoard 为同行布局**

将原来的两个独立区块：

```html
<!-- Trend chart -->
<div class="mb-2 mt-3">
  <div class="mb-1 flex items-center justify-between">
    <span class="text-xs text-muted-foreground">趋势</span>
    <div class="flex gap-1">
      <button
        v-for="m in metricOptions"
        :key="m.key"
        :class="[...]"
        @click="activeMetric = m.key"
      >
        {{ m.label }}
      </button>
    </div>
  </div>
  <StatsChart
    :points="store.statsTrend"
    :metric="activeMetric"
    :granularity="trendGranularity"
  />
</div>

<!-- Rank board -->
<div class="mb-2">
  <RankBoard :channel-ranking="store.channelRanking" :model-ranking="store.modelRanking" />
</div>
```

替换为：

```html
<!-- Trend chart + Rank board 同行 -->
<div class="mt-3 mb-2 flex h-[175px] flex-row gap-3">
  <div class="flex min-w-0 flex-1 flex-col">
    <span class="mb-1 shrink-0 text-xs text-muted-foreground">趋势</span>
    <div class="min-h-0 flex-1">
      <StatsChart
        :points="store.statsTrend"
        :granularity="trendGranularity"
      />
    </div>
  </div>
  <div class="w-[220px] shrink-0 overflow-y-auto">
    <RankBoard :channel-ranking="store.channelRanking" :model-ranking="store.modelRanking" />
  </div>
</div>
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

期望：无新增错误。

- [ ] **Step 5: 运行 lint + format**

```bash
pnpm run lint && pnpm run format
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/views/GatewayPanel.vue
git commit -m "feat(gateway): update dashboard card colors, combined trend chart layout"
```
