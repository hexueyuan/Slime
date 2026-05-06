<template>
  <div class="flex h-full flex-col overflow-y-auto p-4">
    <div class="mx-auto w-full max-w-2xl space-y-5">
      <!-- ID (builtin only) -->
      <div v-if="isBuiltin">
        <label class="text-xs font-medium text-muted-foreground">ID</label>
        <div class="mt-1 text-sm text-foreground font-mono">{{ agentInfo?.id }}</div>
      </div>

      <!-- 名称 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">名称</label>
        <input
          v-model="form.name"
          :disabled="readonly"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          placeholder="Agent 名称"
        />
      </div>

      <!-- 描述 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">描述</label>
        <textarea
          v-model="form.description"
          :disabled="readonly"
          rows="2"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
          placeholder="简短描述"
        />
      </div>

      <!-- 主题颜色 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">主题颜色</label>
        <div class="mt-1 flex items-center gap-2">
          <button
            v-for="c in PRESET_COLORS"
            :key="c"
            :disabled="readonly"
            class="h-6 w-6 rounded-full border border-border disabled:opacity-50"
            :class="{ 'ring-2 ring-offset-1 ring-violet-500': form.themeColor === c }"
            :style="{ backgroundColor: c }"
            @click="form.themeColor = c"
          />
          <input
            v-model="form.themeColor"
            :disabled="readonly"
            type="color"
            class="h-6 w-6 cursor-pointer rounded border border-border disabled:opacity-50"
          />
        </div>
      </div>

      <!-- 性格设定 Soul -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">性格设定 (Soul)</label>
        <textarea
          v-model="form.soul"
          :disabled="readonly"
          rows="12"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono disabled:opacity-50"
          placeholder="Agent 的性格与行为设定..."
        />
      </div>

      <!-- 能力需求 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">能力需求</label>
        <div class="mt-1 flex flex-wrap gap-3">
          <label
            v-for="cap in CAPABILITIES"
            :key="cap"
            class="flex items-center gap-1 text-sm text-foreground"
          >
            <input
              type="checkbox"
              :disabled="readonly"
              :checked="form.capabilityRequirements.includes(cap)"
              class="disabled:opacity-50"
              @change="toggleCapability(cap)"
            />
            {{ cap }}
          </label>
        </div>
      </div>

      <!-- 工具 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground"
          >工具 <span class="text-muted-foreground">(取消勾选=禁用)</span></label
        >
        <div class="mt-1 grid grid-cols-3 gap-x-4 gap-y-1">
          <label
            v-for="tool in availableTools"
            :key="tool"
            class="flex items-center gap-1 text-sm text-foreground truncate"
          >
            <input
              type="checkbox"
              :disabled="readonly"
              :checked="!form.disabledTools.includes(tool)"
              class="disabled:opacity-50"
              @change="toggleTool(tool)"
            />
            <span class="truncate">{{ tool }}</span>
          </label>
        </div>
      </div>

      <!-- CLI 命令白名单 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">CLI 命令白名单</label>
        <div class="mt-1 grid grid-cols-3 gap-x-4 gap-y-1">
          <label
            v-for="cmd in availableCliCommands"
            :key="cmd"
            class="flex items-center gap-1 text-sm text-foreground truncate"
          >
            <input
              type="checkbox"
              :disabled="readonly"
              :checked="form.allowedCliCommands.includes(cmd)"
              class="disabled:opacity-50"
              @change="toggleCliCommand(cmd)"
            />
            <span class="truncate">{{ cmd }}</span>
          </label>
        </div>
      </div>

      <!-- 参数 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">参数</label>
        <div class="mt-1 grid grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-muted-foreground">temperature</label>
            <input
              v-model.number="form.temperature"
              :disabled="readonly"
              type="number"
              step="0.1"
              min="0"
              max="2"
              class="mt-0.5 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label class="text-xs text-muted-foreground">maxTokens</label>
            <input
              v-model.number="form.maxTokens"
              :disabled="readonly"
              type="number"
              step="100"
              min="0"
              class="mt-0.5 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <!-- 开关 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">开关</label>
        <div class="mt-1 flex flex-wrap gap-4">
          <label class="flex items-center gap-1 text-sm text-foreground">
            <input
              type="checkbox"
              v-model="form.subagentEnabled"
              :disabled="readonly"
              class="disabled:opacity-50"
            />
            subagentEnabled
          </label>
          <label class="flex items-center gap-1 text-sm text-foreground">
            <input
              type="checkbox"
              v-model="form.enableThinking"
              :disabled="readonly"
              class="disabled:opacity-50"
            />
            enableThinking
          </label>
        </div>
      </div>

      <!-- 底部 -->
      <div class="pb-4">
        <button
          v-if="!readonly"
          :disabled="saving"
          class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
          @click="save"
        >
          {{ saving ? "保存中..." : "保存" }}
        </button>
        <p v-else class="text-xs text-muted-foreground">内置 Agent 仅在开发模式下可编辑</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentStore } from "@/stores/agent";
import type { Agent } from "@shared/types/agent";
import type { BuiltinAgentInfo } from "@shared/types/presenters";

const props = defineProps<{
  agentInfo?: BuiltinAgentInfo | null;
  agent?: Agent | null;
  isBuiltin: boolean;
  isDev: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const PRESET_COLORS = [
  "#a855f7",
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];
const CAPABILITIES = ["reasoning", "vision", "image_gen", "tool_call"];

const devPresenter = usePresenter("devPresenter");
const agentConfigPresenter = usePresenter("agentConfigPresenter");
const agentStore = useAgentStore();

const readonly = computed(() => props.isBuiltin && !props.isDev);
const saving = ref(false);
const availableTools = ref<string[]>([]);
const availableCliCommands = ref<string[]>([]);

const form = reactive({
  name: "",
  description: "",
  themeColor: "",
  soul: "",
  capabilityRequirements: [] as string[],
  disabledTools: [] as string[],
  allowedCliCommands: [] as string[],
  temperature: undefined as number | undefined,
  maxTokens: undefined as number | undefined,
  subagentEnabled: false,
  enableThinking: false,
});

function toggleCapability(cap: string) {
  const idx = form.capabilityRequirements.indexOf(cap);
  if (idx >= 0) form.capabilityRequirements.splice(idx, 1);
  else form.capabilityRequirements.push(cap);
}

function toggleTool(tool: string) {
  const idx = form.disabledTools.indexOf(tool);
  if (idx >= 0) form.disabledTools.splice(idx, 1);
  else form.disabledTools.push(tool);
}

function toggleCliCommand(cmd: string) {
  const idx = form.allowedCliCommands.indexOf(cmd);
  if (idx >= 0) form.allowedCliCommands.splice(idx, 1);
  else form.allowedCliCommands.push(cmd);
}

function loadBuiltin(info: BuiltinAgentInfo) {
  const cfg = info.config as Record<string, unknown>;
  form.name = (cfg.name as string) || info.id;
  form.description = (cfg.description as string) || "";
  form.themeColor = (cfg.themeColor as string) || "";
  form.soul = info.soul || "";
  form.capabilityRequirements = ((cfg.capabilityRequirements as string[]) || []).slice();
  form.disabledTools = ((cfg.disabledTools as string[]) || []).slice();
  form.allowedCliCommands = ((cfg.allowedCliCommands as string[]) || []).slice();
  form.temperature = cfg.temperature as number | undefined;
  form.maxTokens = cfg.maxTokens as number | undefined;
  form.subagentEnabled = (cfg.subagentEnabled as boolean) || false;
  form.enableThinking = (cfg.enableThinking as boolean) || false;
}

async function loadCustom(agent: Agent) {
  form.name = agent.name;
  form.description = agent.description || "";
  form.themeColor = agent.themeColor || "";
  const cfg = agent.config || {};
  form.capabilityRequirements = (cfg.capabilityRequirements || []).slice();
  form.disabledTools = (cfg.disabledTools || []).slice();
  form.allowedCliCommands = (cfg.allowedCliCommands || []).slice();
  form.temperature = cfg.temperature;
  form.maxTokens = cfg.maxTokens;
  form.subagentEnabled = cfg.subagentEnabled || false;
  form.enableThinking = cfg.enableThinking || false;
  // Load soul from file
  const soul = (await agentConfigPresenter.readSoulMd(agent.id)) as string;
  form.soul = soul || "";
}

watch(
  () => props.agentInfo,
  (info) => {
    if (info && props.isBuiltin) loadBuiltin(info);
  },
  { immediate: true },
);

watch(
  () => props.agent,
  (agent) => {
    if (agent && !props.isBuiltin) loadCustom(agent);
  },
  { immediate: true },
);

async function save() {
  saving.value = true;
  try {
    if (props.isBuiltin && props.agentInfo) {
      const config: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        themeColor: form.themeColor || undefined,
        capabilityRequirements: form.capabilityRequirements,
        disabledTools: form.disabledTools.length ? form.disabledTools : undefined,
        allowedCliCommands: form.allowedCliCommands.length ? form.allowedCliCommands : undefined,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
        subagentEnabled: form.subagentEnabled || undefined,
        enableThinking: form.enableThinking || undefined,
      };
      await devPresenter.saveBuiltinAgent(props.agentInfo.id, config, form.soul);
      emit("saved");
    } else if (props.agent) {
      await agentStore.updateAgent(props.agent.id, {
        name: form.name,
        description: form.description,
        themeColor: form.themeColor || null,
        config: {
          capabilityRequirements: form.capabilityRequirements,
          disabledTools: form.disabledTools.length ? form.disabledTools : undefined,
          allowedCliCommands: form.allowedCliCommands.length ? form.allowedCliCommands : undefined,
          temperature: form.temperature,
          maxTokens: form.maxTokens,
          subagentEnabled: form.subagentEnabled || undefined,
          enableThinking: form.enableThinking || undefined,
          agentSoul: form.soul || undefined,
        },
      });
      emit("saved");
    }
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  availableTools.value = (await devPresenter.listAvailableTools()) as string[];
  availableCliCommands.value = (await devPresenter.listAvailableCliCommands()) as string[];
});
</script>
