import { randomUUID } from "crypto";
import { dialog } from "electron";
import { join, extname } from "path";
import { mkdir, copyFile, unlink, readFile } from "fs/promises";
import { getDb } from "@/db";
import * as agentDao from "@/db/models/agentDao";
import { eventBus } from "@/eventbus";
import { AGENT_EVENTS } from "@shared/events";
import { paths } from "@/utils";
import type { Agent } from "@shared/types/agent";
import type { IAgentConfigPresenter } from "@shared/types/presenters/agentConfig.presenter";

export class AgentConfigPresenter implements IAgentConfigPresenter {
  init(): void {
    agentDao.ensureBuiltin(getDb());
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
      config: data.config,
    });
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
    return agent;
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    if (data.avatar) {
      const old = agentDao.getAgentById(getDb(), id);
      if (old?.avatar?.kind === "image") {
        this.cleanupAvatarFile(old.avatar.path).catch(() => {});
      }
    }
    agentDao.updateAgent(getDb(), id, data);
    const updated = agentDao.getAgentById(getDb(), id);
    if (!updated) throw new Error(`Agent ${id} not found`);
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

  private async cleanupAvatarFile(relativePath: string): Promise<void> {
    try {
      const abs = join(paths.slimeDir, relativePath);
      await unlink(abs);
    } catch {
      // file may not exist, ignore
    }
  }
}
