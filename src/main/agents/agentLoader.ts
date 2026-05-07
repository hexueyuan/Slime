import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Agent, AgentConfig, AgentAvatar } from "@shared/types/agent";
import type { AgentType } from "@shared/types/agent";
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

/**
 * 从指定目录加载 agents。每个子目录为一个 agent，包含 AGENT.json + PROMPT.md + avatar.*
 */
export function loadAgentsFromDir(baseDir: string, type: AgentType): Agent[] {
  if (!existsSync(baseDir)) return [];

  const agents: Agent[] = [];
  let entries: string[];
  try {
    entries = readdirSync(baseDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const dir = join(baseDir, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }

    const jsonPath = join(dir, "AGENT.json");
    if (!existsSync(jsonPath)) continue;

    let cfg: AgentJson;
    try {
      const raw = readFileSync(jsonPath, "utf-8");
      const obj = JSON.parse(raw);
      if (!obj.name || !obj.mbti) {
        logger.warn("[agentLoader] invalid AGENT.json", { dir });
        continue;
      }
      cfg = obj as AgentJson;
    } catch {
      logger.warn("[agentLoader] failed to read AGENT.json", { dir });
      continue;
    }

    const promptPath = join(dir, "PROMPT.md");
    const additionalPrompt = existsSync(promptPath)
      ? readFileSync(promptPath, "utf-8").trim()
      : undefined;

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
      type,
      enabled: true,
      protected: type === "builtin",
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
