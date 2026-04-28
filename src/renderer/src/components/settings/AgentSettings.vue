<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useAgentStore } from "@/stores/agent";
import AgentAvatar from "@/components/chat/AgentAvatar.vue";
import AgentEditDialog from "@/components/chat/AgentEditDialog.vue";

const agentStore = useAgentStore();

const editOpen = ref(false);
const editAgentId = ref<string | undefined>(undefined);

onMounted(() => agentStore.fetchAgents());

function openNew() {
  editAgentId.value = undefined;
  editOpen.value = true;
}

function openEdit(id: string) {
  editAgentId.value = id;
  editOpen.value = true;
}

async function onDelete(id: string) {
  if (!window.confirm("确定删除该 Agent？")) return;
  await agentStore.deleteAgent(id);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground">Agent 管理</h3>
      <button
        data-testid="new-agent-btn"
        class="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500"
        @click="openNew"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        新建 Agent
      </button>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto">
      <div
        v-for="agent in agentStore.agents"
        :key="agent.id"
        data-testid="agent-row"
        class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
      >
        <AgentAvatar :avatar="agent.avatar" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-sm text-foreground">{{ agent.name }}</span>
            <span
              v-if="agent.protected"
              class="rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-400"
            >
              内置
            </span>
          </div>
          <div class="truncate text-xs text-muted-foreground">
            {{ agent.description || "-" }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            data-testid="edit-btn"
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            @click="openEdit(agent.id)"
          >
            <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!agent.protected"
            data-testid="delete-btn"
            class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400"
            @click="onDelete(agent.id)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        v-if="agentStore.agents.length === 0"
        class="py-8 text-center text-xs text-muted-foreground"
      >
        暂无 Agent
      </div>
    </div>

    <AgentEditDialog
      v-model:open="editOpen"
      :agent-id="editAgentId"
      @saved="agentStore.fetchAgents()"
    />
  </div>
</template>
