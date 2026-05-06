import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig;
}

interface AgentConfigJson {
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  capabilityRequirements?: string[];
  disabledTools?: string[];
  subagentEnabled?: boolean;
  enableThinking?: boolean;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  mcpTools?: string[];
  disabledSkills?: string[];
}

function loadBuiltinAgents(): BuiltinAgentDef[] {
  const agentsDir = __dirname;
  const agents: BuiltinAgentDef[] = [];

  for (const entry of readdirSync(agentsDir)) {
    const dir = join(agentsDir, entry);
    if (!statSync(dir).isDirectory()) continue;

    const configPath = join(dir, "config.json");
    const soulPath = join(dir, "soul.md");
    if (!existsSync(configPath)) continue;

    const cfg: AgentConfigJson = JSON.parse(readFileSync(configPath, "utf-8"));
    const soul = existsSync(soulPath) ? readFileSync(soulPath, "utf-8").trim() : undefined;

    const {
      name,
      description,
      avatar,
      themeColor,
      capabilityRequirements,
      disabledTools,
      subagentEnabled,
      enableThinking,
      temperature,
      contextLength,
      maxTokens,
      mcpTools,
      disabledSkills,
    } = cfg;

    agents.push({
      id: entry,
      name,
      description,
      avatar,
      themeColor,
      config: {
        capabilityRequirements,
        disabledTools,
        subagentEnabled,
        enableThinking,
        temperature,
        contextLength,
        maxTokens,
        mcpTools,
        disabledSkills,
        agentSoul: soul,
      },
    });
  }

  return agents;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = loadBuiltinAgents();
