import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type {
  Channel,
  ChannelKey,
  Group,
  GatewayApiKey,
  DailyStats,
  RelayLog,
  Model,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  MinutePoint,
  TrendPoint,
} from "@shared/types/gateway";

export const useGatewayStore = defineStore("gateway", () => {
  const gw = usePresenter("gatewayPresenter");

  const channels = ref<Channel[]>([]);
  const channelKeys = ref<Map<number, ChannelKey[]>>(new Map());
  const groups = ref<Group[]>([]);
  const apiKeys = ref<GatewayApiKey[]>([]);
  const stats = ref<DailyStats>({
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
  });
  const recentLogs = ref<RelayLog[]>([]);
  const models = ref<Map<number, Model[]>>(new Map());
  const activeTab = ref<"channels" | "groups" | "apikeys" | "logs">("channels");
  const statsRange = ref<"today" | "7d" | "30d">("today");
  const channelRanking = ref<ChannelRankItem[]>([]);
  const modelRanking = ref<ModelRankItem[]>([]);
  const latencyPercentiles = ref<LatencyPercentiles>({ p50: 0, p95: 0, ttftP50: null });
  const channelStability = ref<Map<number, StabilityPoint[]>>(new Map());
  const channelMinuteStability = ref<Map<number, MinutePoint[]>>(new Map());
  const statsTrend = ref<TrendPoint[]>([]);

  const cacheRate = computed(() => {
    const input = stats.value.inputTokens;
    const cacheRead = stats.value.cacheReadTokens;
    const total = input + cacheRead;
    if (total === 0) return 0;
    return cacheRead / total;
  });

  async function loadChannels() {
    channels.value = await gw.listChannels();
  }

  async function loadChannelKeys(channelId: number) {
    const keys = await gw.listChannelKeys(channelId);
    channelKeys.value = new Map(channelKeys.value).set(channelId, keys);
  }

  async function loadGroups() {
    groups.value = await gw.listGroups();
  }

  async function loadApiKeys() {
    apiKeys.value = await gw.listApiKeys();
  }

  async function loadStats() {
    const { from, to } = getDateRange(statsRange.value);
    stats.value = await gw.getStatsRange(from, to);
  }

  async function loadRecentLogs() {
    recentLogs.value = await gw.getRecentLogs(50, 0);
  }

  async function loadModelsByChannel(channelId: number) {
    const list = await gw.listModelsByChannel(channelId);
    models.value = new Map(models.value).set(channelId, list);
  }

  async function loadAll() {
    await Promise.all([loadChannels(), loadGroups(), loadApiKeys(), loadStats()]);
  }

  async function loadRanking() {
    const { from, to } = getDateRange(statsRange.value);
    const [ch, mo] = await Promise.all([
      gw.getChannelRanking(from, to),
      gw.getModelRanking(from, to),
    ]);
    channelRanking.value = ch;
    modelRanking.value = mo;
  }

  async function loadLatencyPercentiles() {
    if (statsRange.value === "30d") {
      latencyPercentiles.value = { p50: 0, p95: 0, ttftP50: null };
      return;
    }
    const { from, to } = getDateRange(statsRange.value);
    latencyPercentiles.value = await gw.getLatencyPercentiles(from, to);
  }

  async function loadChannelStability(channelId: number) {
    const now = new Date();
    const fmt = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const to = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const from = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const points = await gw.getChannelStability(channelId, from, to);
    channelStability.value = new Map(channelStability.value).set(channelId, points);
  }

  async function loadChannelMinuteStability(channelId: number) {
    const points = await gw.getChannelMinuteStability(channelId);
    channelMinuteStability.value = new Map(channelMinuteStability.value).set(channelId, points);
  }

  async function loadStatsTrend() {
    const { from, to } = getDateRange(statsRange.value);
    if (statsRange.value === "today") {
      statsTrend.value = await gw.getStatsHourlyTrend(from, to);
    } else {
      statsTrend.value = await gw.getStatsDailyTrend(from, to);
    }
  }

  return {
    channels,
    channelKeys,
    groups,
    apiKeys,
    stats,
    recentLogs,
    models,
    activeTab,
    statsRange,
    cacheRate,
    channelRanking,
    modelRanking,
    latencyPercentiles,
    channelStability,
    channelMinuteStability,
    statsTrend,
    loadChannels,
    loadChannelKeys,
    loadGroups,
    loadApiKeys,
    loadStats,
    loadRecentLogs,
    loadModelsByChannel,
    loadAll,
    loadRanking,
    loadLatencyPercentiles,
    loadChannelStability,
    loadChannelMinuteStability,
    loadStatsTrend,
  };
});

function getDateRange(range: "today" | "7d" | "30d") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const to = fmt(new Date(y, m, d + 1));
  let from: string;
  if (range === "today") {
    from = fmt(new Date(y, m, d));
  } else if (range === "7d") {
    from = fmt(new Date(y, m, d - 7));
  } else {
    from = fmt(new Date(y, m, d - 30));
  }
  return { from, to };
}
