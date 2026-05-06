<template>
  <div class="flex h-full">
    <!-- Left panel: agent list -->
    <div class="flex w-[250px] flex-col border-r border-border">
      <div class="flex-1 overflow-y-auto p-2 space-y-3">
        <!-- 内置 Agents -->
        <div>
          <div class="px-2 text-xs font-medium text-muted-foreground">内置</div>
          <div class="mt-1 space-y-0.5">
            <button
              v-for="a in builtinAgents"
              :key="a.id"
              class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
              :class="{ 'bg-muted': selectedId === a.id }"
              @click="selectBuiltin(a.id)"
            >
              {{ getBuiltinName(a) }}
            </button>
          </div>
        </div>

        <!-- 自定义 Agents -->
        <div>
          <div class="px-2 text-xs font-medium text-muted-foreground">自定义</div>
          <div class="mt-1 space-y-0.5">
            <button
              v-for="a in customAgents"
              :key="a.id"
              class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
              :class="{ 'bg-muted': selectedId === a.id }"
              @click="selectCustom(a.id)"
            >
              {{ a.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom buttons -->
      <div class="border-t border-border p-2 space-y-1">
        <button
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
          @click="createCustomAgent"
        >
          + 新建 Agent
        </button>
        <button
          v-if="isDev"
          class="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/50"
          @click="createBuiltinAgent"
        >
          + 新建内置 Agent
        </button>
      </div>
    </div>

    <!-- Right panel: edit form -->
    <div class="flex-1 min-w-0">
      <AgentEditForm
        v-if="selectedId"
        :key="selectedId"
        :agent-info="selectedBuiltinInfo"
        :agent="selectedCustomAgent"
        :is-builtin="selectedIsBuiltin"
        :is-dev="isDev"
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
import { usePresenter } from "@/composables/usePresenter";
import { useAgentStore } from "@/stores/agent";
import type { BuiltinAgentInfo } from "@shared/types/presenters";
import AgentEditForm from "./AgentEditForm.vue";

const devPresenter = usePresenter("devPresenter");
const agentStore = useAgentStore();

const isDev = ref(false);
const builtinAgents = ref<BuiltinAgentInfo[]>([]);
const selectedId = ref<string | null>(null);
const selectedIsBuiltin = ref(false);

const customAgents = computed(() => agentStore.agents.filter((a) => a.type === "custom"));

const selectedBuiltinInfo = computed(() =>
  selectedIsBuiltin.value
    ? builtinAgents.value.find((a) => a.id === selectedId.value) || null
    : null,
);

const selectedCustomAgent = computed(() =>
  !selectedIsBuiltin.value
    ? customAgents.value.find((a) => a.id === selectedId.value) || null
    : null,
);

function getBuiltinName(a: BuiltinAgentInfo): string {
  return ((a.config as Record<string, unknown>).name as string) || a.id;
}

function selectBuiltin(id: string) {
  selectedId.value = id;
  selectedIsBuiltin.value = true;
}

function selectCustom(id: string) {
  selectedId.value = id;
  selectedIsBuiltin.value = false;
}

async function createCustomAgent() {
  const name = window.prompt("Agent 名称");
  if (!name) return;
  const agent = await agentStore.createAgent({ name });
  selectCustom(agent.id);
}

async function createBuiltinAgent() {
  const id = window.prompt("内置 Agent ID (kebab-case)");
  if (!id) return;
  await devPresenter.createBuiltinAgent(id);
  builtinAgents.value = (await devPresenter.listBuiltinAgents()) as BuiltinAgentInfo[];
  selectBuiltin(id);
}

async function onSaved() {
  builtinAgents.value = (await devPresenter.listBuiltinAgents()) as BuiltinAgentInfo[];
  await agentStore.fetchAgents();
}

onMounted(async () => {
  isDev.value = (await devPresenter.isDev()) as boolean;
  builtinAgents.value = (await devPresenter.listBuiltinAgents()) as BuiltinAgentInfo[];
  await agentStore.fetchAgents();
});
</script>
