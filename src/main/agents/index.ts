import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { app } from "electron";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  mbti?: MBTIType;
  config: AgentConfig;
}

interface AgentConfigJson {
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  mbti?: MBTIType;
  capabilityRequirements?: string[];
  enabledTools?: string[];
  allowedCliCommands?: string[];
  enabledSkills?: string[];
  subagentEnabled?: boolean;
  enableThinking?: boolean;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  mcpTools?: string[];
}

function getAgentsDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), "..", "resources", "agents");
  }
  return join(process.cwd(), "src", "main", "agents");
}

function loadBuiltinAgents(): BuiltinAgentDef[] {
  const agentsDir = getAgentsDir();
  const agents: BuiltinAgentDef[] = [];

  for (const entry of readdirSync(agentsDir)) {
    const dir = join(agentsDir, entry);
    if (!statSync(dir).isDirectory()) continue;

    const configPath = join(dir, "config.json");
    if (!existsSync(configPath)) continue;

    const cfg: AgentConfigJson = JSON.parse(readFileSync(configPath, "utf-8"));
    const promptPath = join(dir, "prompt.md");
    const soulPath = join(dir, "soul.md");
    const prompt = existsSync(promptPath)
      ? readFileSync(promptPath, "utf-8").trim()
      : existsSync(soulPath)
        ? readFileSync(soulPath, "utf-8").trim()
        : undefined;

    const {
      name,
      description,
      avatar,
      mbti,
      capabilityRequirements,
      enabledTools,
      enabledSkills,
      allowedCliCommands,
      subagentEnabled,
      enableThinking,
      temperature,
      contextLength,
      maxTokens,
      mcpTools,
    } = cfg;

    agents.push({
      id: entry,
      name,
      description,
      avatar,
      mbti,
      config: {
        capabilityRequirements,
        enabledTools,
        enabledSkills,
        allowedCliCommands,
        subagentEnabled,
        enableThinking,
        temperature,
        contextLength,
        maxTokens,
        mcpTools,
        additionalPrompt: prompt,
      },
    });
  }

  return agents;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = loadBuiltinAgents();
