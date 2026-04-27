import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { Agent } from "@shared/types/agent";

export const useAgentStore = defineStore("agent", () => {
  const agentConfig = usePresenter("agentConfigPresenter");

  const agents = ref<Agent[]>([]);
  const selectedAgentId = ref<string | null>(null);

  const enabledAgents = computed(() => agents.value.filter((a) => a.enabled));
  const selectedAgent = computed(
    () => agents.value.find((a) => a.id === selectedAgentId.value) ?? null,
  );

  async function fetchAgents() {
    agents.value = (await agentConfig.listAgents()) as Agent[];
  }

  function setSelectedAgent(id: string | null) {
    selectedAgentId.value = id;
  }

  async function createAgent(data: Partial<Agent>): Promise<Agent> {
    const agent = (await agentConfig.createAgent(data)) as Agent;
    await fetchAgents();
    return agent;
  }

  async function updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const agent = (await agentConfig.updateAgent(id, data)) as Agent;
    await fetchAgents();
    return agent;
  }

  async function deleteAgent(id: string) {
    await agentConfig.deleteAgent(id);
    await fetchAgents();
    if (selectedAgentId.value === id) {
      selectedAgentId.value = null;
    }
  }

  return {
    agents,
    selectedAgentId,
    enabledAgents,
    selectedAgent,
    fetchAgents,
    setSelectedAgent,
    createAgent,
    updateAgent,
    deleteAgent,
  };
});
