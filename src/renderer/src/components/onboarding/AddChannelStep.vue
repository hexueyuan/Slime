<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { ChannelType } from "@shared/types/gateway";

const props = defineProps<{
  channelType: ChannelType;
  channelName: string;
  baseUrl: string;
  apiKey: string;
  selectedModels: string[];
}>();

const emit = defineEmits<{
  "update:channelType": [value: ChannelType];
  "update:channelName": [value: string];
  "update:baseUrl": [value: string];
  "update:apiKey": [value: string];
  "update:selectedModels": [value: string[]];
  next: [];
  prev: [];
}>();

const DEFAULT_URLS: Record<ChannelType, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  gemini: "https://generativelanguage.googleapis.com",
  deepseek: "https://api.deepseek.com",
  volcengine: "https://ark.cn-beijing.volces.com/api",
  custom: "",
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  volcengine: "Volcengine (火山引擎)",
  custom: "Custom",
};

const testing = ref(false);
const testResult = ref<{ success: boolean; models?: string[]; error?: string } | null>(null);

function onTypeChange(type: ChannelType) {
  emit("update:channelType", type);
  emit("update:channelName", CHANNEL_LABELS[type].split(" (")[0]);
  emit("update:baseUrl", DEFAULT_URLS[type]);
  testResult.value = null;
  emit("update:selectedModels", []);
}

// Reset test result when key changes
watch(
  () => props.apiKey,
  () => {
    testResult.value = null;
  },
);

const canTest = computed(() => props.apiKey.trim().length > 0 && props.baseUrl.trim().length > 0);
const canNext = computed(() => props.apiKey.trim().length > 0);

async function runTest() {
  testing.value = true;
  testResult.value = null;
  try {
    const gw = window.electron.ipcRenderer.invoke;
    // Create temp channel, add key, test, then clean up on failure
    const channel = (await gw("presenter:call", "gatewayPresenter", "createChannel", {
      name: "__onboarding_test__",
      type: props.channelType,
      baseUrls: [props.baseUrl],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    })) as { id: number };

    await gw("presenter:call", "gatewayPresenter", "addChannelKey", channel.id, props.apiKey);
    const result = (await gw("presenter:call", "gatewayPresenter", "testChannel", channel.id)) as {
      success: boolean;
      models?: string[];
      error?: string;
    };

    // Delete temp channel regardless
    await gw("presenter:call", "gatewayPresenter", "deleteChannel", channel.id);

    testResult.value = result;
    if (result.success && result.models?.length) {
      emit("update:selectedModels", [...result.models]);
    }
  } catch (e) {
    testResult.value = { success: false, error: e instanceof Error ? e.message : String(e) };
  }
  testing.value = false;
}

function toggleModel(model: string) {
  const current = [...props.selectedModels];
  const idx = current.indexOf(model);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(model);
  emit("update:selectedModels", current);
}
</script>

<template>
  <div data-testid="add-channel-step" class="flex w-full max-w-[360px] flex-col items-center gap-4">
    <h2 class="text-[17px] font-semibold text-slate-200">添加首个渠道</h2>
    <p class="text-sm text-slate-400">配置一个 AI 服务渠道，通过内置网关统一管理。</p>

    <!-- Channel Type -->
    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">渠道类型</label>
      <select
        data-testid="onboard-channel-type"
        :value="channelType"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-500/50"
        @change="onTypeChange(($event.target as HTMLSelectElement).value as ChannelType)"
      >
        <option v-for="(label, key) in CHANNEL_LABELS" :key="key" :value="key">
          {{ label }}
        </option>
      </select>
    </div>

    <!-- Base URL -->
    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">Base URL</label>
      <input
        data-testid="onboard-base-url"
        type="text"
        :value="baseUrl"
        placeholder="https://api.example.com"
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:baseUrl', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- API Key -->
    <div class="flex w-full flex-col gap-1.5">
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400">API Key</label>
      <input
        data-testid="onboard-api-key"
        type="password"
        :value="apiKey"
        placeholder="sk-..."
        class="w-full rounded-lg border border-violet-500/20 bg-violet-500/5 px-3.5 py-2.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-500/50"
        @input="emit('update:apiKey', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Test button -->
    <button
      data-testid="test-btn"
      class="w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300 disabled:opacity-40"
      :disabled="!canTest || testing"
      @click="runTest"
    >
      {{ testing ? "测试中..." : "测试连接 & 拉取模型" }}
    </button>

    <!-- Test result -->
    <div v-if="testResult" class="w-full">
      <div
        v-if="testResult.success"
        class="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400"
      >
        连接成功，发现 {{ testResult.models?.length || 0 }} 个模型
      </div>
      <div
        v-else
        class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
      >
        连接失败: {{ testResult.error }}
      </div>
    </div>

    <!-- Model selection -->
    <div
      v-if="testResult?.success && testResult.models?.length"
      class="flex w-full flex-col gap-1.5"
    >
      <label class="text-xs font-medium uppercase tracking-wider text-slate-400"
        >启用模型 ({{ selectedModels.length }}/{{ testResult.models.length }})</label
      >
      <div class="max-h-[160px] overflow-y-auto rounded-lg border border-violet-500/20 p-2">
        <label
          v-for="model in testResult.models"
          :key="model"
          class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-violet-500/10"
        >
          <input
            type="checkbox"
            :checked="selectedModels.includes(model)"
            class="accent-violet-500"
            @change="toggleModel(model)"
          />
          <span class="truncate">{{ model }}</span>
        </label>
      </div>
    </div>

    <!-- Nav buttons -->
    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        &larr; 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!canNext"
        @click="emit('next')"
      >
        下一步 &rarr;
      </button>
    </div>
  </div>
</template>
