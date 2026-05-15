<script setup lang="ts">
import { ref, onMounted } from "vue";
import AgentAvatar from "./AgentAvatar.vue";
import SlimeAgentCard from "@/components/slime/SlimeAgentCard.vue";
import SlimeComposer from "@/components/ui/SlimeComposer.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import type { Agent } from "@shared/types/agent";
import { getMBTIColor } from "@shared/constants/mbti";

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
  return getMBTIColor(agent.mbti ?? "INTJ");
}
</script>

<template>
  <div class="flex h-full flex-col bg-[var(--color-app-canvas)]">
    <div class="flex flex-1 flex-col items-center justify-center px-8 pb-8">
      <h2 class="mb-2 text-[28px] font-semibold tracking-normal text-[var(--color-text-primary)]">
        要在 Slime 中构建什么？
      </h2>
      <p class="mb-7 text-sm text-[var(--color-text-secondary)]">选择一个 Agent 开始</p>

      <div class="flex max-w-[760px] flex-wrap justify-center gap-3">
        <SlimeAgentCard
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :name="agent.name"
          :description="agent.description"
          :selected="selectedAgentId === agent.id"
          :tone-color="agentColor(agent)"
          @select="selectedAgentId = agent.id"
        >
          <template #avatar>
            <AgentAvatar :avatar="agent.avatar" size="lg" />
          </template>
        </SlimeAgentCard>
      </div>
    </div>

    <div class="mx-auto w-full max-w-[760px] px-6 pb-7">
      <SlimeComposer
        placeholder="输入消息开始对话..."
        :disabled="!selectedAgentId"
        @submit="onSend"
      >
        <template #toolbar>
          <span class="text-[var(--color-text-muted)]">Slime</span>
        </template>
      </SlimeComposer>
    </div>
  </div>
</template>
