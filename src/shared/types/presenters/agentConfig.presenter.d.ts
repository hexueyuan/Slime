import type { Agent } from "../agent";
import type { SkillInfo } from "../skills";

export interface IAgentConfigPresenter {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  createAgent(data: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, data: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  pickAvatar(): Promise<string | null>;
  getAvatarUrl(relativePath: string): Promise<string>;
  listLocalSkills(agentId: string): Promise<SkillInfo[]>;
  readSoulMd(agentId: string): Promise<string>;
  getAgentSkillsDir(agentId: string): Promise<string | null>;
  getAgentDir(agentId: string): Promise<string | null>;
}
