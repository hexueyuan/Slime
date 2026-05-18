<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onActivated,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { GATEWAY_EVENTS } from "@shared/events";
import { createGatewayRefreshScheduler } from "@/composables/useGatewayRefreshScheduler";
import PageHeader from "@/components/layout/PageHeader.vue";
import SlimeTabs from "@/components/ui/SlimeTabs.vue";
import SlimeMetricCard from "@/components/slime/SlimeMetricCard.vue";
import SlimeRealtimeChart from "@/components/slime/SlimeRealtimeChart.vue";
import SlimeRankBoard from "@/components/slime/SlimeRankBoard.vue";

const store = useGatewayStore();
const ChannelTab = defineAsyncComponent(() => import("@/components/gateway/ChannelTab.vue"));
const GroupTab = defineAsyncComponent(() => import("@/components/gateway/GroupTab.vue"));
const ApiKeyTab = defineAsyncComponent(() => import("@/components/gateway/ApiKeyTab.vue"));
const LogTab = defineAsyncComponent(() => import("@/components/gateway/LogTab.vue"));
const metricsLoaded = ref(false);
const statsRefresh = createGatewayRefreshScheduler(() => store.loadStats(), {
  debounceMs: 800,
  minIntervalMs: 2_000,
});
let metricsTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMetricsLoad(force = false) {
  if (metricsTimer) clearTimeout(metricsTimer);
  metricsTimer = setTimeout(async () => {
    await Promise.all([
      store.loadRanking(force),
      store.loadLatencyPercentiles(force),
      store.loadStatsTrend(force),
    ]);
    metricsLoaded.value = true;
    metricsTimer = null;
  }, 160);
}

onMounted(() => {
  store.loadAll();
  scheduleMetricsLoad();
});

onActivated(() => {
  // KeepAlive re-activate: skip if cache still fresh
  store.loadAll();
  scheduleMetricsLoad();
});

watch(
  () => store.statsRange,
  () => {
    store.loadStats();
    metricsLoaded.value = false;
    scheduleMetricsLoad(true);
  },
);

const cleanup = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  statsRefresh.request();
});
onUnmounted(() => {
  cleanup?.();
  statsRefresh.dispose();
  if (metricsTimer) clearTimeout(metricsTimer);
});

const tabs = [
  { value: "channels" as const, label: "供应商" },
  { value: "groups" as const, label: "分组" },
  { value: "apikeys" as const, label: "密钥" },
  { value: "logs" as const, label: "日志" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function formatLatency(ms: number | undefined): string {
  if (!ms) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

const rangeOptions = [
  { value: "today" as const, label: "今日" },
  { value: "7d" as const, label: "7天" },
  { value: "30d" as const, label: "30天" },
];

const rankMetrics = [
  { value: "requests", label: "请求" },
  { value: "cost", label: "费用" },
  { value: "tokens", label: "Token" },
];

const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
);

function trendValues(key: "requests" | "cost" | "inputTokens" | "outputTokens"): number[] {
  return store.statsTrend.map((point) => point[key] ?? 0);
}

const metricCards = computed(() => [
  {
    label: "请求",
    value: formatNumber(store.stats.requests),
    tone: "accent" as const,
  },
  {
    label: "费用",
    value: formatCost(store.stats.cost),
    tone: "warning" as const,
  },
  {
    label: "Input Token",
    value: formatNumber(store.stats.inputTokens),
    meta: `缓存读 ${formatNumber(store.stats.cacheReadTokens)}`,
    tone: "blue" as const,
  },
  {
    label: "Output Token",
    value: formatNumber(store.stats.outputTokens),
    meta: `缓存写 ${formatNumber(store.stats.cacheWriteTokens)}`,
    tone: "success" as const,
  },
  {
    label: "缓存率",
    value: formatPercent(store.cacheRate),
    tone: "blue" as const,
  },
  {
    label: "平均延迟",
    value: formatLatency(store.stats.avgLatencyMs),
    meta:
      store.latencyPercentiles.ttftP50 !== null
        ? `TTFT P50 ${formatLatency(store.latencyPercentiles.ttftP50 ?? 0)}`
        : "",
    tone: "danger" as const,
  },
]);

const trendMetrics = computed(() => [
  {
    id: "requests",
    label: "请求",
    value: formatNumber(store.stats.requests),
    color: "accent" as const,
    points: trendValues("requests"),
  },
  {
    id: "cost",
    label: "费用",
    value: formatCost(store.stats.cost),
    color: "warning" as const,
    points: trendValues("cost"),
  },
  {
    id: "inputTokens",
    label: "Input",
    value: formatNumber(store.stats.inputTokens),
    color: "blue" as const,
    points: trendValues("inputTokens"),
  },
  {
    id: "outputTokens",
    label: "Output",
    value: formatNumber(store.stats.outputTokens),
    color: "success" as const,
    points: trendValues("outputTokens"),
  },
]);

const channelRankItems = computed(() =>
  store.channelRanking.map((item) => ({
    id: item.channelId,
    label: item.channelName,
    values: {
      requests: formatNumber(item.requests),
      cost: `$${item.cost.toFixed(3)}`,
      tokens: formatNumber(item.cacheReadTokens + item.cacheWriteTokens),
    },
    sortValues: {
      requests: item.requests,
      cost: item.cost,
      tokens: item.cacheReadTokens + item.cacheWriteTokens,
    },
  })),
);

const modelRankItems = computed(() =>
  store.modelRanking.map((item) => ({
    id: item.modelName,
    label: item.modelName,
    values: {
      requests: formatNumber(item.requests),
      cost: `$${item.cost.toFixed(3)}`,
      tokens: formatNumber(item.inputTokens + item.outputTokens),
    },
    sortValues: {
      requests: item.requests,
      cost: item.cost,
      tokens: item.inputTokens + item.outputTokens,
    },
  })),
);
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--color-app-canvas)]">
    <PageHeader title="Gateway" subtitle="路由、密钥、日志与运行指标">
      <template #actions>
        <SlimeTabs v-model="store.statsRange" :tabs="rangeOptions" />
      </template>
    </PageHeader>

    <!-- Stats cards -->
    <div class="shrink-0 px-5 py-4">
      <div class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2">
        <SlimeMetricCard
          v-for="card in metricCards"
          :key="card.label"
          :label="card.label"
          :value="card.value"
          :meta="card.meta"
          :tone="card.tone"
        />
      </div>

      <!-- Trend chart + Rank board 同行 -->
      <div
        class="mb-2 mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
      >
        <SlimeRealtimeChart
          v-if="metricsLoaded"
          title="趋势"
          :subtitle="trendGranularity === 'hourly' ? '按小时统计' : '按天统计'"
          :metrics="trendMetrics"
        />
        <div v-else class="h-[193px] rounded-[var(--radius-lg)] bg-[var(--color-control-hover)]" />
        <div class="grid min-w-0 gap-3">
          <SlimeRankBoard title="供应商排名" :items="channelRankItems" :metrics="rankMetrics" />
          <SlimeRankBoard title="模型排名" :items="modelRankItems" :metrics="rankMetrics" />
        </div>
      </div>
    </div>

    <!-- Tab bar -->
    <div class="flex shrink-0 border-b border-[var(--color-border-subtle)] px-5 pb-3">
      <SlimeTabs v-model="store.activeTab" :tabs="tabs" />
    </div>

    <!-- Tab content -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <ChannelTab v-if="store.activeTab === 'channels'" />
      <GroupTab v-else-if="store.activeTab === 'groups'" />
      <ApiKeyTab v-else-if="store.activeTab === 'apikeys'" />
      <LogTab v-else-if="store.activeTab === 'logs'" />
    </div>
  </div>
</template>
