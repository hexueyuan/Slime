<script setup lang="ts">
import { ref, computed } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import type { Channel, ChannelType, Capability, Model } from "@shared/types/gateway";
import { Icon } from "@iconify/vue";

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
  priority: 0,
  weight: 1,
  keys: [] as string[],
  models: [] as string[],
});

const newModelInput = ref("");
const fetchingModels = ref(false);
const fetchModelsError = ref("");

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
    priority: 0,
    weight: 1,
    keys: [""],
    models: [],
  };
  newModelInput.value = "";
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
    priority: ch.priority,
    weight: ch.weight,
    keys: existingKeys.length ? existingKeys.map((k) => k.key) : [""],
    models: ch.models ?? [],
  };
  newModelInput.value = "";
  showEditor.value = true;
}

function addKeySlot() {
  form.value.keys.push("");
}

function removeKeySlot(idx: number) {
  form.value.keys.splice(idx, 1);
}

function addModel() {
  const name = newModelInput.value.trim();
  if (name && !form.value.models.includes(name)) {
    form.value.models.push(name);
  }
  newModelInput.value = "";
}

function removeModel(idx: number) {
  form.value.models.splice(idx, 1);
}

async function fetchModelsForForm() {
  fetchingModels.value = true;
  fetchModelsError.value = "";
  try {
    let models: string[];
    if (editingChannel.value) {
      models = await gw.fetchModels(editingChannel.value.id);
    } else {
      const baseUrl = form.value.baseUrl || defaultUrlForType.value;
      const apiKey = form.value.keys.find((k) => k.trim()) ?? "";
      if (!apiKey) {
        fetchModelsError.value = "请先填写 API Key";
        return;
      }
      models = await gw.fetchModelsByConfig(form.value.type, baseUrl, apiKey);
    }
    const merged = new Set([...form.value.models, ...models]);
    form.value.models = [...merged].sort();
  } catch (e: any) {
    fetchModelsError.value = e?.message ?? String(e);
  } finally {
    fetchingModels.value = false;
  }
}

async function save() {
  const baseUrls = form.value.baseUrl ? [form.value.baseUrl] : [defaultUrlForType.value];
  const nonEmptyKeys = form.value.keys.filter((k) => k.trim());

  if (editingChannel.value) {
    // Update
    const id = editingChannel.value.id;
    await gw.updateChannel(id, {
      name: form.value.name,
      type: form.value.type,
      baseUrls,
      models: form.value.models,
      enabled: form.value.enabled,
      priority: form.value.priority,
      weight: form.value.weight,
    });
    // Sync keys: remove all, re-add
    const existing = store.channelKeys.get(id) ?? [];
    for (const ek of existing) {
      await gw.removeChannelKey(ek.id);
    }
    for (const k of nonEmptyKeys) {
      await gw.addChannelKey(id, k);
    }
  } else {
    // Create
    const ch = await gw.createChannel({
      name: form.value.name,
      type: form.value.type,
      baseUrls,
      models: form.value.models,
      enabled: form.value.enabled,
      priority: form.value.priority,
      weight: form.value.weight,
    });
    for (const k of nonEmptyKeys) {
      await gw.addChannelKey(ch.id, k);
    }
  }

  showEditor.value = false;
  await store.loadChannels();
}

async function deleteChannel(id: number) {
  await gw.deleteChannel(id);
  await store.loadChannels();
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
const ALL_CAPS: { key: Capability; label: string }[] = [
  { key: "reasoning", label: "reasoning" },
  { key: "chat", label: "chat" },
  { key: "vision", label: "vision" },
  { key: "image_gen", label: "image_gen" },
];

const selectedChannelId = ref<number | null>(null);

async function selectChannel(ch: Channel) {
  selectedChannelId.value = ch.id;
  await store.loadModelsByChannel(ch.id);
}

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
  await gw.createModel({ channelId, modelName, capabilities: [], priority: 0, enabled: true });
  await store.loadModelsByChannel(channelId);
}

async function removeModelFromChannel(modelId: number) {
  await gw.deleteModel(modelId);
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value);
}

const newCapModelName = ref("");
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">渠道</h3>
      <button
        class="rounded bg-violet-600 px-3 py-1 text-xs text-white transition-colors hover:bg-violet-500"
        @click="openCreate"
      >
        + 新增渠道
      </button>
    </div>

    <!-- Channel list -->
    <div v-if="store.channels.length" class="space-y-2">
      <div
        v-for="ch in store.channels"
        :key="ch.id"
        class="flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors"
        :class="
          selectedChannelId === ch.id
            ? 'bg-violet-500/10 ring-1 ring-violet-500/30'
            : 'bg-muted/30 hover:bg-muted/50'
        "
        @click="selectChannel(ch)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">{{ ch.name }}</span>
            <span
              :class="[
                'inline-block h-1.5 w-1.5 rounded-full',
                ch.enabled ? 'bg-green-500' : 'bg-neutral-500',
              ]"
            />
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ ch.type }}
            <span v-if="ch.baseUrls.length" class="ml-1">{{ ch.baseUrls[0] }}</span>
          </div>
          <!-- Test result -->
          <div v-if="testResults.get(ch.id)" class="mt-1 text-xs">
            <span v-if="testResults.get(ch.id)!.loading" class="text-muted-foreground"
              >测试中...</span
            >
            <span v-else-if="testResults.get(ch.id)!.success" class="text-green-500">连接成功</span>
            <span v-else class="text-red-400">{{ testResults.get(ch.id)!.error }}</span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="测试连接"
            @click="testChannel(ch.id)"
          >
            <Icon icon="lucide:activity" class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="编辑"
            @click="openEdit(ch)"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
          </button>
          <button
            class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-400"
            title="删除"
            @click="deleteChannel(ch.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Model capability management -->
    <div v-if="selectedChannelId" class="mt-4 rounded-lg border border-border p-3">
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-xs font-medium text-muted-foreground">模型能力管理</h4>
      </div>
      <div v-if="channelModels.length" class="space-y-2">
        <div
          v-for="model in channelModels"
          :key="model.id"
          class="flex items-center gap-2 rounded bg-muted/20 p-2"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm">{{ model.modelName }}</span>
              <span
                :class="[
                  'inline-block h-1.5 w-1.5 rounded-full',
                  model.enabled ? 'bg-green-500' : 'bg-neutral-500',
                ]"
              />
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <button
                v-for="cap in ALL_CAPS"
                :key="cap.key"
                class="rounded border px-2 py-0.5 text-[10px] transition-colors"
                :class="
                  model.capabilities.includes(cap.key)
                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                    : 'border-muted text-muted-foreground'
                "
                @click.stop="toggleModelCap(model, cap.key)"
              >
                {{ cap.label }}
              </button>
            </div>
          </div>
          <button
            class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            :title="model.enabled ? '禁用' : '启用'"
            @click.stop="toggleModelEnabled(model)"
          >
            <Icon :icon="model.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="h-3.5 w-3.5" />
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
      <div v-else class="py-4 text-center text-xs text-muted-foreground">暂无模型</div>
      <div class="mt-2 flex gap-1.5">
        <input
          v-model="newCapModelName"
          class="min-w-0 flex-1 rounded border border-input-border bg-input px-2 py-1 text-xs text-foreground outline-none focus:border-violet-500"
          placeholder="添加模型名"
          @keydown.enter.prevent="
            if (newCapModelName.trim() && selectedChannelId) {
              addModelToChannel(selectedChannelId, newCapModelName.trim());
              newCapModelName = '';
            }
          "
        />
        <button
          class="rounded px-2 py-1 text-xs text-violet-500 hover:bg-muted"
          @click="
            if (newCapModelName.trim() && selectedChannelId) {
              addModelToChannel(selectedChannelId, newCapModelName.trim());
              newCapModelName = '';
            }
          "
        >
          + 添加
        </button>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="py-12 text-center text-sm text-muted-foreground">暂无渠道</div>

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

          <!-- Models -->
          <div class="mb-3">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-muted-foreground">模型列表</span>
              <button
                class="text-xs text-violet-500 hover:text-violet-400 disabled:opacity-50"
                :disabled="fetchingModels"
                @click="fetchModelsForForm"
              >
                {{ fetchingModels ? "获取中..." : "获取模型" }}
              </button>
            </div>
            <div v-if="fetchModelsError" class="mb-1.5 text-xs text-red-400">
              {{ fetchModelsError }}
            </div>
            <div v-if="form.models.length" class="mb-1.5 flex flex-wrap gap-1">
              <span
                v-for="(m, idx) in form.models"
                :key="m"
                class="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                {{ m }}
                <button class="text-muted-foreground hover:text-red-400" @click="removeModel(idx)">
                  <Icon icon="lucide:x" class="h-3 w-3" />
                </button>
              </span>
            </div>
            <div class="flex gap-1.5">
              <input
                v-model="newModelInput"
                class="min-w-0 flex-1 rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
                placeholder="输入模型 ID"
                @keydown.enter.prevent="addModel"
              />
              <button
                class="rounded px-2 py-1.5 text-xs text-violet-500 hover:bg-muted hover:text-violet-400"
                @click="addModel"
              >
                +
              </button>
            </div>
          </div>

          <!-- Priority & Weight -->
          <div class="mb-4 grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-1 block text-xs text-muted-foreground">Priority</span>
              <input
                v-model.number="form.priority"
                type="number"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs text-muted-foreground">Weight</span>
              <input
                v-model.number="form.weight"
                type="number"
                class="w-full rounded border border-input-border bg-input px-3 py-1.5 text-sm text-foreground outline-none focus:border-violet-500"
              />
            </label>
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
