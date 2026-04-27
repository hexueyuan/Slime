<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, ChannelType, Capability, Model } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";
import ModelIcon from "@/components/ModelIcon.vue";
import ChannelStabilityChart from "@/components/gateway/ChannelStabilityChart.vue";

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showEditor = ref(false);
const editingChannel = ref<Channel | null>(null);
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
    baseUrl: ch.baseUrls[0] ?? "",
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
  const baseUrls = form.value.baseUrl ? [form.value.baseUrl] : [defaultUrlForType.value];
  const nonEmptyKeys = form.value.keys.filter((k) => k.trim());

  let channelId: number;

  if (editingChannel.value) {
    channelId = editingChannel.value.id;
    await gw.updateChannel(channelId, {
      name: form.value.name,
      type: form.value.type,
      baseUrls,
      models: [],
      enabled: form.value.enabled,
      priority: 0,
      weight: 1,
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
      baseUrls,
      models: [],
      enabled: form.value.enabled,
      priority: 0,
      weight: 1,
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

// --- Model capability management ---
const ALL_CAPS: { key: Capability; label: string; icon: string }[] = [
  { key: "reasoning", label: "reasoning", icon: "🧠" },
  { key: "vision", label: "vision", icon: "👁" },
  { key: "image_gen", label: "image_gen", icon: "🎨" },
  { key: "tool_call", label: "tool_call", icon: "🔧" },
];

const CAP_COLORS: Record<Capability, { active: string; inactive: string }> = {
  reasoning: {
    active: "bg-violet-400/20 text-violet-400 border-violet-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  vision: {
    active: "bg-emerald-400/20 text-emerald-400 border-emerald-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  image_gen: {
    active: "bg-amber-400/20 text-amber-400 border-amber-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
  tool_call: {
    active: "bg-blue-400/20 text-blue-400 border-blue-400/30",
    inactive: "border-border text-muted-foreground/50",
  },
};

const showAddModel = ref(false);

const selectedChannelId = ref<number | null>(null);

async function selectChannel(ch: Channel) {
  showAddModel.value = false;
  newCapModelName.value = "";
  selectedChannelId.value = ch.id;
  await store.loadModelsByChannel(ch.id);
  store.loadChannelStability(ch.id);
}

// Auto-select first channel, preload all model counts
watch(
  () => store.channels,
  (channels) => {
    if (!channels.length) return;
    for (const ch of channels) {
      if (!store.models.has(ch.id)) store.loadModelsByChannel(ch.id);
    }
    if (!selectedChannelId.value || !channels.some((ch) => ch.id === selectedChannelId.value))
      selectChannel(channels[0]);
  },
  { immediate: true },
);

const selectedChannel = computed(
  () => store.channels.find((ch) => ch.id === selectedChannelId.value) ?? null,
);

const selectedStabilityPoints = computed(() => {
  if (!selectedChannelId.value) return [];
  return store.channelStability.get(selectedChannelId.value) ?? [];
});

const channelModels = computed(() =>
  selectedChannelId.value ? (store.models.get(selectedChannelId.value) ?? []) : [],
);

async function toggleModelCap(model: Model, cap: Capability) {
  const caps = model.capabilities.includes(cap)
    ? model.capabilities.filter((c) => c !== cap)
    : [...model.capabilities, cap];
  await gw.updateModel(model.id, { capabilities: caps });
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value);
}

async function toggleModelEnabled(model: Model) {
  await gw.updateModel(model.id, { enabled: !model.enabled });
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value);
}

async function addModelToChannel(channelId: number, modelName: string) {
  await gw.createModel({
    channelId,
    modelName,
    type: "chat",
    capabilities: [],
    priority: 0,
    enabled: true,
  });
  await store.loadModelsByChannel(channelId);
}

async function removeModelFromChannel(modelId: number) {
  await gw.deleteModel(modelId);
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value);
}

const newCapModelName = ref("");
const refreshingModels = ref(false);
const refreshModelsError = ref("");

async function refreshModels() {
  if (!selectedChannelId.value) return;
  refreshingModels.value = true;
  refreshModelsError.value = "";
  try {
    const fetched: string[] = await gw.fetchModels(selectedChannelId.value);
    const existing = store.models.get(selectedChannelId.value) ?? [];
    const existingNames = new Set(existing.map((m) => m.modelName));
    for (const name of fetched) {
      if (!existingNames.has(name)) {
        await gw.createModel({
          channelId: selectedChannelId.value,
          modelName: name,
          type: "chat",
          capabilities: [],
          priority: 0,
          enabled: true,
        });
      }
    }
    await store.loadModelsByChannel(selectedChannelId.value);
  } catch (e: any) {
    refreshModelsError.value = e?.message ?? String(e);
  } finally {
    refreshingModels.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="shrink-0 border-b border-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium">渠道</h3>
        <button
          class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
          @click="openCreate"
        >
          + 新增渠道
        </button>
      </div>
    </div>

    <!-- Master-Detail body -->
    <div class="flex min-h-0 flex-1">
      <!-- Left: channel list -->
      <div class="w-60 shrink-0 overflow-y-auto border-r border-border p-2">
        <template v-if="store.channels.length">
          <div
            v-for="ch in store.channels"
            :key="ch.id"
            class="mb-1 cursor-pointer rounded-lg p-2.5 transition-colors"
            :class="[
              selectedChannelId === ch.id
                ? 'bg-violet-500/10 ring-1 ring-violet-500/30'
                : 'hover:bg-muted/50',
              !ch.enabled && 'opacity-50',
            ]"
            @click="selectChannel(ch)"
          >
            <div class="flex items-center gap-1.5">
              <span class="truncate text-[13px] font-medium">{{ ch.name }}</span>
              <span
                :class="[
                  'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                  ch.enabled ? 'bg-green-500' : 'bg-neutral-500',
                ]"
              />
            </div>
            <div class="mt-1 text-[11px] text-muted-foreground">
              {{ ch.type }}
              <span class="ml-1">·</span>
              <span class="ml-1">{{ (store.models.get(ch.id) ?? []).length }} 模型</span>
            </div>
          </div>
        </template>
        <div v-else class="py-12 text-center text-xs text-muted-foreground">暂无渠道</div>
      </div>

      <!-- Right: model management -->
      <div v-if="selectedChannel" class="min-w-0 flex-1 overflow-y-auto p-4">
        <!-- Channel detail header -->
        <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-[15px] font-semibold">{{ selectedChannel.name }}</span>
              <span
                :class="[
                  'inline-block h-1.5 w-1.5 rounded-full',
                  selectedChannel.enabled ? 'bg-green-500' : 'bg-neutral-500',
                ]"
              />
            </div>
            <div class="mt-1 truncate text-xs text-muted-foreground">
              {{ selectedChannel.type }}
              <span v-if="selectedChannel.baseUrls.length" class="ml-1">
                · {{ selectedChannel.baseUrls[0] }}
              </span>
            </div>
            <!-- Test result -->
            <div v-if="testResults.get(selectedChannel.id)" class="mt-1 text-xs">
              <span
                v-if="testResults.get(selectedChannel.id)!.loading"
                class="text-muted-foreground"
                >测试中...</span
              >
              <span v-else-if="testResults.get(selectedChannel.id)!.success" class="text-green-500"
                >连接成功</span
              >
              <span v-else class="text-red-400">{{
                testResults.get(selectedChannel.id)!.error
              }}</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="testChannel(selectedChannel.id)"
            >
              测试
            </button>
            <button
              class="rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="openEdit(selectedChannel)"
            >
              编辑
            </button>
            <button
              class="rounded border border-border px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
              @click="deleteChannel(selectedChannel.id)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- Stability chart -->
        <ChannelStabilityChart
          v-if="selectedChannel"
          :points="selectedStabilityPoints"
          class="mb-4"
        />

        <!-- Model management title -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-[13px] text-muted-foreground">模型管理</span>
          <div class="flex items-center gap-1">
            <button
              class="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="从渠道拉取模型列表"
              :disabled="refreshingModels"
              @click="refreshModels"
            >
              <Icon
                icon="lucide:refresh-cw"
                class="h-3.5 w-3.5"
                :class="refreshingModels && 'animate-spin'"
              />
            </button>
            <button
              class="flex h-6 w-6 items-center justify-center rounded border border-border text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="添加模型"
              @click="showAddModel = !showAddModel"
            >
              +
            </button>
          </div>
        </div>
        <div v-if="refreshModelsError" class="mb-2 text-xs text-red-400">
          {{ refreshModelsError }}
        </div>

        <!-- Model list -->
        <div v-if="channelModels.length" class="space-y-2">
          <div
            v-for="model in channelModels"
            :key="model.id"
            class="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2"
          >
            <div class="flex items-center gap-2 min-w-0">
              <ModelIcon :model-name="model.modelName" :size="18" class="shrink-0" />
              <span class="truncate text-[13px]" :title="model.modelName">{{
                model.modelName
              }}</span>
              <span
                :class="[
                  'inline-block h-1.5 w-1.5 rounded-full',
                  model.enabled ? 'bg-green-500' : 'bg-neutral-500',
                ]"
              />
            </div>
            <div class="flex items-center gap-1">
              <button
                v-for="cap in ALL_CAPS"
                :key="cap.key"
                :title="cap.label"
                class="rounded border px-2 py-0.5 text-[10px] transition-colors"
                :class="
                  model.capabilities.includes(cap.key)
                    ? CAP_COLORS[cap.key].active
                    : CAP_COLORS[cap.key].inactive
                "
                @click.stop="toggleModelCap(model, cap.key)"
              >
                {{ cap.icon }}
              </button>
              <button
                class="ml-1 shrink-0 rounded-full transition-colors"
                :title="model.enabled ? '禁用' : '启用'"
                @click.stop="toggleModelEnabled(model)"
              >
                <span
                  :class="[
                    'flex h-4 w-7 items-center rounded-full px-0.5 transition-colors',
                    model.enabled ? 'bg-violet-500' : 'bg-muted-foreground/30',
                  ]"
                >
                  <span
                    :class="[
                      'h-3 w-3 rounded-full bg-white shadow transition-transform',
                      model.enabled ? 'translate-x-3' : 'translate-x-0',
                    ]"
                  />
                </span>
              </button>
              <button
                class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-red-400"
                title="删除"
                @click.stop="removeModelFromChannel(model.id)"
              >
                <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div v-else class="py-8 text-center text-xs text-muted-foreground">暂无模型</div>

        <!-- Inline add model (toggled by + button) -->
        <div v-if="showAddModel" class="mt-3 flex items-center gap-2">
          <input
            v-model="newCapModelName"
            class="min-w-0 flex-1 rounded border border-input-border bg-input px-2.5 py-1 text-xs text-foreground outline-none focus:border-violet-500"
            placeholder="输入模型名称..."
            @keydown.enter.prevent="
              if (newCapModelName.trim() && selectedChannelId) {
                addModelToChannel(selectedChannelId, newCapModelName.trim());
                newCapModelName = '';
              }
            "
          />
          <button
            class="rounded bg-violet-600 px-2.5 py-1 text-xs text-white transition-colors hover:bg-violet-500"
            @click="
              if (newCapModelName.trim() && selectedChannelId) {
                addModelToChannel(selectedChannelId, newCapModelName.trim());
                newCapModelName = '';
              }
            "
          >
            确认
          </button>
          <button
            class="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            @click="
              showAddModel = false;
              newCapModelName = '';
            "
          >
            取消
          </button>
        </div>
      </div>

      <!-- Empty state when no channels exist -->
      <div
        v-else-if="!store.channels.length"
        class="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        暂无渠道
      </div>
      <div
        v-else
        class="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        选择一个渠道
      </div>
    </div>

    <!-- Editor overlay -->
    <Teleport to="body">
      <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="showEditor = false" />
        <div
          class="relative w-[480px] max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl"
        >
          <h3 class="mb-4 text-sm font-medium">
            {{ editingChannel ? "编辑渠道" : "新增渠道" }}
          </h3>

          <!-- Name -->
          <label class="mb-3 block">
            <span class="mb-1 block text-xs text-muted-foreground">名称</span>
            <input
              v-model="form.name"
              class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              placeholder="渠道名称"
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
