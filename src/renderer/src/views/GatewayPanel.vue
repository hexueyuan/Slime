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

const store = useGatewayStore();
const ChannelTab = defineAsyncComponent(() => import("@/components/gateway/ChannelTab.vue"));
const GroupTab = defineAsyncComponent(() => import("@/components/gateway/GroupTab.vue"));
const ApiKeyTab = defineAsyncComponent(() => import("@/components/gateway/ApiKeyTab.vue"));
const LogTab = defineAsyncComponent(() => import("@/components/gateway/LogTab.vue"));
const StatsChart = defineAsyncComponent(() => import("@/components/gateway/StatsChart.vue"));
const RankBoard = defineAsyncComponent(() => import("@/components/gateway/RankBoard.vue"));
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

const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
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
      <div class="grid grid-cols-6 gap-2">
        <div
          class="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
        >
          <div class="text-xs text-[var(--color-text-muted)]">请求</div>
          <div class="text-lg font-semibold text-[var(--color-accent-brand-hover)]">
            {{ formatNumber(store.stats.requests) }}
          </div>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-amber-400/15 bg-amber-500/10 p-3">
          <div class="text-xs text-[var(--color-text-muted)]">费用</div>
          <div class="text-lg font-semibold text-[var(--color-warning)]">
            {{ formatCost(store.stats.cost) }}
          </div>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-sky-400/15 bg-sky-500/10 p-3">
          <div class="text-xs text-[var(--color-text-muted)]">Input Token</div>
          <div class="text-lg font-semibold text-sky-300">
            {{ formatNumber(store.stats.inputTokens) }}
          </div>
          <div class="text-xs text-[var(--color-text-muted)]">
            缓存读 {{ formatNumber(store.stats.cacheReadTokens) }}
          </div>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-emerald-400/15 bg-emerald-500/10 p-3">
          <div class="text-xs text-[var(--color-text-muted)]">Output Token</div>
          <div class="text-lg font-semibold text-[var(--color-success)]">
            {{ formatNumber(store.stats.outputTokens) }}
          </div>
          <div class="text-xs text-[var(--color-text-muted)]">
            缓存写 {{ formatNumber(store.stats.cacheWriteTokens) }}
          </div>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-cyan-400/15 bg-cyan-500/10 p-3">
          <div class="text-xs text-[var(--color-text-muted)]">缓存率</div>
          <div class="text-lg font-semibold text-cyan-300">
            {{ formatPercent(store.cacheRate) }}
          </div>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-red-400/15 bg-red-500/10 p-3">
          <div class="text-xs text-[var(--color-text-muted)]">平均延迟</div>
          <div class="text-lg font-semibold text-[var(--color-danger)]">
            {{ formatLatency(store.stats.avgLatencyMs) }}
          </div>
          <div
            v-if="store.latencyPercentiles.ttftP50 !== null"
            class="text-xs text-[var(--color-text-muted)]"
          >
            TTFT P50 {{ formatLatency(store.latencyPercentiles.ttftP50 ?? 0) }}
          </div>
        </div>
      </div>

      <!-- Trend chart + Rank board 同行 -->
      <div class="mb-2 mt-3 flex h-[175px] flex-row gap-3">
        <div
          class="flex min-w-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
        >
          <span class="mb-2 shrink-0 text-xs font-medium text-[var(--color-text-secondary)]"
            >趋势</span
          >
          <div class="min-h-0 flex-1">
            <StatsChart
              v-if="metricsLoaded"
              :points="store.statsTrend"
              :granularity="trendGranularity"
              :range="store.statsRange"
            />
            <div v-else class="h-full rounded-[var(--radius-md)] bg-[var(--color-control-hover)]" />
          </div>
        </div>
        <div
          class="w-[40%] shrink-0 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-3"
        >
          <RankBoard
            v-if="metricsLoaded"
            :channel-ranking="store.channelRanking"
            :model-ranking="store.modelRanking"
          />
          <div v-else class="h-full rounded-[var(--radius-md)] bg-[var(--color-control-hover)]" />
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
