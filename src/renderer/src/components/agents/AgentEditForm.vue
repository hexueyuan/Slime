<template>
  <div class="flex h-full flex-col overflow-y-auto p-4">
    <div class="mx-auto w-full max-w-2xl space-y-5">
      <!-- ID (non-create mode) -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">ID</label>
        <div class="mt-1 text-sm text-foreground font-mono">{{ agent?.id ?? agentInfo?.id }}</div>
      </div>

      <!-- 头像 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">头像</label>
        <div class="mt-1 flex items-center gap-3">
          <AgentAvatar :avatar="currentAvatar" size="xl" />
          <button
            v-if="!readonly"
            class="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
            @click="changeAvatar"
          >
            更换头像
          </button>
        </div>
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

      <!-- MBTI 性格类型 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">MBTI 性格类型</label>
        <div class="mt-1 grid grid-cols-4 gap-2">
          <button
            v-for="mbti in MBTI_TYPES"
            :key="mbti"
            :disabled="readonly"
            class="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-50"
            :class="
              form.mbti === mbti
                ? 'border-violet-500 bg-violet-500/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            "
            @click="form.mbti = mbti"
          >
            <span
              class="h-3 w-3 shrink-0 rounded-full"
              :style="{ backgroundColor: getMBTIColor(mbti) }"
            />
            {{ mbti }}
          </button>
        </div>
      </div>

      <!-- 性别 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">性别</label>
        <select
          v-model="form.gender"
          :disabled="readonly"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <option value="unknown">未设置</option>
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </div>

      <!-- 出生日期 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">出生日期</label>
        <input
          v-model="form.birthday"
          :disabled="readonly"
          type="text"
          placeholder="YYYY-MM-DD"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
        />
      </div>

      <!-- 附加提示词 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">附加提示词</label>
        <textarea
          v-model="form.additionalPrompt"
          :disabled="readonly"
          rows="12"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono disabled:opacity-50"
          placeholder="追加到 MBTI 性格提示词之后..."
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
          >工具 <span class="text-muted-foreground">(勾选=启用)</span></label
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
              :checked="form.enabledTools.includes(tool)"
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

      <!-- Skill 白名单 -->
      <div>
        <label class="text-xs font-medium text-muted-foreground">Skill 白名单</label>
        <div class="mt-1 grid grid-cols-3 gap-x-4 gap-y-1">
          <label
            v-for="skill in availableSkills"
            :key="skill"
            class="flex items-center gap-1 text-sm text-foreground truncate"
          >
            <input
              type="checkbox"
              :disabled="readonly"
              :checked="form.enabledSkills.includes(skill)"
              class="disabled:opacity-50"
              @change="toggleSkill(skill)"
            />
            <span class="truncate">{{ skill }}</span>
          </label>
        </div>
        <p v-if="availableSkills.length === 0" class="mt-1 text-xs text-muted-foreground">
          暂无可用 Skill
        </p>
      </div>

      <!-- 参数 -->
      <!-- removed temperature and maxTokens -->

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
        <div v-if="!readonly" class="flex items-center gap-2">
          <button
            :disabled="saving"
            class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
            @click="save"
          >
            {{ saving ? "保存中..." : "保存" }}
          </button>
          <span v-if="saveSuccess" class="text-xs text-green-500">已保存</span>
        </div>
        <p v-else class="text-xs text-muted-foreground">内置 Agent 仅在开发模式下可编辑</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentStore } from "@/stores/agent";
import AgentAvatar from "@/components/chat/AgentAvatar.vue";
import type { Agent, AgentAvatar as AgentAvatarType, GenderType } from "@shared/types/agent";
import type { BuiltinAgentInfo } from "@shared/types/presenters";
import { type MBTIType, getMBTIColor } from "@shared/constants/mbti";

const props = defineProps<{
  agentInfo?: BuiltinAgentInfo | null;
  agent?: Agent | null;
  isBuiltin: boolean;
  isDev: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const MBTI_TYPES: MBTIType[] = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];
const CAPABILITIES = ["reasoning", "vision", "image_gen", "tool_call"];

const devPresenter = usePresenter("devPresenter");
const agentConfigPresenter = usePresenter("agentConfigPresenter");
const agentStore = useAgentStore();

const readonly = computed(() => props.isBuiltin && !props.isDev);
const saving = ref(false);
const saveSuccess = ref(false);
const availableTools = ref<string[]>([]);
const availableCliCommands = ref<string[]>([]);
const availableSkills = ref<string[]>([]);
const currentAvatar = ref<AgentAvatarType | null>(null);

async function changeAvatar() {
  const path = (await agentConfigPresenter.pickAvatar()) as string | null;
  if (!path) return;
  const agentId = props.agentInfo?.id ?? props.agent?.id;
  if (!agentId) return;
  await agentConfigPresenter.applyAvatar(agentId, path);
}

const form = reactive({
  name: "",
  description: "",
  mbti: "INTJ" as MBTIType,
  gender: "unknown" as GenderType,
  birthday: "",
  additionalPrompt: "",
  capabilityRequirements: [] as string[],
  enabledTools: [] as string[],
  allowedCliCommands: [] as string[],
  enabledSkills: [] as string[],
  subagentEnabled: false,
  enableThinking: false,
});

function toggleCapability(cap: string) {
  const idx = form.capabilityRequirements.indexOf(cap);
  if (idx >= 0) form.capabilityRequirements.splice(idx, 1);
  else form.capabilityRequirements.push(cap);
}

function toggleTool(tool: string) {
  const idx = form.enabledTools.indexOf(tool);
  if (idx >= 0) form.enabledTools.splice(idx, 1);
  else form.enabledTools.push(tool);
}

function toggleCliCommand(cmd: string) {
  const idx = form.allowedCliCommands.indexOf(cmd);
  if (idx >= 0) form.allowedCliCommands.splice(idx, 1);
  else form.allowedCliCommands.push(cmd);
}

function toggleSkill(name: string) {
  const idx = form.enabledSkills.indexOf(name);
  if (idx >= 0) form.enabledSkills.splice(idx, 1);
  else form.enabledSkills.push(name);
}

function loadBuiltin(info: BuiltinAgentInfo) {
  const cfg = info.config as Record<string, unknown>;
  form.name = (cfg.name as string) || info.id;
  form.description = (cfg.description as string) || "";
  form.mbti = (cfg.mbti as MBTIType) || "INTJ";
  form.gender = (cfg.gender as GenderType) || "unknown";
  form.birthday = (cfg.birthday as string) || "";
  form.additionalPrompt = info.prompt || "";
  form.capabilityRequirements = ((cfg.capabilityRequirements as string[]) || []).slice();
  form.enabledTools = ((cfg.enabledTools as string[]) || []).slice();
  form.allowedCliCommands = ((cfg.allowedCliCommands as string[]) || []).slice();
  form.enabledSkills = ((cfg.enabledSkills as string[]) || []).slice();
  form.subagentEnabled = (cfg.subagentEnabled as boolean) || false;
  form.enableThinking = (cfg.enableThinking as boolean) || false;
  // Load avatar from DB agent record
  const dbAgent = agentStore.agents.find((a) => a.id === info.id);
  currentAvatar.value = dbAgent?.avatar ?? null;
}

async function loadCustom(agent: Agent) {
  form.name = agent.name;
  form.description = agent.description || "";
  form.mbti = agent.mbti || "INTJ";
  form.gender = agent.gender || "unknown";
  form.birthday = agent.birthday || "";
  const cfg = agent.config || {};
  form.capabilityRequirements = (cfg.capabilityRequirements || []).slice();
  form.enabledTools = (cfg.enabledTools || []).slice();
  form.allowedCliCommands = (cfg.allowedCliCommands || []).slice();
  form.enabledSkills = (cfg.enabledSkills || []).slice();
  form.subagentEnabled = cfg.subagentEnabled || false;
  form.enableThinking = cfg.enableThinking || false;
  currentAvatar.value = agent.avatar ?? null;
  // Load prompt from file
  const prompt = (await agentConfigPresenter.readPromptMd(agent.id)) as string;
  form.additionalPrompt = prompt || "";
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
    if (agent) loadCustom(agent);
  },
  { immediate: true },
);

async function save() {
  saving.value = true;
  try {
    if (props.isBuiltin && props.agent) {
      const config: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        mbti: form.mbti,
        ...(form.gender !== "unknown" && { gender: form.gender }),
        ...(form.birthday && { birthday: form.birthday }),
        capabilityRequirements: form.capabilityRequirements,
        enabledTools: form.enabledTools,
        allowedCliCommands: form.allowedCliCommands.length ? form.allowedCliCommands : undefined,
        enabledSkills: form.enabledSkills.length ? form.enabledSkills : undefined,
        subagentEnabled: form.subagentEnabled || undefined,
        enableThinking: form.enableThinking || undefined,
      };
      await devPresenter.saveBuiltinAgent(props.agent.id, config, form.additionalPrompt);
      emit("saved");
    } else if (props.isBuiltin && props.agentInfo) {
      const config: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        mbti: form.mbti,
        ...(form.gender !== "unknown" && { gender: form.gender }),
        ...(form.birthday && { birthday: form.birthday }),
        capabilityRequirements: form.capabilityRequirements,
        enabledTools: form.enabledTools,
        allowedCliCommands: form.allowedCliCommands.length ? form.allowedCliCommands : undefined,
        enabledSkills: form.enabledSkills.length ? form.enabledSkills : undefined,
        subagentEnabled: form.subagentEnabled || undefined,
        enableThinking: form.enableThinking || undefined,
      };
      await devPresenter.saveBuiltinAgent(props.agentInfo.id, config, form.additionalPrompt);
      emit("saved");
    } else if (props.agent) {
      await agentStore.updateAgent(props.agent.id, {
        name: form.name,
        description: form.description,
        mbti: form.mbti,
        gender: form.gender !== "unknown" ? form.gender : undefined,
        birthday: form.birthday || undefined,
        config: {
          capabilityRequirements: form.capabilityRequirements,
          enabledTools: form.enabledTools,
          allowedCliCommands: form.allowedCliCommands.length ? form.allowedCliCommands : undefined,
          enabledSkills: form.enabledSkills.length ? form.enabledSkills : undefined,
          subagentEnabled: form.subagentEnabled || undefined,
          enableThinking: form.enableThinking || undefined,
          additionalPrompt: form.additionalPrompt || undefined,
        },
      });
      emit("saved");
    }
  } finally {
    saving.value = false;
    saveSuccess.value = true;
    setTimeout(() => (saveSuccess.value = false), 2000);
  }
}

onMounted(async () => {
  availableTools.value = (await devPresenter.listAvailableTools()) as string[];
  availableCliCommands.value = (await devPresenter.listAvailableCliCommands()) as string[];
  const skills = (await devPresenter.listGlobalSkills()) as { name: string }[];
  availableSkills.value = skills.map((s) => s.name);
});
</script>
