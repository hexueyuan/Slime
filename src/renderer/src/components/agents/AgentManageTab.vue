<template>
  <div class="flex h-full">
    <!-- Left panel: agent list -->
    <div
      class="flex w-[270px] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-app-sidebar)]"
    >
      <div class="flex-1 space-y-1 overflow-y-auto p-3">
        <SlimeListItem
          v-for="a in agentStore.agents"
          :key="a.id"
          :selected="selectedId === a.id"
          @select="selectAgent(a.id)"
        >
          {{ a.name }}
          <template #trailing>
            <SlimeBadge v-if="a.type === 'builtin'" variant="accent">内置</SlimeBadge>
            <SlimeIconButton
              v-else
              icon="lucide:trash-2"
              title="删除 Agent"
              size="sm"
              class="opacity-0 transition-opacity group-hover:opacity-100"
              @click.stop="deleteAgent(a.id)"
            />
          </template>
        </SlimeListItem>

        <div
          v-if="agentStore.agents.length <= 1"
          class="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-control)] p-4 text-center text-xs text-[var(--color-text-muted)]"
        >
          <p>克隆 slime-market 获取更多 Agent：</p>
          <code class="text-xs"
            >git clone https://github.com/hexueyuan/slime-market ~/.slime/slime-market</code
          >
        </div>
      </div>

      <!-- Bottom buttons -->
      <div class="border-t border-[var(--color-border-subtle)] p-3">
        <SlimeButton class="w-full justify-start" variant="secondary" @click="createCustomAgent">
          + 新建 Agent
        </SlimeButton>
      </div>
    </div>

    <!-- Right panel: edit form -->
    <div class="min-w-0 flex-1 bg-[var(--color-app-canvas)]">
      <AgentEditForm
        v-if="selectedAgent"
        :key="selectedAgent.id"
        :agent="selectedAgent"
        :is-builtin="selectedAgent.type === 'builtin'"
        :is-dev="isDev"
        @saved="onSaved"
      />
      <div
        v-else
        class="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]"
      >
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
import SlimeBadge from "@/components/ui/SlimeBadge.vue";
import SlimeButton from "@/components/ui/SlimeButton.vue";
import SlimeIconButton from "@/components/ui/SlimeIconButton.vue";
import SlimeListItem from "@/components/ui/SlimeListItem.vue";
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
