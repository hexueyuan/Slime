export interface BuiltinAgentInfo {
  id: string;
  config: Record<string, unknown>;
  prompt: string;
}

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
  source?: "builtin" | "installed";
}

export interface IDevPresenter {
  listBuiltinAgents(): Promise<BuiltinAgentInfo[]>;
  getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null>;
  saveBuiltinAgent(agentId: string, config: Record<string, unknown>, prompt: string): Promise<void>;
  createBuiltinAgent(agentId: string): Promise<void>;
  deleteBuiltinAgent(agentId: string): Promise<void>;
  listGlobalSkills(): Promise<SkillManifest[]>;
  installSkill(sourcePath: string): Promise<{ success: boolean; error?: string }>;
  uninstallSkill(skillName: string): Promise<void>;
  uninstallBuiltinSkill(skillName: string): Promise<void>;
  getSkillContent(skillName: string, source: "builtin" | "installed"): Promise<string | null>;
  saveSkillContent(
    skillName: string,
    source: "builtin" | "installed",
    content: string,
  ): Promise<void>;
  listAvailableTools(): Promise<string[]>;
  listAvailableCliCommands(): Promise<string[]>;
  isDev(): Promise<boolean>;
}
