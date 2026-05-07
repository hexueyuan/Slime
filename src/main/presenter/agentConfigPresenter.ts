import { randomUUID } from "crypto";
import { dialog } from "electron";
import { join, extname } from "path";
import { copyFile, readFile, unlink } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { eventBus } from "@/eventbus";
import { AGENT_EVENTS } from "@shared/events";
import { paths } from "@/utils";
import { agentRegistry } from "@/agents/agentRegistry";
import type { Agent } from "@shared/types/agent";
import type { SkillInfo } from "@shared/types/skills";
import type { IAgentConfigPresenter } from "@shared/types/presenters/agentConfig.presenter";

export class AgentConfigPresenter implements IAgentConfigPresenter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setSkillPresenter(_sp?: any): void {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setConfigPresenter(_cp?: any): void {
    // no-op, vault path no longer needed
  }

  async init(): Promise<void> {
    agentRegistry.load();
  }

  async listAgents(): Promise<Agent[]> {
    return agentRegistry.list();
  }

  async getAgent(id: string): Promise<Agent | null> {
    return agentRegistry.getById(id) ?? null;
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const id = data.id || randomUUID();
    const agent = await agentRegistry.create(id, {
      name: data.name || "New Agent",
      description: data.description,
      mbti: data.mbti ?? "INTJ",
      config: data.config ?? undefined,
      avatarSourcePath: undefined,
    });
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return agent;
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const agent = await agentRegistry.update(id, {
      name: data.name,
      description: data.description,
      mbti: data.mbti,
      config: data.config ?? undefined,
    });
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return agent;
  }

  async deleteAgent(id: string): Promise<void> {
    await agentRegistry.delete(id);
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
  }

  async pickAvatar(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "选择头像图片",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  async getAvatarUrl(avatarPath: string): Promise<string | null> {
    try {
      const data = await readFile(avatarPath);
      const ext = extname(avatarPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      const mime = mimeMap[ext] || "image/png";
      return `data:${mime};base64,${data.toString("base64")}`;
    } catch {
      return null;
    }
  }

  async readPromptMd(agentId: string): Promise<string> {
    const agent = agentRegistry.getById(agentId);
    if (!agent) return "";
    if (agent.protected) {
      return agent.config?.additionalPrompt ?? "";
    }
    const promptPath = join(paths.marketAgentsDir, agentId, "PROMPT.md");
    try {
      return readFileSync(promptPath, "utf-8");
    } catch {
      return "";
    }
  }

  async getAgentSkillsDir(_agentId: string): Promise<string | null> {
    return null;
  }

  async getAgentDir(agentId: string): Promise<string | null> {
    const agent = agentRegistry.getById(agentId);
    if (!agent || agent.protected) return null;
    const dir = join(paths.marketAgentsDir, agentId);
    return existsSync(dir) ? dir : null;
  }

  async listLocalSkills(_agentId: string): Promise<SkillInfo[]> {
    return [];
  }

  // Helper: move a picked avatar file into the agent's directory.
  // Called by UI after pickAvatar() returns the source path.
  async applyAvatar(agentId: string, srcPath: string): Promise<void> {
    const dir = join(paths.marketAgentsDir, agentId);
    if (!existsSync(dir)) return;
    for (const e of [".png", ".jpg", ".jpeg", ".webp"]) {
      const old = join(dir, `avatar${e}`);
      if (existsSync(old)) await unlink(old).catch(() => {});
    }
    const ext = extname(srcPath) || ".png";
    await copyFile(srcPath, join(dir, `avatar${ext}`));
    agentRegistry.load();
  }
}
