<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { GATEWAY_EVENTS } from "@shared/events";
import ChannelTab from "@/components/gateway/ChannelTab.vue";
import GroupTab from "@/components/gateway/GroupTab.vue";
import ApiKeyTab from "@/components/gateway/ApiKeyTab.vue";
import LogTab from "@/components/gateway/LogTab.vue";
import StatsChart from "@/components/gateway/StatsChart.vue";
import RankBoard from "@/components/gateway/RankBoard.vue";

const store = useGatewayStore();

onMounted(() => {
  store.loadAll();
  store.loadRanking();
  store.loadLatencyPercentiles();
  store.loadStatsTrend();
});

watch(
  () => store.statsRange,
  () => {
    store.loadStats();
    store.loadRanking();
    store.loadLatencyPercentiles();
    store.loadStatsTrend();
  },
);

const cleanup = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  store.loadStats();
});
onUnmounted(() => cleanup?.());

const tabs = [
  { key: "channels" as const, label: "渠道" },
  { key: "groups" as const, label: "分组" },
  { key: "apikeys" as const, label: "接入" },
  { key: "logs" as const, label: "日志" },
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
  { key: "today" as const, label: "今日" },
  { key: "7d" as const, label: "7天" },
  { key: "30d" as const, label: "30天" },
];

type MetricKey = "requests" | "cost" | "tokens";
const activeMetric = ref<MetricKey>("requests");
const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
);
const metricOptions: { key: MetricKey; label: string }[] = [
  { key: "requests", label: "请求" },
  { key: "cost", label: "费用" },
  { key: "tokens", label: "Token" },
];
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Stats cards -->
    <div class="shrink-0 px-4 py-3">
      <div class="mb-3 flex items-center gap-1">
        <button
          v-for="opt in rangeOptions"
          :key="opt.key"
          :class="[
            'rounded px-2 py-0.5 text-xs transition-colors',
            store.statsRange === opt.key
              ? 'bg-violet-600 text-white'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="store.statsRange = opt.key"
        >
          {{ opt.label }}
        </button>
      </div>
      <div class="grid grid-cols-6 gap-2">
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">请求</div>
          <div class="text-lg font-semibold">{{ formatNumber(store.stats.requests) }}</div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">费用</div>
          <div class="text-lg font-semibold">{{ formatCost(store.stats.cost) }}</div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">Input Token</div>
          <div class="text-lg font-semibold">{{ formatNumber(store.stats.inputTokens) }}</div>
          <div class="text-xs text-muted-foreground/60">
            缓存读 {{ formatNumber(store.stats.cacheReadTokens) }}
          </div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">Output Token</div>
          <div class="text-lg font-semibold">{{ formatNumber(store.stats.outputTokens) }}</div>
          <div class="text-xs text-muted-foreground/60">
            缓存写 {{ formatNumber(store.stats.cacheWriteTokens) }}
          </div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">缓存率</div>
          <div class="text-lg font-semibold">{{ formatPercent(store.cacheRate) }}</div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">平均延迟</div>
          <div class="text-lg font-semibold">{{ formatLatency(store.stats.avgLatencyMs) }}</div>
          <div
            v-if="store.latencyPercentiles.ttftP50 !== null"
            class="text-xs text-muted-foreground/60"
          >
            TTFT P50 {{ formatLatency(store.latencyPercentiles.ttftP50 ?? 0) }}
          </div>
        </div>
      </div>

      <!-- Trend chart -->
      <div class="mb-2 mt-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-muted-foreground">趋势</span>
          <div class="flex gap-1">
            <button
              v-for="m in metricOptions"
              :key="m.key"
              :class="[
                'rounded border px-2 py-0.5 text-xs',
                activeMetric === m.key
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
                  : 'border-border text-muted-foreground',
              ]"
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
    </div>

    <!-- Tab bar -->
    <div class="flex shrink-0 border-b border-border">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'px-4 py-2 text-sm transition-colors',
          store.activeTab === tab.key
            ? 'border-b-2 border-violet-500 text-violet-500'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="store.activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="min-h-0 flex-1 overflow-auto">
      <ChannelTab v-if="store.activeTab === 'channels'" />
      <GroupTab v-else-if="store.activeTab === 'groups'" />
      <ApiKeyTab v-else-if="store.activeTab === 'apikeys'" />
      <LogTab v-else-if="store.activeTab === 'logs'" />
    </div>
  </div>
</template>
