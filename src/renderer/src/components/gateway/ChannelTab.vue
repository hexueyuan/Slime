<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, ChannelType } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";
import ChannelRealtimeChart from "@/components/gateway/ChannelRealtimeChart.vue";
import ModelManagerDialog from "@/components/gateway/ModelManagerDialog.vue";
import { GATEWAY_EVENTS } from "@shared/events";
import { createGatewayRefreshScheduler } from "@/composables/useGatewayRefreshScheduler";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingChannel = ref<Channel | null>(null);
const selectedChannelId = ref<number | null>(null);
const modelManagerChannel = ref<Channel | null>(null);
const testResults = ref<Map<number, { loading: boolean; success?: boolean; error?: string }>>(
  new Map(),
);

// Editor form state
const form = ref({
  name: "",
  type: "openai" as ChannelType,
  baseUrl: "",
  enabled: true,
  keys: [] as string[],
});

const typeOptions: { value: ChannelType; label: string; defaultUrl: string }[] = [
  { value: "anthropic", label: "Anthropic", defaultUrl: "https://api.anthropic.com" },
  { value: "openai", label: "OpenAI", defaultUrl: "https://api.openai.com" },
  { value: "gemini", label: "Gemini", defaultUrl: "https://generativelanguage.googleapis.com" },
  { value: "deepseek", label: "DeepSeek", defaultUrl: "https://api.deepseek.com" },
  { value: "volcengine", label: "Volcengine", defaultUrl: "https://ark.cn-beijing.volces.com" },
  { value: "custom", label: "Custom", defaultUrl: "" },
];

const defaultUrlForType = computed(() => {
  return typeOptions.find((o) => o.value === form.value.type)?.defaultUrl ?? "";
});

function openCreate() {
  editingChannel.value = null;
  form.value = {
    name: "",
    type: "openai",
    baseUrl: "",
    enabled: true,
    keys: [""],
  };
  showEditor.value = true;
}

async function openEdit(ch: Channel) {
  editingChannel.value = ch;
  await store.loadChannelKeys(ch.id);
  const existingKeys = store.channelKeys.get(ch.id) ?? [];
  form.value = {
    name: ch.name,
    type: ch.type,
    baseUrl: ch.baseUrl ?? "",
    enabled: ch.enabled,
    keys: existingKeys.length ? existingKeys.map((k) => k.key) : [""],
  };
  showEditor.value = true;
}

function addKeySlot() {
  form.value.keys.push("");
}

function removeKeySlot(idx: number) {
  form.value.keys.splice(idx, 1);
}

async function save() {
  const baseUrl = form.value.baseUrl || defaultUrlForType.value;
  const nonEmptyKeys = form.value.keys.filter((k) => k.trim());

  let channelId: number;

  if (editingChannel.value) {
    channelId = editingChannel.value.id;
    await gw.updateChannel(channelId, {
      name: form.value.name,
      type: form.value.type,
      baseUrl,
      enabled: form.value.enabled,
    });
    const existing = store.channelKeys.get(channelId) ?? [];
    for (const ek of existing) {
      await gw.removeChannelKey(ek.id);
    }
    for (const k of nonEmptyKeys) {
      await gw.addChannelKey(channelId, k);
    }
  } else {
    const ch = await gw.createChannel({
      name: form.value.name,
      type: form.value.type,
      baseUrl,
      enabled: form.value.enabled,
    });
    channelId = ch.id;
    for (const k of nonEmptyKeys) {
      await gw.addChannelKey(ch.id, k);
    }
  }

  showEditor.value = false;
  await store.loadChannels();
  if (selectedChannelId.value === channelId) {
    await store.loadModelsByChannel(channelId);
  }
}

async function deleteChannel(channel: Channel) {
  if (!window.confirm(`确认删除供应商「${channel.name}」？`)) return;

  await gw.deleteChannel(channel.id);
  await store.loadChannels();
  if (selectedChannelId.value === channel.id) {
    selectedChannelId.value = null;
  }
}

async function testChannel(id: number) {
  testResults.value = new Map(testResults.value).set(id, { loading: true });
  try {
    const result = await gw.testChannel(id);
    testResults.value = new Map(testResults.value).set(id, {
      loading: false,
      success: result.success,
      error: result.error,
    });
  } catch (e: any) {
    testResults.value = new Map(testResults.value).set(id, {
      loading: false,
      success: false,
      error: e.message ?? String(e),
    });
  }
}

const minuteStabilityRefresh = createGatewayRefreshScheduler(
  () => {
    if (!selectedChannelId.value) return;
    return store.loadChannelMinuteStability(selectedChannelId.value);
  },
  {
    debounceMs: 1_000,
    minIntervalMs: 2_000,
  },
);

async function selectChannel(ch: Channel) {
  selectedChannelId.value = ch.id;
  await store.loadModelsByChannel(ch.id);
  minuteStabilityRefresh.request({ immediate: true });
}

async function selectChannelById(value: string | number) {
  const channelId = Number(value);
  const channel = store.channels.find((ch) => ch.id === channelId);
  if (!channel) return;
  await selectChannel(channel);
}

function handleChannelSelect(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;
  void selectChannelById(target.value);
}

function openModelManager(channel: Channel) {
  selectedChannelId.value = channel.id;
  modelManagerChannel.value = channel;
  minuteStabilityRefresh.request({ immediate: true });
}

function openSelectedModelManager() {
  if (!selectedChannel.value) return;
  openModelManager(selectedChannel.value);
}

function editSelectedChannel() {
  if (!selectedChannel.value) return;
  void openEdit(selectedChannel.value);
}

function deleteSelectedChannel() {
  if (!selectedChannel.value) return;
  void deleteChannel(selectedChannel.value);
}

function testSelectedChannel() {
  if (!selectedChannel.value) return;
  void testChannel(selectedChannel.value.id);
}

function closeModelManager() {
  modelManagerChannel.value = null;
}

function channelModelCount(channelId: number): number {
  return (store.models.get(channelId) ?? []).length;
}

function channelStabilitySummary(channelId: number): string {
  const points = store.channelMinuteStability.get(channelId) ?? [];
  const success = points.reduce((sum, point) => sum + point.successCount, 0);
  const fail = points.reduce((sum, point) => sum + point.failCount, 0);
  const total = success + fail;
  if (total === 0) return "-";
  return `${((success / total) * 100).toFixed(1)}%`;
}

const selectedChannel = computed(
  () => store.channels.find((channel) => channel.id === selectedChannelId.value) ?? null,
);

const selectedChannelPoints = computed(() => {
  if (!selectedChannel.value) return [];
  return store.channelMinuteStability.get(selectedChannel.value.id) ?? [];
});

const selectedChannelModelCount = computed(() => {
  if (!selectedChannel.value) return 0;
  return channelModelCount(selectedChannel.value.id);
});

const selectedChannelStability = computed(() => {
  if (!selectedChannel.value) return "-";
  return channelStabilitySummary(selectedChannel.value.id);
});

const selectedChannelTypeLabel = computed(() => {
  if (!selectedChannel.value) return "";
  return (
    typeOptions.find((option) => option.value === selectedChannel.value?.type)?.label ?? "Custom"
  );
});

const selectedTestResult = computed(() => {
  if (!selectedChannel.value) return undefined;
  return testResults.value.get(selectedChannel.value.id);
});

const selectedTestLabel = computed(() => {
  if (selectedTestResult.value?.loading) return "测试中";
  if (selectedTestResult.value?.success) return "连接成功";
  if (selectedTestResult.value?.error) return "连接失败";
  return "未测试";
});

function autoSelectFirst(channels: Channel[]) {
  if (!channels.length) {
    selectedChannelId.value = null;
    return;
  }
  if (!selectedChannelId.value || !channels.some((ch) => ch.id === selectedChannelId.value)) {
    void selectChannel(channels[0]).catch((error) => {
      console.error("Failed to auto-select gateway channel", error);
    });
  }
}

// Auto-select first channel, preload all model counts
watch(() => store.channels, autoSelectFirst);

onMounted(() => autoSelectFirst(store.channels));

const cleanupLogAdded = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  if (!selectedChannelId.value) return;
  minuteStabilityRefresh.request();
});

onUnmounted(() => {
  cleanupLogAdded?.();
  minuteStabilityRefresh.dispose();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <!-- Header -->
    <div class="shrink-0 border-b border-[var(--color-border-subtle)] px-4 py-3">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-sm font-medium text-[var(--color-text-primary)]">供应商</h3>
          <p class="mt-1 text-xs text-[var(--color-text-muted)]">
            {{ store.channels.length }} 个供应商渠道
          </p>
        </div>

        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <select
            data-testid="channel-select"
            :value="selectedChannelId ?? ''"
            :disabled="!store.channels.length"
            class="h-8 min-w-36 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-control-hover)] focus:border-[var(--color-accent-brand)] disabled:cursor-not-allowed disabled:opacity-50"
            @change="handleChannelSelect"
          >
            <option v-if="!store.channels.length" value="">暂无供应商</option>
            <option v-for="channel in store.channels" :key="channel.id" :value="channel.id">
              {{ channel.name }}
            </option>
          </select>

          <button
            data-testid="channel-test"
            type="button"
            :disabled="!selectedChannel || selectedTestResult?.loading"
            class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            title="测试供应商"
            @click="testSelectedChannel"
          >
            <Icon icon="lucide:activity" class="h-3.5 w-3.5" />
            测试
          </button>

          <button
            data-testid="channel-edit"
            type="button"
            :disabled="!selectedChannel"
            class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-control-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            title="编辑供应商"
            @click="editSelectedChannel"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
            编辑
          </button>

          <button
            data-testid="channel-delete"
            type="button"
            :disabled="!selectedChannel"
            class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-danger)_42%,transparent)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-control))] disabled:cursor-not-allowed disabled:border-[var(--color-border-subtle)] disabled:text-[var(--color-text-muted)] disabled:opacity-50"
            title="删除供应商"
            @click="deleteSelectedChannel"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
            删除
          </button>

          <button
            data-testid="channel-manage-models"
            type="button"
            :disabled="!selectedChannel"
            class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--color-accent-brand)_42%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent-brand)_22%,transparent),var(--color-control))] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent-brand)_18%,var(--color-control-hover))] disabled:cursor-not-allowed disabled:opacity-50"
            title="管理模型"
            @click="openSelectedModelManager"
          >
            <Icon icon="lucide:boxes" class="h-3.5 w-3.5" />
            管理模型
          </button>

          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent-brand)] px-3 text-xs font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-accent-brand-hover)]"
            @click="openCreate"
          >
            <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
            新增渠道
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="selectedChannel"
      data-testid="channel-detail-content"
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
    >
      <div class="grid shrink-0 grid-cols-1 gap-2 md:grid-cols-3">
        <div
          class="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-2"
        >
          <span class="text-[11px] font-medium text-[var(--color-text-muted)]">当前供应商</span>
          <div class="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {{ selectedChannel.name }}
          </div>
          <p class="mt-1 truncate text-xs text-[var(--color-text-muted)]">
            {{ selectedChannelTypeLabel }} · {{ selectedChannel.enabled ? "启用" : "停用" }}
          </p>
        </div>

        <div
          class="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-2"
        >
          <span class="text-[11px] font-medium text-[var(--color-text-muted)]">模型 / 稳定性</span>
          <div class="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
            {{ selectedChannelModelCount }} 个模型
          </div>
          <p class="mt-1 text-xs text-[var(--color-text-muted)]">
            近30分钟 {{ selectedChannelStability }}
          </p>
        </div>

        <div
          class="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-2"
          :title="selectedTestResult?.error"
        >
          <span class="text-[11px] font-medium text-[var(--color-text-muted)]">连接测试</span>
          <div
            :class="[
              'mt-1 text-sm font-semibold',
              selectedTestResult?.success
                ? 'text-[var(--color-success)]'
                : selectedTestResult?.error
                  ? 'text-[var(--color-danger)]'
                  : 'text-[var(--color-text-primary)]',
            ]"
          >
            {{ selectedTestLabel }}
          </div>
          <p class="mt-1 truncate text-xs text-[var(--color-text-muted)]">
            {{ selectedTestResult?.error ?? "按需测试当前供应商" }}
          </p>
        </div>
      </div>

      <div
        data-testid="channel-chart-grid"
        class="grid min-h-0 shrink-0 grid-cols-1 items-start gap-3 lg:grid-cols-2"
      >
        <ChannelRealtimeChart
          :points="selectedChannelPoints"
          metric="availability"
          compact
          class="min-h-0"
        />
        <ChannelRealtimeChart
          :points="selectedChannelPoints"
          metric="latency"
          compact
          class="min-h-0"
        />
      </div>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-sm text-[var(--color-text-muted)]"
    >
      <span>暂无渠道</span>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent-brand)] px-3 text-xs font-semibold text-[var(--color-primary-foreground)] transition-colors hover:bg-[var(--color-accent-brand-hover)]"
        @click="openCreate"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        新增渠道
      </button>
    </div>

    <ModelManagerDialog
      :open="!!modelManagerChannel"
      :channel="modelManagerChannel"
      @close="closeModelManager"
    />

    <!-- Editor overlay -->
    <Teleport to="body">
      <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showEditor = false" />
        <div
          class="relative w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
        >
          <h3 class="mb-4 text-sm font-medium">
            {{ editingChannel ? "编辑供应商" : "新增供应商" }}
          </h3>

          <!-- Name -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">名称</span>
            <input
              v-model="form.name"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              placeholder="供应商名称"
            />
          </label>

          <!-- Type -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">类型</span>
            <select
              v-model="form.type"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
            >
              <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <!-- Base URL -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">Base URL</span>
            <input
              v-model="form.baseUrl"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              :placeholder="defaultUrlForType || 'https://...'"
            />
          </label>

          <!-- API Keys -->
          <div class="mb-3">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">API Keys</span>
              <button class="text-xs text-violet-500 hover:text-violet-400" @click="addKeySlot">
                + 添加
              </button>
            </div>
            <div v-for="(_, idx) in form.keys" :key="idx" class="mb-1.5 flex gap-1.5">
              <input
                v-model="form.keys[idx]"
                type="password"
                class="flex-1 rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="sk-..."
              />
              <button
                v-if="form.keys.length > 1"
                class="rounded p-1.5 text-muted-foreground hover:text-red-400"
                @click="removeKeySlot(idx)"
              >
                <Icon icon="lucide:x" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <button
              class="rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="showEditor = false"
            >
              取消
            </button>
            <button
              class="rounded bg-violet-600 px-4 py-1.5 text-xs text-white transition-colors hover:bg-violet-500"
              @click="save"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
