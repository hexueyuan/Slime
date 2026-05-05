<script setup lang="ts">
import { ref, onMounted } from "vue";
import NewThreadInput from "./NewThreadInput.vue";
import AgentAvatar from "./AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import type { Agent } from "@shared/types/agent";

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();

const selectedAgentId = ref<string | null>(null);

onMounted(() => {
  const halAi = agentStore.enabledAgents.find((a) => a.id === "hal-ai");
  if (halAi) {
    selectedAgentId.value = halAi.id;
  } else if (agentStore.enabledAgents.length > 0) {
    selectedAgentId.value = agentStore.enabledAgents[0].id;
  }
});

async function onSend(content: string) {
  if (!selectedAgentId.value) return;
  const session = await sessionStore.createSession(selectedAgentId.value);
  await chatStore.sendMessage(session.id, content);
}

function agentColor(agent: Agent): string {
  return agent.themeColor ?? "#a855f7";
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <h2 class="mb-1 text-lg font-medium text-foreground">开始新对话</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择一个 Agent 开始</p>

      <!-- Agent cards -->
      <div class="flex flex-wrap justify-center gap-3">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :style="{
            '--agent-color': agentColor(agent),
            borderColor: selectedAgentId === agent.id ? agentColor(agent) : undefined,
            backgroundColor: selectedAgentId === agent.id ? agentColor(agent) + '1a' : undefined,
          }"
          :class="[
            'flex w-40 flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm transition-colors',
            selectedAgentId === agent.id
              ? 'text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="selectedAgentId = agent.id"
        >
          <AgentAvatar :avatar="agent.avatar" size="lg" />
          <span class="font-medium text-foreground">{{ agent.name }}</span>
          <span
            v-if="agent.description"
            class="line-clamp-2 text-center text-xs text-muted-foreground"
          >
            {{ agent.description }}
          </span>
        </button>
      </div>
    </div>

    <!-- Bottom input -->
    <NewThreadInput placeholder="输入消息开始对话..." :disabled="!selectedAgentId" @send="onSend" />
  </div>
</template>
