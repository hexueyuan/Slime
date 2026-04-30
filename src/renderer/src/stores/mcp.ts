import { ref } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { MCPServerDashboard, MCPToolRecord } from "@shared/types/mcp";

export const useMcpStore = defineStore("mcp", () => {
  const mcpPresenter = usePresenter("mcpServerPresenter");

  const servers = ref<MCPServerDashboard[]>([]);
  const serverTools = ref<Map<string, MCPToolRecord[]>>(new Map());

  async function loadServers() {
    servers.value = await mcpPresenter.listServers();
  }

  async function loadServerTools(serverId: string) {
    const tools = await mcpPresenter.getServerTools(serverId);
    serverTools.value.set(serverId, tools);
  }

  async function createServer(config: Parameters<typeof mcpPresenter.createServer>[0]) {
    await mcpPresenter.createServer(config);
    await loadServers();
  }

  async function updateServer(id: string, config: Parameters<typeof mcpPresenter.updateServer>[1]) {
    await mcpPresenter.updateServer(id, config);
    await loadServers();
  }

  async function deleteServer(id: string) {
    await mcpPresenter.deleteServer(id);
    await loadServers();
  }

  async function getSessionDisabledTools(sessionId: string): Promise<number[]> {
    return mcpPresenter.getSessionDisabledTools(sessionId);
  }

  async function setSessionToolState(sessionId: string, toolId: number, disabled: boolean) {
    await mcpPresenter.setSessionToolState(sessionId, toolId, disabled);
  }

  function getServerToolsCached(serverId: string): MCPToolRecord[] {
    return serverTools.value.get(serverId) ?? [];
  }

  return {
    servers,
    serverTools,
    loadServers,
    loadServerTools,
    createServer,
    updateServer,
    deleteServer,
    getSessionDisabledTools,
    setSessionToolState,
    getServerToolsCached,
  };
});
