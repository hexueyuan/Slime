<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import NewThreadInput from "./NewThreadInput.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import type { Agent } from "@shared/types/agent";

defineEmits<{
  openAgentEdit: [];
}>();

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

function getAvatarStyle(agent: Agent) {
  if (!agent.avatar) return {};
  if (agent.avatar.kind === "lucide") {
    return { color: agent.avatar.color ?? "#a855f7" };
  }
  return {};
}

async function onSend(content: string) {
  if (!selectedAgentId.value) return;
  const session = await sessionStore.createSession(selectedAgentId.value);
  await chatStore.sendMessage(session.id, content);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <!-- Title -->
      <Icon icon="lucide:message-square-plus" class="mb-3 h-10 w-10 text-violet-500/50" />
      <h2 class="mb-1 text-lg font-medium text-foreground">开始新对话</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择一个 Agent 开始</p>

      <!-- Agent chips -->
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :class="[
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
            selectedAgentId === agent.id
              ? 'border-violet-500 bg-violet-500/10 text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="selectedAgentId = agent.id"
        >
          <!-- Avatar -->
          <template v-if="agent.avatar?.kind === 'lucide'">
            <Icon :icon="agent.avatar.icon" class="h-4 w-4" :style="getAvatarStyle(agent)" />
          </template>
          <template v-else-if="agent.avatar?.kind === 'monogram'">
            <span
              class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white"
              :style="{ backgroundColor: agent.avatar.backgroundColor ?? '#7c3aed' }"
            >
              {{ agent.avatar.text }}
            </span>
          </template>
          <template v-else>
            <Icon icon="lucide:bot" class="h-4 w-4 text-violet-400" />
          </template>
          {{ agent.name }}
        </button>

        <!-- New Agent button -->
        <button
          class="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          @click="$emit('openAgentEdit')"
        >
          <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
          新建 Agent
        </button>
      </div>
    </div>

    <!-- Bottom input -->
    <NewThreadInput placeholder="输入消息开始对话..." :disabled="!selectedAgentId" @send="onSend" />
  </div>
</template>
