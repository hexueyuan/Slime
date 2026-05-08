<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";
import AgentAvatar from "../chat/AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useGroupChatSessionStore } from "@/stores/groupChatSession";
import { useGroupChatStore } from "@/stores/groupChat";
import { getMBTIColor } from "@shared/constants/mbti";
import type { Agent } from "@shared/types/agent";

const agentStore = useAgentStore();
const sessionStore = useGroupChatSessionStore();
const chatStore = useGroupChatStore();

const selectedAgentIds = ref<string[]>([]);
const moderatorEnabled = ref(false);
const inputValue = ref("");
const isComposing = ref(false);

const canCreate = computed(() => selectedAgentIds.value.length >= 2 && inputValue.value.trim());

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

async function onSend() {
  if (!canCreate.value) return;
  const content = inputValue.value.trim();
  const session = await sessionStore.createSession(selectedAgentIds.value, moderatorEnabled.value);
  await chatStore.sendMessage(session.id, content, []);
  inputValue.value = "";
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    onSend();
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <h2 class="mb-1 text-lg font-medium text-foreground">创建群聊</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择 2 个或更多 Agent</p>

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

      <p v-if="selectedAgentIds.length < 2" class="text-xs text-muted-foreground">
        已选 {{ selectedAgentIds.length }} 个，至少选 2 个
      </p>
    </div>

    <!-- Input -->
    <div class="border-t border-border p-3">
      <div class="flex items-end gap-2">
        <textarea
          v-model="inputValue"
          :disabled="selectedAgentIds.length < 2"
          placeholder="输入第一条消息，发送后创建群聊..."
          rows="1"
          class="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:outline-none disabled:opacity-50"
          @keydown="onKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
        <button
          :disabled="!canCreate"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
          @click="onSend"
        >
          <Icon icon="lucide:send" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
