<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import { usePresenter } from "@/composables/usePresenter";
import type { Agent, AgentAvatar, AgentConfig } from "@shared/types/agent";

const props = defineProps<{
  open: boolean;
  agentId?: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const agentStore = useAgentStore();
const agentConfig = usePresenter("agentConfigPresenter");

const isEdit = computed(() => !!props.agentId);
const isProtected = ref(false);

// Form state
const name = ref("");
const description = ref("");
const avatarType = ref<"icon" | "monogram" | "image">("icon");
const avatarIcon = ref("lucide:bot");
const avatarColor = ref("#a855f7");
const avatarText = ref("");
const avatarBgColor = ref("#7c3aed");
const avatarImagePath = ref<string | null>(null);
const pickingImage = ref(false);
const systemPrompt = ref("");
const capabilities = ref<string[]>(["reasoning"]);
const temperature = ref(0.7);
const contextLength = ref<number | undefined>(undefined);
const maxTokens = ref<number | undefined>(undefined);
const disabledTools = ref<string[]>([]);
const subagentEnabled = ref(false);
const enabled = ref(true);

const PRESET_ICONS = [
  "lucide:bot",
  "lucide:code",
  "lucide:pen-line",
  "lucide:brain",
  "lucide:search",
  "lucide:shield",
  "lucide:zap",
  "lucide:palette",
];

const PRESET_COLORS = ["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const CAPABILITIES = ["reasoning", "vision", "image_gen", "tool_call"];

const TOOLS = [
  { key: "read_file", label: "读取文件" },
  { key: "write_file", label: "写入文件" },
  { key: "edit_file", label: "编辑文件" },
  { key: "execute_command", label: "执行命令" },
  { key: "ask_user", label: "询问用户" },
  { key: "open_url", label: "打开链接" },
];

const nameError = ref("");

watch(
  () => props.open,
  (val) => {
    if (!val) return;
    nameError.value = "";
    if (props.agentId) {
      // Edit mode: load agent
      const agent = agentStore.agents.find((a) => a.id === props.agentId);
      if (agent) {
        isProtected.value = agent.protected;
        name.value = agent.name;
        description.value = agent.description ?? "";
        if (agent.avatar) {
          if (agent.avatar.kind === "image") {
            avatarType.value = "image";
            avatarImagePath.value = agent.avatar.path;
          } else if (agent.avatar.kind === "lucide") {
            avatarType.value = "icon";
            avatarIcon.value = agent.avatar.icon ?? "lucide:bot";
            avatarColor.value = agent.avatar.color ?? "#a855f7";
          } else {
            avatarType.value = "monogram";
            avatarText.value = agent.avatar.text ?? "";
            avatarBgColor.value = agent.avatar.backgroundColor ?? "#7c3aed";
          }
        }
        const cfg = agent.config;
        systemPrompt.value = cfg?.systemPrompt ?? "";
        capabilities.value = cfg?.capabilityRequirements ?? ["reasoning"];
        temperature.value = cfg?.temperature ?? 0.7;
        contextLength.value = cfg?.contextLength;
        maxTokens.value = cfg?.maxTokens;
        disabledTools.value = cfg?.disabledTools ?? [];
        subagentEnabled.value = cfg?.subagentEnabled ?? false;
        enabled.value = agent.enabled;
      }
    } else {
      // Create mode: reset
      isProtected.value = false;
      name.value = "";
      description.value = "";
      avatarType.value = "icon";
      avatarIcon.value = "lucide:bot";
      avatarColor.value = "#a855f7";
      avatarText.value = "";
      avatarBgColor.value = "#7c3aed";
      avatarImagePath.value = null;
      systemPrompt.value = "";
      capabilities.value = ["reasoning"];
      temperature.value = 0.7;
      contextLength.value = undefined;
      maxTokens.value = undefined;
      disabledTools.value = [];
      subagentEnabled.value = false;
      enabled.value = true;
    }
  },
);

function toggleCapability(cap: string) {
  const idx = capabilities.value.indexOf(cap);
  if (idx >= 0) {
    capabilities.value.splice(idx, 1);
  } else {
    capabilities.value.push(cap);
  }
}

function toggleTool(tool: string) {
  const idx = disabledTools.value.indexOf(tool);
  if (idx >= 0) {
    disabledTools.value.splice(idx, 1);
  } else {
    disabledTools.value.push(tool);
  }
}

async function onPickImage() {
  pickingImage.value = true;
  try {
    const path = (await agentConfig.pickAvatar()) as string | null;
    if (path) avatarImagePath.value = path;
  } finally {
    pickingImage.value = false;
  }
}

async function onSave() {
  if (!name.value.trim()) {
    nameError.value = "名称不能为空";
    return;
  }

  let avatar: AgentAvatar;
  if (avatarType.value === "image" && avatarImagePath.value) {
    avatar = { kind: "image", path: avatarImagePath.value };
  } else if (avatarType.value === "icon") {
    avatar = { kind: "lucide", icon: avatarIcon.value, color: avatarColor.value };
  } else {
    avatar = {
      kind: "monogram",
      text: avatarText.value || "?",
      backgroundColor: avatarBgColor.value,
    };
  }

  const config: AgentConfig = {
    capabilityRequirements: capabilities.value,
    systemPrompt: systemPrompt.value || undefined,
    temperature: temperature.value,
    contextLength: contextLength.value,
    maxTokens: maxTokens.value,
    disabledTools: disabledTools.value.length > 0 ? disabledTools.value : undefined,
    subagentEnabled: subagentEnabled.value,
  };

  const data: Partial<Agent> = {
    name: name.value.trim(),
    description: description.value || undefined,
    avatar,
    config,
    enabled: enabled.value,
  };

  if (isEdit.value && props.agentId) {
    await agentStore.updateAgent(props.agentId, data);
  } else {
    await agentStore.createAgent(data);
  }

  emit("saved");
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <div
        class="relative flex w-[560px] max-h-[80vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-border px-5 py-3">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-foreground">
              {{ isEdit ? "编辑 Agent" : "新建 Agent" }}
            </h2>
            <span
              v-if="isProtected"
              class="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-400"
            >
              内置 Agent
            </span>
          </div>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="$emit('update:open', false)"
          >
            <Icon icon="lucide:x" class="h-4 w-4" />
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <!-- Name -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">名称 *</label>
            <input
              v-model="name"
              :disabled="isProtected"
              type="text"
              class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
              placeholder="Agent 名称"
            />
            <p v-if="nameError" class="mt-1 text-xs text-red-400">{{ nameError }}</p>
          </div>

          <!-- Description -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">描述</label>
            <input
              v-model="description"
              type="text"
              class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none"
              placeholder="简短描述"
            />
          </div>

          <!-- Avatar -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">头像</label>
            <div class="flex gap-2 mb-2">
              <button
                :class="[
                  'rounded px-2 py-1 text-xs',
                  avatarType === 'icon'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-muted-foreground hover:bg-muted',
                ]"
                @click="avatarType = 'icon'"
              >
                图标
              </button>
              <button
                :class="[
                  'rounded px-2 py-1 text-xs',
                  avatarType === 'monogram'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-muted-foreground hover:bg-muted',
                ]"
                @click="avatarType = 'monogram'"
              >
                文字
              </button>
              <button
                :class="[
                  'rounded px-2 py-1 text-xs',
                  avatarType === 'image'
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-muted-foreground hover:bg-muted',
                ]"
                @click="avatarType = 'image'"
              >
                图片
              </button>
            </div>
            <!-- Icon mode -->
            <div v-if="avatarType === 'icon'">
              <div class="flex flex-wrap gap-2 mb-2">
                <button
                  v-for="icon in PRESET_ICONS"
                  :key="icon"
                  :class="[
                    'flex h-8 w-8 items-center justify-center rounded-md border',
                    avatarIcon === icon
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-border hover:bg-muted',
                  ]"
                  @click="avatarIcon = icon"
                >
                  <Icon :icon="icon" class="h-4 w-4" :style="{ color: avatarColor }" />
                </button>
              </div>
              <div class="flex gap-1.5">
                <button
                  v-for="color in PRESET_COLORS"
                  :key="color"
                  :class="[
                    'h-5 w-5 rounded-full border-2',
                    avatarColor === color ? 'border-foreground' : 'border-transparent',
                  ]"
                  :style="{ backgroundColor: color }"
                  @click="avatarColor = color"
                />
              </div>
            </div>
            <!-- Monogram mode -->
            <div v-else-if="avatarType === 'monogram'" class="flex items-center gap-3">
              <input
                v-model="avatarText"
                type="text"
                maxlength="2"
                class="w-16 rounded-md border border-border bg-muted/50 px-2 py-1 text-center text-sm text-foreground focus:border-violet-500 focus:outline-none"
                placeholder="AB"
              />
              <div class="flex gap-1.5">
                <button
                  v-for="color in PRESET_COLORS"
                  :key="color"
                  :class="[
                    'h-5 w-5 rounded-full border-2',
                    avatarBgColor === color ? 'border-foreground' : 'border-transparent',
                  ]"
                  :style="{ backgroundColor: color }"
                  @click="avatarBgColor = color"
                />
              </div>
            </div>
            <!-- Image mode -->
            <div v-else class="flex items-center gap-3">
              <button
                class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                :disabled="pickingImage"
                @click="onPickImage"
              >
                <Icon icon="lucide:upload" class="h-3.5 w-3.5" />
                {{ pickingImage ? "选择中..." : avatarImagePath ? "重新选择" : "选择图片" }}
              </button>
              <span v-if="avatarImagePath" class="truncate text-xs text-muted-foreground">
                {{ avatarImagePath.split("/").pop() }}
              </span>
            </div>
          </div>

          <!-- System Prompt -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">系统提示词</label>
            <textarea
              v-model="systemPrompt"
              rows="3"
              class="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none resize-none"
              placeholder="自定义系统提示词..."
            />
          </div>

          <!-- Capabilities -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">能力需求</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="cap in CAPABILITIES"
                :key="cap"
                :class="[
                  'rounded-full px-2.5 py-1 text-xs transition-colors',
                  capabilities.includes(cap)
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                ]"
                @click="toggleCapability(cap)"
              >
                {{ cap }}
              </button>
            </div>
          </div>

          <!-- Temperature -->
          <div>
            <label class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>温度</span>
              <span class="text-foreground">{{ temperature.toFixed(1) }}</span>
            </label>
            <input
              v-model.number="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              class="w-full accent-violet-500"
            />
          </div>

          <!-- Number inputs row -->
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="mb-1 block text-xs text-muted-foreground">上下文长度</label>
              <input
                v-model.number="contextLength"
                type="number"
                class="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:border-violet-500 focus:outline-none"
                placeholder="128000"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-muted-foreground">最大输出</label>
              <input
                v-model.number="maxTokens"
                type="number"
                class="w-full rounded-md border border-border bg-muted/50 px-2 py-1.5 text-sm text-foreground focus:border-violet-500 focus:outline-none"
                placeholder="4096"
              />
            </div>
          </div>

          <!-- Tools -->
          <div>
            <label class="mb-1 block text-xs text-muted-foreground">工具（取消勾选则禁用）</label>
            <div class="space-y-1">
              <label
                v-for="tool in TOOLS"
                :key="tool.key"
                class="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :checked="!disabledTools.includes(tool.key)"
                  class="accent-violet-500"
                  @change="toggleTool(tool.key)"
                />
                {{ tool.label }}
              </label>
            </div>
          </div>

          <!-- Toggles -->
          <div class="flex items-center justify-between">
            <span class="text-sm text-foreground">子 Agent 调度</span>
            <button
              :class="[
                'relative h-5 w-9 rounded-full transition-colors',
                subagentEnabled ? 'bg-violet-500' : 'bg-muted-foreground/30',
              ]"
              @click="subagentEnabled = !subagentEnabled"
            >
              <span
                :class="[
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                  subagentEnabled ? 'translate-x-4' : 'translate-x-0.5',
                ]"
              />
            </button>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm text-foreground">启用</span>
            <button
              :class="[
                'relative h-5 w-9 rounded-full transition-colors',
                enabled ? 'bg-violet-500' : 'bg-muted-foreground/30',
              ]"
              @click="enabled = !enabled"
            >
              <span
                :class="[
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                  enabled ? 'translate-x-4' : 'translate-x-0.5',
                ]"
              />
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            class="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="$emit('update:open', false)"
          >
            取消
          </button>
          <button
            class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-500"
            @click="onSave"
          >
            {{ isEdit ? "保存" : "创建" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
