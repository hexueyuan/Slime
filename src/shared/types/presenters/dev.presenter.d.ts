export interface BuiltinAgentInfo {
  id: string;
  config: Record<string, unknown>;
  soul: string;
}

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

export interface IDevPresenter {
  listBuiltinAgents(): Promise<BuiltinAgentInfo[]>;
  getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null>;
  saveBuiltinAgent(agentId: string, config: Record<string, unknown>, soul: string): Promise<void>;
  createBuiltinAgent(agentId: string): Promise<void>;
  deleteBuiltinAgent(agentId: string): Promise<void>;
  listGlobalSkills(): Promise<SkillManifest[]>;
  installSkill(sourcePath: string): Promise<{ success: boolean; error?: string }>;
  uninstallSkill(skillName: string): Promise<void>;
  listAvailableTools(): Promise<string[]>;
  listAvailableCliCommands(): Promise<string[]>;
  isDev(): Promise<boolean>;
}
