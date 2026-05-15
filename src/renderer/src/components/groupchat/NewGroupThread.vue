<script setup lang="ts">
import { ref, computed } from "vue";
import AgentAvatar from "../chat/AgentAvatar.vue";
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
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <h2 class="mb-1 text-lg font-medium text-foreground">创建群聊</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择 1 个或更多 Agent</p>

      <!-- Agent cards -->
      <div class="mb-6 flex flex-wrap justify-center gap-3">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :style="{
            '--agent-color': agentColor(agent),
            borderColor: selectedAgentIds.includes(agent.id) ? agentColor(agent) : undefined,
            backgroundColor: selectedAgentIds.includes(agent.id)
              ? agentColor(agent) + '1a'
              : undefined,
          }"
          :class="[
            'flex w-36 flex-col items-center gap-2 rounded-xl border px-3 py-3 text-sm transition-colors',
            selectedAgentIds.includes(agent.id)
              ? 'text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="toggleAgent(agent.id)"
        >
          <AgentAvatar :avatar="agent.avatar" size="md" />
          <span class="font-medium text-foreground">{{ agent.name }}</span>
        </button>
      </div>

      <!-- Moderator toggle -->
      <label class="mb-4 flex cursor-pointer items-center gap-2 text-sm">
        <input v-model="moderatorEnabled" type="checkbox" class="rounded" />
        <span class="text-foreground">启用智能路由（主持人）</span>
        <span class="text-xs text-muted-foreground">— 无需 @ 时自动判断回复者</span>
      </label>

      <!-- Workspace paths -->
      <div class="mb-4 w-full max-w-sm">
        <p class="mb-1 text-xs text-muted-foreground">工作目录（可选，支持 ~）</p>
        <div class="flex gap-2">
          <input
            v-model="newPathInput"
            type="text"
            placeholder="例如 ~/workspace/project"
            class="flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            @keydown.enter="addPath"
          />
          <button
            class="rounded bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/80"
            @click="addPath"
          >
            添加
          </button>
        </div>
        <ul v-if="workspacePaths.length > 0" class="mt-2 space-y-1">
          <li
            v-for="p in workspacePaths"
            :key="p"
            class="flex items-center justify-between rounded bg-muted px-2 py-1 text-xs"
          >
            <span class="text-foreground">{{ p }}</span>
            <button class="text-muted-foreground hover:text-foreground" @click="removePath(p)">
              ✕
            </button>
          </li>
        </ul>
      </div>

      <p v-if="selectedAgentIds.length < 1" class="text-xs text-muted-foreground">
        请至少选择 1 个 Agent
      </p>
    </div>

    <div class="border-t border-border p-4">
      <button
        :disabled="!canCreate"
        class="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
        @click="onCreate"
      >
        创建群聊
      </button>
    </div>
  </div>
</template>
