<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useGatewayStore } from "@/stores/gateway";
import { GATEWAY_EVENTS } from "@shared/events";
import ChannelTab from "@/components/gateway/ChannelTab.vue";
import GroupTab from "@/components/gateway/GroupTab.vue";
import ApiKeyTab from "@/components/gateway/ApiKeyTab.vue";
import LogTab from "@/components/gateway/LogTab.vue";

const store = useGatewayStore();

onMounted(() => store.loadAll());
watch(
  () => store.statsRange,
  () => store.loadStats(),
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

const rangeOptions = [
  { key: "today" as const, label: "今日" },
  { key: "7d" as const, label: "7天" },
  { key: "30d" as const, label: "30天" },
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
      <div class="grid grid-cols-4 gap-3">
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">请求</div>
          <div class="text-lg font-semibold">{{ formatNumber(store.stats.requests) }}</div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">Token</div>
          <div class="text-lg font-semibold">
            {{ formatNumber(store.stats.inputTokens + store.stats.outputTokens) }}
          </div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">费用</div>
          <div class="text-lg font-semibold">{{ formatCost(store.stats.cost) }}</div>
        </div>
        <div class="rounded-lg bg-muted/50 p-3">
          <div class="text-xs text-muted-foreground">缓存</div>
          <div class="text-lg font-semibold">{{ formatPercent(store.cacheRate) }}</div>
        </div>
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
