<template>
  <div class="flex h-full">
    <!-- Left panel: agent list -->
    <div class="flex w-[250px] flex-col border-r border-border">
      <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <button
          v-for="a in agentStore.agents"
          :key="a.id"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
          :class="{ 'bg-muted': selectedId === a.id }"
          @click="selectAgent(a.id)"
        >
          {{ a.name }}
        </button>

        <div
          v-if="agentStore.agents.length <= 1"
          class="p-4 text-xs text-muted-foreground text-center"
        >
          <p>克隆 slime-market 获取更多 Agent：</p>
          <code class="text-xs"
            >git clone https://github.com/hexueyuan/slime-market ~/.slime/slime-market</code
          >
        </div>
      </div>

      <!-- Bottom buttons -->
      <div class="border-t border-border p-2">
        <button
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
          @click="createCustomAgent"
        >
          + 新建 Agent
        </button>
      </div>
    </div>

    <!-- Right panel: edit form -->
    <div class="flex-1 min-w-0">
      <AgentEditForm
        v-if="selectedAgent"
        :key="selectedAgent.id"
        :agent="selectedAgent"
        :is-builtin="false"
        :is-dev="false"
        @saved="onSaved"
      />
      <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个 Agent 进行编辑
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useAgentStore } from "@/stores/agent";
import AgentEditForm from "./AgentEditForm.vue";

const agentStore = useAgentStore();

const selectedId = ref<string | null>(null);

const selectedAgent = computed(
  () => agentStore.agents.find((a) => a.id === selectedId.value) || null,
);

function selectAgent(id: string) {
  selectedId.value = id;
}

async function createCustomAgent() {
  const name = window.prompt("Agent 名称");
  if (!name) return;
  const agent = await agentStore.createAgent({ name });
  selectAgent(agent.id);
}

async function onSaved() {
  await agentStore.fetchAgents();
}

onMounted(async () => {
  await agentStore.fetchAgents();
});
</script>
