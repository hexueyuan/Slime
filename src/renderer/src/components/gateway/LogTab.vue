<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import type { RelayLog } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

const gw = usePresenter("gatewayPresenter");

const logs = ref<RelayLog[]>([]);
const expandedId = ref<number | null>(null);
const loading = ref(false);
const hasMore = ref(true);
const PAGE_SIZE = 50;

onMounted(() => loadMore());

async function loadMore() {
  loading.value = true;
  const batch = await gw.getRecentLogs(PAGE_SIZE, logs.value.length);
  logs.value = [...logs.value, ...batch];
  hasMore.value = batch.length === PAGE_SIZE;
  loading.value = false;
}

async function refresh() {
  logs.value = [];
  hasMore.value = true;
  await loadMore();
}

function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  return `${ms}ms`;
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">日志</h3>
      <button
        class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="刷新"
        @click="refresh"
      >
        <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Log table -->
    <div v-if="logs.length" class="space-y-1">
      <div v-for="log in logs" :key="log.id" class="rounded-lg bg-muted/30">
        <!-- Row -->
        <div
          class="flex cursor-pointer items-center gap-3 p-3 text-xs"
          @click="toggleExpand(log.id)"
        >
          <span class="w-28 shrink-0 text-muted-foreground">{{ formatTime(log.createdAt) }}</span>
          <span class="w-28 shrink-0 truncate font-medium">{{ log.modelName }}</span>
          <span class="w-24 shrink-0 truncate text-muted-foreground">{{
            log.channelName ?? "-"
          }}</span>
          <span class="w-24 shrink-0 text-muted-foreground">
            {{ log.inputTokens }} / {{ log.outputTokens }}
          </span>
          <span class="w-16 shrink-0 text-muted-foreground">{{ formatCost(log.cost) }}</span>
          <span class="w-16 shrink-0 text-muted-foreground">{{
            formatDuration(log.durationMs)
          }}</span>
          <span
            :class="[
              'shrink-0 rounded px-1.5 py-0.5 text-xs',
              log.status === 'success'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400',
            ]"
          >
            {{ log.status }}
          </span>
          <Icon
            :icon="expandedId === log.id ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        </div>

        <!-- Expanded detail -->
        <div
          v-if="expandedId === log.id"
          class="border-t border-border px-3 pb-3 pt-2 text-xs text-muted-foreground"
        >
          <div class="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>Group: {{ log.groupName }}</div>
            <div>Channel ID: {{ log.channelId ?? "-" }}</div>
            <div>Input Tokens: {{ log.inputTokens }}</div>
            <div>Output Tokens: {{ log.outputTokens }}</div>
            <div>Cache Read: {{ log.cacheReadTokens }}</div>
            <div>Cache Write: {{ log.cacheWriteTokens }}</div>
            <div>API Key ID: {{ log.apiKeyId ?? "-" }}</div>
            <div>Cost: {{ formatCost(log.cost) }}</div>
          </div>
          <div v-if="log.error" class="mt-2 rounded bg-red-500/10 p-2 text-red-400">
            {{ log.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading" class="py-12 text-center text-sm text-muted-foreground">暂无日志</div>

    <!-- Load more -->
    <div v-if="hasMore && logs.length" class="mt-3 flex justify-center">
      <button
        class="rounded px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? "加载中..." : "加载更多" }}
      </button>
    </div>
  </div>
</template>
