<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChannelRankItem, ModelRankItem } from "@shared/types/gateway";

const props = defineProps<{
  channelRanking: ChannelRankItem[];
  modelRanking: ModelRankItem[];
}>();

type SortKey = "requests" | "cost" | "tokens";
const channelSortKey = ref<SortKey>("requests");
const modelSortKey = ref<SortKey>("requests");

const sortedChannels = computed(() => {
  return [...props.channelRanking].sort((a, b) => {
    if (channelSortKey.value === "cost") return b.cost - a.cost;
    if (channelSortKey.value === "tokens")
      return b.cacheReadTokens + b.cacheWriteTokens - (a.cacheReadTokens + a.cacheWriteTokens);
    return b.requests - a.requests;
  });
});

const sortedModels = computed(() => {
  return [...props.modelRanking].sort((a, b) => {
    if (modelSortKey.value === "cost") return b.cost - a.cost;
    if (modelSortKey.value === "tokens")
      return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
    return b.requests - a.requests;
  });
});

function channelVal(item: ChannelRankItem): string {
  if (channelSortKey.value === "cost") return `$${item.cost.toFixed(3)}`;
  if (channelSortKey.value === "tokens")
    return formatNum(item.cacheReadTokens + item.cacheWriteTokens);
  return formatNum(item.requests);
}

function modelVal(item: ModelRankItem): string {
  if (modelSortKey.value === "cost") return `$${item.cost.toFixed(3)}`;
  if (modelSortKey.value === "tokens") return formatNum(item.inputTokens + item.outputTokens);
  return formatNum(item.requests);
}

function sortLabel(key: SortKey): string {
  return key === "requests" ? "请求" : key === "cost" ? "费用" : "Token";
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header row: 供应商排名 | 模型排名 -->
    <div class="mb-1 flex shrink-0 items-center">
      <span class="flex-1 text-xs text-muted-foreground">供应商排名</span>
      <span class="text-xs text-muted-foreground">模型排名</span>
    </div>

    <!-- Two columns -->
    <div class="flex min-h-0 flex-1 gap-3 overflow-y-auto">
      <!-- Channel ranking -->
      <div class="min-w-0 flex-1">
        <!-- Sort tabs -->
        <div class="mb-1 flex justify-center gap-1">
          <button
            v-for="key in ['requests', 'cost', 'tokens'] as SortKey[]"
            :key="key"
            :class="[
              'rounded px-1.5 py-0 text-[10px] transition-colors',
              channelSortKey === key
                ? 'text-violet-400'
                : 'text-muted-foreground/40 hover:text-muted-foreground/70',
            ]"
            @click="channelSortKey = key"
          >
            {{ sortLabel(key) }}{{ channelSortKey === key ? "↓" : "" }}
          </button>
        </div>
        <!-- Column header -->
        <div class="mb-1.5 flex items-center border-b border-border/30 pb-1">
          <span class="flex-1 text-[10px] text-muted-foreground/50">名称</span>
          <span class="text-[10px] text-muted-foreground/50">{{ sortLabel(channelSortKey) }}↓</span>
        </div>
        <div
          v-for="(item, idx) in sortedChannels.slice(0, 5)"
          :key="item.channelId"
          class="mb-1.5 flex items-center gap-1.5"
        >
          <span
            :class="[
              'w-4 shrink-0 text-xs',
              idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50',
            ]"
          >
            {{ idx + 1 }}
          </span>
          <span class="min-w-0 flex-1 truncate text-xs text-foreground/80">{{
            item.channelName
          }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ channelVal(item) }}</span>
        </div>
        <div
          v-if="sortedChannels.length === 0"
          class="py-4 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </div>
      </div>

      <div class="w-px shrink-0 bg-border/40" />

      <!-- Model ranking -->
      <div class="min-w-0 flex-1">
        <!-- Sort tabs -->
        <div class="mb-1 flex justify-center gap-1">
          <button
            v-for="key in ['requests', 'cost', 'tokens'] as SortKey[]"
            :key="key"
            :class="[
              'rounded px-1.5 py-0 text-[10px] transition-colors',
              modelSortKey === key
                ? 'text-violet-400'
                : 'text-muted-foreground/40 hover:text-muted-foreground/70',
            ]"
            @click="modelSortKey = key"
          >
            {{ sortLabel(key) }}{{ modelSortKey === key ? "↓" : "" }}
          </button>
        </div>
        <!-- Column header -->
        <div class="mb-1.5 flex items-center border-b border-border/30 pb-1">
          <span class="flex-1 text-[10px] text-muted-foreground/50">名称</span>
          <span class="text-[10px] text-muted-foreground/50">{{ sortLabel(modelSortKey) }}↓</span>
        </div>
        <div
          v-for="(item, idx) in sortedModels.slice(0, 5)"
          :key="item.modelName"
          class="mb-1.5 flex items-center gap-1.5"
        >
          <span
            :class="[
              'w-4 shrink-0 text-xs',
              idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50',
            ]"
          >
            {{ idx + 1 }}
          </span>
          <span class="min-w-0 flex-1 truncate text-xs text-foreground/80">{{
            item.modelName
          }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{{ modelVal(item) }}</span>
        </div>
        <div
          v-if="sortedModels.length === 0"
          class="py-4 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </div>
      </div>
    </div>
  </div>
</template>
