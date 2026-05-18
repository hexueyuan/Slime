<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, ChannelType } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";
import GatewayChannelCard from "@/components/gateway/GatewayChannelCard.vue";
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

async function deleteChannel(id: number) {
  await gw.deleteChannel(id);
  await store.loadChannels();
  if (selectedChannelId.value === id) {
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

function openModelManager(channel: Channel) {
  selectedChannelId.value = channel.id;
  modelManagerChannel.value = channel;
  minuteStabilityRefresh.request({ immediate: true });
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

function autoSelectFirst(channels: Channel[]) {
  if (!channels.length) return;
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
    <div class="shrink-0 border-b border-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium">供应商</h3>
        <button
          class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
          @click="openCreate"
        >
          + 新增渠道
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <div
        v-if="store.channels.length"
        class="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3"
      >
        <GatewayChannelCard
          v-for="channel in store.channels"
          :key="channel.id"
          :channel="channel"
          :model-count="channelModelCount(channel.id)"
          :stability-summary="channelStabilitySummary(channel.id)"
          :test-result="testResults.get(channel.id)"
          @test="testChannel(channel.id)"
          @edit="openEdit"
          @delete="deleteChannel(channel.id)"
          @manage-models="openModelManager"
        />
      </div>
      <div
        v-else
        class="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]"
      >
        暂无渠道
      </div>
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
