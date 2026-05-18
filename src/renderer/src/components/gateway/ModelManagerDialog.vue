<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import { useGatewayStore } from "@/stores/gateway";
import GatewayManagerDialog from "@/components/gateway/GatewayManagerDialog.vue";
import GatewayModelCard from "@/components/gateway/GatewayModelCard.vue";
import type { Capability, Channel, Model } from "@shared/types/gateway";

const props = defineProps<{
  open: boolean;
  channel: Channel | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const gw = usePresenter("gatewayPresenter");
const store = useGatewayStore();

const showAddModel = ref(false);
const newModelName = ref("");
const addModelError = ref("");
const refreshModelsError = ref("");
const refreshingModels = ref(false);

const channelModels = computed(() => {
  if (!props.channel) return [];
  const models = store.models.get(props.channel.id) ?? [];
  return [...models].sort((a, b) => Number(b.enabled) - Number(a.enabled));
});

const subtitle = computed(() => {
  if (!props.channel) return "";
  return `${props.channel.name} · ${props.channel.type}`;
});

watch(
  () => [props.open, props.channel?.id] as const,
  async ([open, channelId]) => {
    if (!open || !channelId) return;
    await store.loadModelsByChannel(channelId);
  },
  { immediate: true },
);

function close() {
  emit("close");
}

async function reloadCurrentModels() {
  if (!props.channel) return;
  await store.loadModelsByChannel(props.channel.id);
}

async function refreshModels() {
  if (!props.channel) return;

  refreshingModels.value = true;
  refreshModelsError.value = "";
  try {
    const fetched = await gw.fetchModels(props.channel.id);
    const existingNames = new Set(channelModels.value.map((model) => model.modelName));
    for (const modelName of fetched) {
      if (existingNames.has(modelName)) continue;
      await gw.createModel({
        channelId: props.channel.id,
        modelName,
        type: "chat",
        capabilities: [],
        enabled: true,
      });
    }
    await reloadCurrentModels();
  } catch (error: any) {
    refreshModelsError.value = error?.message ?? String(error);
  } finally {
    refreshingModels.value = false;
  }
}

async function addModel() {
  if (!props.channel) return;
  const modelName = newModelName.value.trim();
  if (!modelName) return;

  addModelError.value = "";
  try {
    await gw.createModel({
      channelId: props.channel.id,
      modelName,
      type: "chat",
      capabilities: [],
      enabled: true,
    });
    newModelName.value = "";
    showAddModel.value = false;
    await reloadCurrentModels();
  } catch (error: any) {
    addModelError.value = error?.message ?? String(error);
  }
}

async function toggleModelCap(model: Model, capability: Capability) {
  const capabilities = model.capabilities.includes(capability)
    ? model.capabilities.filter((cap) => cap !== capability)
    : [...model.capabilities, capability];
  await gw.updateModel(model.id, { capabilities });
  await reloadCurrentModels();
}

async function toggleModelEnabled(model: Model) {
  await gw.updateModel(model.id, { enabled: !model.enabled });
  await reloadCurrentModels();
}

async function deleteModel(model: Model) {
  await gw.deleteModel(model.id);
  await reloadCurrentModels();
}
</script>

<template>
  <GatewayManagerDialog
    :open="open"
    title="模型管理"
    :subtitle="subtitle"
    width-class="w-[min(820px,calc(100vw-48px))]"
    @close="close"
  >
    <template #actions>
      <button
        type="button"
        title="刷新模型"
        :disabled="!channel || refreshingModels"
        class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-transparent disabled:hover:bg-transparent"
        @click="refreshModels"
      >
        <Icon icon="lucide:refresh-cw" :class="['h-4 w-4', refreshingModels && 'animate-spin']" />
      </button>
      <button
        type="button"
        :disabled="!channel"
        class="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)] disabled:cursor-not-allowed disabled:opacity-60"
        @click="showAddModel = true"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        <span>添加模型</span>
      </button>
    </template>

    <div class="space-y-3">
      <div
        v-if="showAddModel"
        class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-app-elevated)] p-3"
      >
        <div class="flex min-w-0 items-center gap-2">
          <input
            v-model="newModelName"
            class="min-w-0 flex-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-control)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-brand)]"
            placeholder="输入模型名"
            @keydown.enter="addModel"
          />
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md bg-[var(--color-accent-brand)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
            @click="addModel"
          >
            确认
          </button>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-[var(--color-border-subtle)] bg-transparent px-3 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-control-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-brand-soft)]"
            @click="showAddModel = false"
          >
            取消
          </button>
        </div>
        <p v-if="addModelError" class="mt-2 text-xs text-[var(--color-danger)]">
          {{ addModelError }}
        </p>
      </div>

      <p
        v-if="refreshModelsError"
        class="rounded-[var(--radius-md)] border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
      >
        {{ refreshModelsError }}
      </p>

      <div v-if="channelModels.length" class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GatewayModelCard
          v-for="model in channelModels"
          :key="model.id"
          :model="model"
          :disabled="refreshingModels"
          @toggle-capability="toggleModelCap"
          @toggle-enabled="toggleModelEnabled"
          @delete="deleteModel"
        />
      </div>

      <div
        v-else
        class="flex min-h-36 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] text-sm text-[var(--color-text-muted)]"
      >
        暂无模型
      </div>
    </div>
  </GatewayManagerDialog>
</template>
