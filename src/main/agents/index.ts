import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";
import { readFileSync, existsSync } from "fs";
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
  mcpTools?: string[];
}

function getHalDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), "..", "resources", "agents", "hal-ai");
  }
  return join(process.cwd(), "src", "main", "agents", "hal-ai");
}

function loadHalAi(): BuiltinAgentDef {
  const dir = getHalDir();
  const configPath = join(dir, "config.json");
  const cfg: AgentConfigJson = JSON.parse(readFileSync(configPath, "utf-8"));
  const promptPath = join(dir, "prompt.md");
  const prompt = existsSync(promptPath) ? readFileSync(promptPath, "utf-8").trim() : undefined;

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
    mcpTools,
  } = cfg;

  return {
    id: "hal-ai",
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
      mcpTools,
      additionalPrompt: prompt,
    },
  };
}

export const HAL_AI: BuiltinAgentDef = loadHalAi();
export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL_AI];
