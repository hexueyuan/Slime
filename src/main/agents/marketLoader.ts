import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Agent, AgentConfig, AgentAvatar } from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";
import { logger } from "@/utils/logger";

interface AgentJson {
  name: string;
  description?: string;
  mbti: MBTIType;
  capabilityRequirements?: string[];
  enabledTools?: string[];
  enabledSkills?: string[];
  allowedCliCommands?: string[];
  enableThinking?: boolean;
  subagentEnabled?: boolean;
  mcpTools?: string[];
}

const AVATAR_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function findAvatar(dir: string): AgentAvatar | undefined {
  for (const ext of AVATAR_EXTENSIONS) {
    const p = join(dir, `avatar${ext}`);
    if (existsSync(p)) return { kind: "image", path: p };
  }
  return undefined;
}

function parseAgentJson(raw: string): AgentJson | null {
  try {
    const obj = JSON.parse(raw);
    if (!obj.name || !obj.mbti) return null;
    return obj as AgentJson;
  } catch {
    return null;
  }
}

export function loadMarketAgents(marketAgentsDir: string): Agent[] {
  if (!existsSync(marketAgentsDir)) return [];

  const agents: Agent[] = [];
  let entries: string[];
  try {
    entries = readdirSync(marketAgentsDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const dir = join(marketAgentsDir, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }

    const jsonPath = join(dir, "AGENT.json");
    if (!existsSync(jsonPath)) continue;

    let raw: string;
    try {
      raw = readFileSync(jsonPath, "utf-8");
    } catch {
      logger.warn("[marketLoader] failed to read AGENT.json", { dir });
      continue;
    }

    const cfg = parseAgentJson(raw);
    if (!cfg) {
      logger.warn("[marketLoader] invalid AGENT.json", { dir });
      continue;
    }

    // Read PROMPT.md
    const promptPath = join(dir, "PROMPT.md");
    const additionalPrompt = existsSync(promptPath)
      ? readFileSync(promptPath, "utf-8").trim()
      : undefined;

    // allowedCliCommands: auto-inject "help" if non-empty
    const cliCmds = cfg.allowedCliCommands ?? [];
    const finalCliCmds =
      cliCmds.length > 0 && !cliCmds.includes("help") ? ["help", ...cliCmds] : cliCmds;

    const config: AgentConfig = {
      capabilityRequirements: cfg.capabilityRequirements,
      enabledTools: cfg.enabledTools,
      enabledSkills: cfg.enabledSkills,
      allowedCliCommands: finalCliCmds,
      enableThinking: cfg.enableThinking,
      subagentEnabled: cfg.subagentEnabled,
      mcpTools: cfg.mcpTools,
      additionalPrompt,
    };

    const avatar = findAvatar(dir);
    const now = Date.now();

    agents.push({
      id: entry,
      name: cfg.name,
      type: "custom",
      enabled: true,
      protected: false,
      description: cfg.description,
      avatar,
      mbti: cfg.mbti,
      config,
      createdAt: now,
      updatedAt: now,
    });
  }

  return agents;
}
