import type { Agent } from "../agent";
import type { SkillInfo } from "../skills";

export interface IAgentConfigPresenter {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  createAgent(data: Partial<Agent>): Promise<Agent>;
  updateAgent(id: string, data: Partial<Agent>): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  pickAvatar(): Promise<string | null>;
  applyAvatar(agentId: string, srcPath: string): Promise<void>;
  getAvatarUrl(relativePath: string): Promise<string | null>;
  listLocalSkills(agentId: string): Promise<SkillInfo[]>;
  readPromptMd(agentId: string): Promise<string>;
  getAgentSkillsDir(agentId: string): Promise<string | null>;
  getAgentDir(agentId: string): Promise<string | null>;
}
