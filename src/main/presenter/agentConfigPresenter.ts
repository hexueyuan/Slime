import { randomUUID } from "crypto";
import { dialog } from "electron";
import { join, extname } from "path";
import fs, { mkdir, copyFile, unlink, readFile } from "fs/promises";
import { getDb } from "@/db";
import * as agentDao from "@/db/models/agentDao";
import * as mcpDao from "@/db/models/mcpDao";
import { eventBus } from "@/eventbus";
import { AGENT_EVENTS } from "@shared/events";
import { paths } from "@/utils";
import { logger } from "@/utils/logger";
import { getAgentDir, getPromptPath, getSoulPath, getSkillsDir } from "@/utils/agentPaths";
import type { ConfigPresenter } from "./configPresenter";
import type { Agent } from "@shared/types/agent";
import type { SkillInfo } from "@shared/types/skills";
import type { IAgentConfigPresenter } from "@shared/types/presenters/agentConfig.presenter";
import type { SkillPresenter } from "./skillPresenter";

export class AgentConfigPresenter implements IAgentConfigPresenter {
  private skillPresenter?: SkillPresenter;
  private configPresenter?: ConfigPresenter;

  setSkillPresenter(sp: SkillPresenter): void {
    this.skillPresenter = sp;
  }

  setConfigPresenter(cp: ConfigPresenter): void {
    this.configPresenter = cp;
  }

  async listLocalSkills(agentId: string): Promise<SkillInfo[]> {
    if (!this.skillPresenter) return [];
    const skillsDir = await this.getAgentSkillsDir(agentId);
    if (!skillsDir) return [];
    return this.skillPresenter.listLocalSkillsForAgent(agentId, skillsDir);
  }

  async init(): Promise<void> {
    agentDao.ensureBuiltin(getDb());
    await this.syncBuiltinAvatars();
  }

  private async syncBuiltinAvatars(): Promise<void> {
    const agentsResourceDir = join(paths.projectRoot, "resources", "agents");
    await mkdir(paths.avatarsDir, { recursive: true });
    const avatarMap: Record<string, { src: string; agentId: string }> = {
      "hal.png": { src: join(agentsResourceDir, "hal.png"), agentId: "hal-ai" },
      "moss.png": { src: join(agentsResourceDir, "moss.png"), agentId: "moss-ai" },
    };
    const db = getDb();
    for (const [dest, { src, agentId }] of Object.entries(avatarMap)) {
      try {
        await copyFile(src, join(paths.avatarsDir, dest));
        // Ensure DB has avatar reference if missing
        const agent = agentDao.getAgentById(db, agentId);
        if (agent && !agent.avatar) {
          agentDao.updateAgent(db, agentId, {
            avatar: { kind: "image", path: `avatars/${dest}` },
          });
        }
      } catch (e) {
        logger.warn("syncBuiltinAvatars: failed to copy", { src, error: e });
      }
    }
  }

  async listAgents(): Promise<Agent[]> {
    return agentDao.listAgents(getDb());
  }

  async getAgent(id: string): Promise<Agent | null> {
    return agentDao.getAgentById(getDb(), id) ?? null;
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const id = data.id || randomUUID();
    const agent = agentDao.createAgent(getDb(), {
      id,
      name: data.name || "New Agent",
      type: data.type || "custom",
      enabled: data.enabled ?? true,
      protected: data.protected ?? false,
      description: data.description,
      avatar: data.avatar,
      mbti: data.mbti ?? "INTJ",
      config: data.config,
    });
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    // 创建文件目录和 prompt.md（best-effort，失败不阻断）
    const agentDir = await this.getAgentDirForAgent(agent);
    if (agentDir) {
      try {
        await fs.mkdir(agentDir, { recursive: true });
        await fs.mkdir(getSkillsDir(agentDir), { recursive: true });
        await fs.writeFile(
          getPromptPath(agentDir),
          `你是${agent.name}，一个人工智能，你的任务是帮助用户解决问题。`,
        );
      } catch (e) {
        logger.warn("createAgent: failed to initialize agent directory", { error: e });
      }
    }
    return agent;
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const oldAgent = agentDao.getAgentById(getDb(), id);
    if (data.avatar) {
      if (oldAgent?.avatar?.kind === "image") {
        this.cleanupAvatarFile(oldAgent.avatar.path).catch(() => {});
      }
    }
    // Cleanup: if mcpTools changed, remove session_mcp_state for removed tools
    if (data.config?.mcpTools !== undefined) {
      const oldTools = oldAgent?.config?.mcpTools ?? [];
      const newTools = data.config.mcpTools ?? [];
      const removed = oldTools.filter((t) => !newTools.includes(t));
      if (removed.length > 0) {
        const removedToolIds: number[] = [];
        for (const entry of removed) {
          const slashIdx = entry.indexOf("/");
          if (slashIdx === -1) continue;
          const serverId = entry.slice(0, slashIdx);
          const toolName = entry.slice(slashIdx + 1);
          const tool = mcpDao.getToolByServerAndName(getDb(), serverId, toolName);
          if (tool) removedToolIds.push(tool.id);
        }
        mcpDao.removeSessionStateByAgentToolIds(getDb(), id, removedToolIds);
      }
    }
    agentDao.updateAgent(getDb(), id, data);
    const updated = agentDao.getAgentById(getDb(), id);
    if (!updated) throw new Error(`Agent ${id} not found`);
    // name 变更且使用 Obsidian 目录时重命名
    if (oldAgent && data.name && data.name !== oldAgent.name) {
      const vaultPath = await this.getVaultPath();
      if (vaultPath) {
        const oldDir = getAgentDir(oldAgent, vaultPath, paths.agentsDir);
        const newDir = getAgentDir(updated, vaultPath, paths.agentsDir);
        if (oldDir && newDir && oldDir !== newDir) {
          await fs.rename(oldDir, newDir).catch((e) => {
            logger.warn("updateAgent: failed to rename agent directory", { error: e });
          });
        }
      }
    }
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return updated;
  }

  async deleteAgent(id: string): Promise<void> {
    const agent = agentDao.getAgentById(getDb(), id);
    if (agent?.avatar?.kind === "image") {
      this.cleanupAvatarFile(agent.avatar.path).catch(() => {});
    }
    agentDao.removeAgent(getDb(), id);
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
  }

  async pickAvatar(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "选择头像图片",
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const src = result.filePaths[0];
    const ext = extname(src) || ".png";
    const filename = `${randomUUID()}${ext}`;
    const destDir = paths.avatarsDir;
    const dest = join(destDir, filename);

    await mkdir(destDir, { recursive: true });
    await copyFile(src, dest);

    return `avatars/${filename}`;
  }

  async getAvatarUrl(relativePath: string): Promise<string> {
    const abs = join(paths.slimeDir, relativePath);
    const data = await readFile(abs);
    const ext = extname(abs).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const mime = mimeMap[ext] || "image/png";
    return `data:${mime};base64,${data.toString("base64")}`;
  }

  async readPromptMd(agentId: string): Promise<string> {
    const agent = agentDao.getAgentById(getDb(), agentId);
    if (!agent) return "";
    const agentDir = await this.getAgentDirForAgent(agent);
    if (!agentDir) return "";
    try {
      return await fs.readFile(getPromptPath(agentDir), "utf-8");
    } catch {
      // fallback: try old SOUL.md
      try {
        return await fs.readFile(getSoulPath(agentDir), "utf-8");
      } catch {
        return "";
      }
    }
  }

  async getAgentSkillsDir(agentId: string): Promise<string | null> {
    const agent = agentDao.getAgentById(getDb(), agentId);
    if (!agent) return null;
    const agentDir = await this.getAgentDirForAgent(agent);
    if (!agentDir) return null;
    return getSkillsDir(agentDir);
  }

  async getAgentDir(agentId: string): Promise<string | null> {
    const agent = agentDao.getAgentById(getDb(), agentId);
    if (!agent) return null;
    return this.getAgentDirForAgent(agent);
  }

  private async getVaultPath(): Promise<string | null> {
    const val = await this.configPresenter?.get("obsidian.vaultPath");
    return typeof val === "string" && val.length > 0 ? val : null;
  }

  private async getAgentDirForAgent(agent: Agent): Promise<string | null> {
    const vaultPath = await this.getVaultPath();
    return getAgentDir(agent, vaultPath, paths.agentsDir);
  }

  private async cleanupAvatarFile(relativePath: string): Promise<void> {
    try {
      const abs = join(paths.slimeDir, relativePath);
      await unlink(abs);
    } catch {
      // file may not exist, ignore
    }
  }
}
