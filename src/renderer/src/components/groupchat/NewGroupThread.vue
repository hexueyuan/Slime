<script setup lang="ts">
import { ref, computed } from "vue";
import AgentAvatar from "../chat/AgentAvatar.vue";
import SlimeAgentCard from "@/components/slime/SlimeAgentCard.vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
import SlimeChecklist from "@/components/ui/SlimeChecklist.vue";
import SlimeInput from "@/components/ui/SlimeInput.vue";
import { useAgentStore } from "@/stores/agent";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { getMBTIColor } from "@shared/constants/mbti";
import type { Agent } from "@shared/types/agent";

const agentStore = useAgentStore();
const sessionStore = useGroupChatSessionStore();

const selectedAgentIds = ref<string[]>([]);
const moderatorEnabled = ref(false);
const workspacePaths = ref<string[]>([]);
const newPathInput = ref("");

const canCreate = computed(() => selectedAgentIds.value.length >= 1);

function toggleAgent(agentId: string) {
  const idx = selectedAgentIds.value.indexOf(agentId);
  if (idx === -1) {
    selectedAgentIds.value = [...selectedAgentIds.value, agentId];
  } else {
    selectedAgentIds.value = selectedAgentIds.value.filter((id) => id !== agentId);
  }
}

function agentColor(agent: Agent): string {
  return getMBTIColor(agent.mbti ?? "INTJ");
}

function addPath() {
  const p = newPathInput.value.trim();
  if (p && !workspacePaths.value.includes(p)) {
    workspacePaths.value = [...workspacePaths.value, p];
  }
  newPathInput.value = "";
}

function removePath(p: string) {
  workspacePaths.value = workspacePaths.value.filter((x) => x !== p);
}

async function onCreate() {
  if (!canCreate.value) return;
  await sessionStore.createSession(
    selectedAgentIds.value,
    moderatorEnabled.value,
    workspacePaths.value,
  );
}
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--color-app-canvas)]">
    <div class="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
      <h2 class="mb-2 text-[28px] font-semibold text-[var(--color-text-primary)]">创建群聊</h2>
      <p class="mb-7 text-sm text-[var(--color-text-secondary)]">选择 1 个或更多 Agent</p>

      <!-- Agent cards -->
      <div
        class="mb-6 grid w-full max-w-[760px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
      >
        <SlimeAgentCard
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :name="agent.name"
          :role="agent.config?.capabilityRequirements?.join(' · ') || agent.mbti"
          :description="agent.description"
          :selected="selectedAgentIds.includes(agent.id)"
          :tone-color="agentColor(agent)"
          @select="toggleAgent(agent.id)"
        >
          <template #avatar>
            <AgentAvatar :avatar="agent.avatar" size="md" />
          </template>
        </SlimeAgentCard>
      </div>

      <!-- Moderator toggle -->
      <div class="mb-4 w-full max-w-[520px]">
        <SlimeChecklist
          :items="[
            {
              id: 'moderator',
              title: '启用智能路由（主持人）',
              description: '无需 @ 时自动判断回复者',
              checked: moderatorEnabled,
              control: 'switch',
            },
          ]"
          @toggle="(_, checked) => (moderatorEnabled = checked)"
        />
      </div>

      <!-- Workspace paths -->
      <div class="mb-4 w-full max-w-[520px]">
        <p class="mb-2 text-xs text-[var(--color-text-muted)]">工作目录（可选，支持 ~）</p>
        <div class="flex min-w-0 flex-col gap-2 sm:flex-row">
          <SlimeInput
            v-model="newPathInput"
            placeholder="例如 ~/workspace/project"
            density="compact"
            @keydown.enter="addPath"
          />
          <SlimeButton size="sm" @click="addPath"> 添加 </SlimeButton>
        </div>
        <ul v-if="workspacePaths.length > 0" class="mt-2 space-y-1">
          <li
            v-for="p in workspacePaths"
            :key="p"
            class="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-control)] px-2 py-1 text-xs"
          >
            <span class="min-w-0 truncate text-[var(--color-text-primary)]">{{ p }}</span>
            <button
              class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              @click="removePath(p)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>

      <p v-if="selectedAgentIds.length < 1" class="text-xs text-[var(--color-text-muted)]">
        请至少选择 1 个 Agent
      </p>
    </div>

    <div class="border-t border-[var(--color-border-subtle)] p-4">
      <SlimeButton
        :disabled="!canCreate"
        class="w-full"
        variant="primary"
        size="lg"
        @click="onCreate"
      >
        创建群聊
      </SlimeButton>
    </div>
  </div>
</template>
