import type { Agent } from "../agent";

export interface IAgentConfigPresenter {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  createAgent(data: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, data: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
}
