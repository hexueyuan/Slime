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

  const cacheRate = computed(() => {
    const input = stats.value.inputTokens;
    if (input === 0) return 0;
    return stats.value.cacheReadTokens / input;
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
    loadChannels,
    loadChannelKeys,
    loadGroups,
    loadApiKeys,
    loadStats,
    loadRecentLogs,
    loadModelsByChannel,
    loadAll,
  };
});

function getDateRange(range: "today" | "7d" | "30d") {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    .toISOString()
    .slice(0, 10);
  let from: string;
  if (range === "today") {
    from = now.toISOString().slice(0, 10);
  } else if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    from = d.toISOString().slice(0, 10);
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  }
  return { from, to };
}
