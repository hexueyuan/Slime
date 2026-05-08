import { existsSync } from "fs";
import { writeFile, mkdir, copyFile, unlink, rm } from "fs/promises";
import { join, extname } from "path";
import type { Agent, AgentAvatar, AgentConfig, GenderType } from "@shared/types/agent";
import type { MBTIType } from "@shared/constants/mbti";
import { MBTI_TEMPERATURE } from "@shared/constants/mbti";
import { paths } from "@/utils";
import { logger } from "@/utils/logger";
import { loadBuiltinAgents } from "./index";
import { loadAgentsFromDir } from "./agentLoader";

class AgentRegistry {
  private agents = new Map<string, Agent>();

  load(): void {
    this.agents.clear();

    // 1. Builtin agents (re-read from disk)
    const builtins = loadBuiltinAgents();
    for (const agent of builtins) {
      this.agents.set(agent.id, agent);
    }

    // 2. Market agents
    const marketAgents = loadAgentsFromDir(paths.marketAgentsDir, "custom");
    for (const agent of marketAgents) {
      if (this.agents.has(agent.id)) {
        logger.warn("[AgentRegistry] duplicate id, skipping market agent", { id: agent.id });
        continue;
      }
      this.agents.set(agent.id, agent);
    }
  }

  list(): Agent[] {
    const arr = Array.from(this.agents.values());
    return arr.sort((a, b) => {
      if (a.protected !== b.protected) return a.protected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  getById(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  async create(
    id: string,
    data: {
      name: string;
      description?: string;
      mbti: MBTIType;
      gender?: GenderType;
      birthday?: string;
      config?: AgentConfig;
      avatarSourcePath?: string;
    },
  ): Promise<Agent> {
    if (this.agents.has(id)) throw new Error(`Agent id already exists: ${id}`);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || id.length > 50) throw new Error("Invalid agent id");

    const dir = join(paths.marketAgentsDir, id);
    await mkdir(dir, { recursive: true });

    // Write AGENT.json
    const agentJson: Record<string, unknown> = {
      name: data.name,
      description: data.description ?? "",
      mbti: data.mbti,
      capabilityRequirements: data.config?.capabilityRequirements ?? [],
      enabledTools: data.config?.enabledTools ?? [],
      enabledSkills: data.config?.enabledSkills ?? [],
      allowedCliCommands: data.config?.allowedCliCommands ?? [],
      enableThinking: data.config?.enableThinking ?? false,
      subagentEnabled: data.config?.subagentEnabled ?? false,
      mcpTools: data.config?.mcpTools ?? [],
    };
    if (data.gender) agentJson.gender = data.gender;
    if (data.birthday) agentJson.birthday = data.birthday;
    await writeFile(join(dir, "AGENT.json"), JSON.stringify(agentJson, null, 2), "utf-8");

    // Write PROMPT.md
    const prompt = data.config?.additionalPrompt ?? "";
    await writeFile(join(dir, "PROMPT.md"), prompt, "utf-8");

    // Copy avatar
    let avatar: AgentAvatar | undefined;
    if (data.avatarSourcePath) {
      const ext = extname(data.avatarSourcePath);
      const dest = join(dir, `avatar${ext}`);
      await copyFile(data.avatarSourcePath, dest);
      avatar = { kind: "image", path: dest };
    }

    const now = Date.now();
    const agent: Agent = {
      id,
      name: data.name,
      type: "custom",
      enabled: true,
      protected: false,
      description: data.description,
      avatar,
      mbti: data.mbti,
      gender: data.gender,
      birthday: data.birthday,
      config: data.config,
      createdAt: now,
      updatedAt: now,
    };
    this.agents.set(id, agent);
    return agent;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      mbti: MBTIType;
      gender: GenderType;
      birthday: string;
      config: AgentConfig;
      avatarSourcePath: string | null;
    }>,
  ): Promise<Agent> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    if (agent.protected) throw new Error("Cannot modify protected agent");

    const dir = join(paths.marketAgentsDir, id);

    // Update in-memory
    if (data.name !== undefined) agent.name = data.name;
    if (data.description !== undefined) agent.description = data.description;
    if (data.mbti !== undefined) agent.mbti = data.mbti;
    if (data.gender !== undefined) agent.gender = data.gender;
    if (data.birthday !== undefined) agent.birthday = data.birthday;
    if (data.config !== undefined) agent.config = data.config;
    agent.updatedAt = Date.now();

    // Rewrite AGENT.json
    const agentJson: Record<string, unknown> = {
      name: agent.name,
      description: agent.description ?? "",
      mbti: agent.mbti,
      capabilityRequirements: agent.config?.capabilityRequirements ?? [],
      enabledTools: agent.config?.enabledTools ?? [],
      enabledSkills: agent.config?.enabledSkills ?? [],
      allowedCliCommands: agent.config?.allowedCliCommands ?? [],
      enableThinking: agent.config?.enableThinking ?? false,
      subagentEnabled: agent.config?.subagentEnabled ?? false,
      mcpTools: agent.config?.mcpTools ?? [],
    };
    if (agent.gender) agentJson.gender = agent.gender;
    if (agent.birthday) agentJson.birthday = agent.birthday;
    await writeFile(join(dir, "AGENT.json"), JSON.stringify(agentJson, null, 2), "utf-8");

    // Rewrite PROMPT.md
    await writeFile(join(dir, "PROMPT.md"), agent.config?.additionalPrompt ?? "", "utf-8");

    // Handle avatar
    if (data.avatarSourcePath !== undefined) {
      for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
        const old = join(dir, `avatar${ext}`);
        if (existsSync(old)) await unlink(old).catch(() => {});
      }
      if (data.avatarSourcePath) {
        const ext = extname(data.avatarSourcePath);
        const dest = join(dir, `avatar${ext}`);
        await copyFile(data.avatarSourcePath, dest);
        agent.avatar = { kind: "image", path: dest };
      } else {
        agent.avatar = undefined;
      }
    }

    return agent;
  }

  async delete(id: string): Promise<void> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    if (agent.protected) throw new Error("Cannot delete protected agent");

    const dir = join(paths.marketAgentsDir, id);
    await rm(dir, { recursive: true, force: true });
    this.agents.delete(id);
  }

  getTemperature(agent: Agent): number {
    return MBTI_TEMPERATURE[agent.mbti] ?? 0.5;
  }
}

export const agentRegistry = new AgentRegistry();
