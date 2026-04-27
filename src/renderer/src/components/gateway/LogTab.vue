<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import type { RelayLog } from "@shared/types/gateway";
import { GATEWAY_EVENTS } from "@shared/events";
import { Icon } from "@iconify/vue";
import ModelIcon from "@/components/ModelIcon.vue";

const gw = usePresenter("gatewayPresenter");

const logs = ref<RelayLog[]>([]);
const loading = ref(false);
const hasMore = ref(true);
const PAGE_SIZE = 50;

// Drawer state
const drawerOpen = ref(false);
const drawerLog = ref<RelayLog | null>(null);
const drawerLoading = ref(false);
const activeTab = ref<"request" | "response">("request");

onMounted(() => loadMore());

const cleanup = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  refresh();
});
onUnmounted(() => cleanup?.());

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

async function openDetail(log: RelayLog) {
  drawerOpen.value = true;
  drawerLoading.value = true;
  drawerLog.value = null;
  activeTab.value = "request";
  const detail = await gw.getLogDetail(log.id);
  drawerLog.value = detail ?? log;
  drawerLoading.value = false;
}

function closeDrawer() {
  drawerOpen.value = false;
  drawerLog.value = null;
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

function formatJson(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
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
      <div
        v-for="log in logs"
        :key="log.id"
        class="cursor-pointer rounded-lg bg-muted/30 transition-colors hover:bg-muted/50"
        @click="openDetail(log)"
      >
        <div class="flex items-center gap-3 p-3 text-xs">
          <span class="w-28 shrink-0 text-muted-foreground">{{ formatTime(log.createdAt) }}</span>
          <span class="flex w-28 shrink-0 items-center gap-1.5 truncate font-medium">
            <ModelIcon :model-name="log.modelName" :size="16" />
            {{ log.modelName }}
          </span>
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

    <!-- Detail Drawer -->
    <Teleport to="body">
      <div v-if="drawerOpen" class="fixed inset-0 z-50 flex">
        <!-- Overlay -->
        <div class="flex-1 bg-black/50" @click="closeDrawer" />
        <!-- Drawer panel -->
        <div class="flex h-full w-[50vw] flex-col border-l border-border bg-card shadow-xl">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 class="text-sm font-medium">日志详情</h3>
            <button
              class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              @click="closeDrawer"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="drawerLoading" class="flex flex-1 items-center justify-center">
            <Icon icon="lucide:loader-2" class="h-5 w-5 animate-spin text-muted-foreground" />
          </div>

          <!-- Content -->
          <div v-else-if="drawerLog" class="flex flex-1 flex-col overflow-hidden">
            <!-- Meta -->
            <div class="space-y-2 border-b border-border px-4 py-3 text-xs">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5 font-medium">
                  <ModelIcon :model-name="drawerLog.modelName" :size="18" />
                  {{ drawerLog.modelName }}
                </span>
                <span
                  :class="[
                    'rounded px-1.5 py-0.5',
                    drawerLog.status === 'success'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400',
                  ]"
                >
                  {{ drawerLog.status }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <div>渠道: {{ drawerLog.channelName ?? "-" }}</div>
                <div>耗时: {{ formatDuration(drawerLog.durationMs) }}</div>
                <div>Tokens: {{ drawerLog.inputTokens }} in / {{ drawerLog.outputTokens }} out</div>
                <div>费用: {{ formatCost(drawerLog.cost) }}</div>
                <div>Group: {{ drawerLog.groupName }}</div>
                <div>API Key ID: {{ drawerLog.apiKeyId ?? "-" }}</div>
                <div>Cache Read: {{ drawerLog.cacheReadTokens }}</div>
                <div>Cache Write: {{ drawerLog.cacheWriteTokens }}</div>
              </div>
              <!-- Error -->
              <div v-if="drawerLog.error" class="rounded bg-red-500/10 p-2 text-red-400">
                {{ drawerLog.error }}
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-border px-4 text-xs">
              <button
                :class="[
                  'border-b-2 px-3 py-2 transition-colors',
                  activeTab === 'request'
                    ? 'border-violet-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
                @click="activeTab = 'request'"
              >
                请求
              </button>
              <button
                :class="[
                  'border-b-2 px-3 py-2 transition-colors',
                  activeTab === 'response'
                    ? 'border-violet-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
                @click="activeTab = 'response'"
              >
                响应
              </button>
            </div>

            <!-- Body content -->
            <div class="flex-1 overflow-auto p-4">
              <template v-if="activeTab === 'request'">
                <pre
                  v-if="drawerLog.requestBody"
                  class="whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground"
                  >{{ formatJson(drawerLog.requestBody) }}</pre
                >
                <div v-else class="py-8 text-center text-sm text-muted-foreground">无内容</div>
              </template>
              <template v-else>
                <pre
                  v-if="drawerLog.responseBody"
                  class="whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground"
                  >{{ formatJson(drawerLog.responseBody) }}</pre
                >
                <div v-else class="py-8 text-center text-sm text-muted-foreground">无内容</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
