import { randomUUID } from "crypto";
import { getDb } from "@/db";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { AGENT_EVENTS } from "@shared/events";
import type { Agent } from "@shared/types/agent";
import type { IAgentConfigPresenter } from "@shared/types/presenters/agentConfig.presenter";

export class AgentConfigPresenter implements IAgentConfigPresenter {
  init(): void {
    agentDao.ensureBuiltin(getDb());
  }

  async listAgents(): Promise<Agent[]> {
    return agentDao.listAgents(getDb());
  }

  async getAgent(id: string): Promise<Agent | null> {
    return agentDao.getAgentById(getDb(), id) ?? null;
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const id = data.id || randomUUID();
    const agent = agentDao.createAgent(getDb(), {
      id,
      name: data.name || "New Agent",
      type: data.type || "custom",
      enabled: data.enabled ?? true,
      protected: data.protected ?? false,
      description: data.description,
      avatar: data.avatar,
      config: data.config,
    });
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return agent;
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    agentDao.updateAgent(getDb(), id, data);
    const updated = agentDao.getAgentById(getDb(), id);
    if (!updated) throw new Error(`Agent ${id} not found`);
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    agentDao.removeAgent(getDb(), id);
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
  }
}
