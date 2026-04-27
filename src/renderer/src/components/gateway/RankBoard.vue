<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChannelRankItem, ModelRankItem } from "@shared/types/gateway";

const props = defineProps<{
  channelRanking: ChannelRankItem[];
  modelRanking: ModelRankItem[];
}>();

type Tab = "channels" | "models";
type SortKey = "requests" | "cost" | "tokens";

const activeTab = ref<Tab>("channels");
const sortKey = ref<SortKey>("requests");

function successRateClass(item: ChannelRankItem): string {
  const total = item.successCount + item.failCount;
  if (total === 0) return "text-muted-foreground";
  const rate = item.successCount / total;
  if (rate >= 0.95) return "text-emerald-400";
  if (rate >= 0.8) return "text-amber-400";
  return "text-red-400";
}

function successRateText(item: ChannelRankItem): string {
  const total = item.successCount + item.failCount;
  if (total === 0) return "-";
  return `${((item.successCount / total) * 100).toFixed(1)}%`;
}

const maxChannelVal = computed(() => {
  if (props.channelRanking.length === 0) return 1;
  return Math.max(...props.channelRanking.map((r) => r.requests));
});

const sortedChannels = computed(() => {
  return [...props.channelRanking].sort((a, b) => {
    if (sortKey.value === "cost") return b.cost - a.cost;
    if (sortKey.value === "tokens") return 0; // channels don't have direct token field
    return b.requests - a.requests;
  });
});

const maxModelVal = computed(() => {
  if (props.modelRanking.length === 0) return 1;
  if (sortKey.value === "cost") return Math.max(...props.modelRanking.map((r) => r.cost));
  if (sortKey.value === "tokens")
    return Math.max(...props.modelRanking.map((r) => r.inputTokens + r.outputTokens));
  return Math.max(...props.modelRanking.map((r) => r.requests));
});

const sortedModels = computed(() => {
  return [...props.modelRanking].sort((a, b) => {
    if (sortKey.value === "cost") return b.cost - a.cost;
    if (sortKey.value === "tokens")
      return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
    return b.requests - a.requests;
  });
});

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <div class="flex gap-1">
        <button
          v-for="tab in ['channels', 'models'] as Tab[]"
          :key="tab"
          :class="[
            'rounded border px-2 py-0.5 text-xs',
            activeTab === tab
              ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
              : 'border-border text-muted-foreground',
          ]"
          @click="activeTab = tab"
        >
          {{ tab === "channels" ? "渠道" : "模型" }}
        </button>
      </div>
      <div class="flex gap-1">
        <button
          v-for="key in ['requests', 'cost', 'tokens'] as SortKey[]"
          :key="key"
          :class="[
            'rounded px-2 py-0.5 text-xs',
            sortKey === key ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground/60',
          ]"
          @click="sortKey = key"
        >
          {{ key === "requests" ? "请求" : key === "cost" ? "费用" : "Token" }}
        </button>
      </div>
    </div>

    <!-- Channel ranking -->
    <template v-if="activeTab === 'channels'">
      <div
        v-for="(item, idx) in sortedChannels.slice(0, 5)"
        :key="item.channelId"
        class="mb-1.5 flex items-center gap-2"
      >
        <span
          :class="[
            'w-4 text-xs',
            idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50',
          ]"
        >
          {{ idx + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 flex items-center justify-between gap-1">
            <span class="truncate text-xs text-foreground/80">{{ item.channelName }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{
              formatNum(item.requests)
            }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="h-1 flex-1 rounded-full bg-muted/50">
              <div
                class="h-1 rounded-full bg-violet-500/60"
                :style="{ width: `${(item.requests / maxChannelVal) * 100}%` }"
              />
            </div>
            <span :class="['text-xs', successRateClass(item)]">{{ successRateText(item) }}</span>
          </div>
        </div>
      </div>
      <div
        v-if="sortedChannels.length === 0"
        class="py-4 text-center text-xs text-muted-foreground"
      >
        暂无数据
      </div>
    </template>

    <!-- Model ranking -->
    <template v-else>
      <div
        v-for="(item, idx) in sortedModels.slice(0, 5)"
        :key="item.modelName"
        class="mb-1.5 flex items-center gap-2"
      >
        <span
          :class="[
            'w-4 text-xs',
            idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50',
          ]"
        >
          {{ idx + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 flex items-center justify-between gap-1">
            <span class="truncate text-xs text-foreground/80">{{ item.modelName }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{
                sortKey === "cost"
                  ? `$${item.cost.toFixed(3)}`
                  : formatNum(
                      sortKey === "tokens" ? item.inputTokens + item.outputTokens : item.requests,
                    )
              }}
            </span>
          </div>
          <div class="h-1 flex-1 rounded-full bg-muted/50">
            <div
              class="h-1 rounded-full bg-blue-500/60"
              :style="{
                width: `${((sortKey === 'cost' ? item.cost : sortKey === 'tokens' ? item.inputTokens + item.outputTokens : item.requests) / maxModelVal) * 100}%`,
              }"
            />
          </div>
        </div>
      </div>
      <div v-if="sortedModels.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无数据
      </div>
    </template>
  </div>
</template>
