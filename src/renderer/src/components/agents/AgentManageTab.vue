<template>
  <div class="flex h-full">
    <!-- Left panel: agent list -->
    <div class="flex w-[250px] flex-col border-r border-border">
      <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
        <div
          v-for="a in agentStore.agents"
          :key="a.id"
          class="group flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
          :class="{ 'bg-muted': selectedId === a.id }"
          @click="selectAgent(a.id)"
        >
          <span class="flex-1 truncate text-foreground">{{ a.name }}</span>
          <span
            v-if="a.type === 'builtin'"
            class="shrink-0 rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
          >
            内置
          </span>
          <button
            v-else
            class="ml-1 shrink-0 hidden group-hover:inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            @click.stop="deleteAgent(a.id)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>

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
        :is-builtin="selectedAgent.type === 'builtin'"
        :is-dev="isDev"
        @saved="onSaved"
      />
      <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
        选择一个 Agent 进行编辑
      </div>
    </div>
  </div>

  <CreateAgentDialog
    v-if="showCreateDialog"
    @created="onCreated"
    @cancel="showCreateDialog = false"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useAgentStore } from "@/stores/agent";
import { usePresenter } from "@/composables/usePresenter";
import AgentEditForm from "./AgentEditForm.vue";
import CreateAgentDialog from "./CreateAgentDialog.vue";

const agentStore = useAgentStore();
const devPresenter = usePresenter("devPresenter");

const selectedId = ref<string | null>(null);
const isDev = ref(false);
const showCreateDialog = ref(false);

const selectedAgent = computed(
  () => agentStore.agents.find((a) => a.id === selectedId.value) || null,
);

function selectAgent(id: string) {
  selectedId.value = id;
}

async function createCustomAgent() {
  showCreateDialog.value = true;
}

async function onCreated(id: string) {
  showCreateDialog.value = false;
  await agentStore.fetchAgents();
  selectAgent(id);
}

async function deleteAgent(id: string) {
  await agentStore.deleteAgent(id);
  if (selectedId.value === id) selectedId.value = null;
}

async function onSaved() {
  await agentStore.fetchAgents();
}

onMounted(async () => {
  isDev.value = (await devPresenter.isDev()) as boolean;
  await agentStore.fetchAgents();
});
</script>
