import { ipcMain, app } from "electron";
import type { FastifyInstance } from "fastify";
import { TaskManager } from "../tasks/taskManager";
import { createTaskServer } from "../tasks/taskServer";
import { eventBus } from "../eventbus";
import { AGENT_EVENTS } from "../../shared/events";

const TASK_SERVER_PORT_PROD = 40001;
const TASK_SERVER_PORT_DEV = 40002;

type DashboardProvider = () => Promise<Record<string, unknown>>;

class TaskPresenter {
  private taskManager: TaskManager | null = null;
  private server: FastifyInstance | null = null;
  private port: number = TASK_SERVER_PORT_DEV;
  private activeMossSessionId: string | null = null;
  private dashboardProviders: Record<string, DashboardProvider> = {};

  async init(vaultPath: string): Promise<void> {
    if (this.taskManager) {
      await this.destroy();
    }

    const isDev = !app.isPackaged;
    const tasksFileName = isDev ? "Tasks-dev.md" : "Tasks.md";
    const tasksFilePath = `${vaultPath}/${tasksFileName}`;
    this.port = isDev ? TASK_SERVER_PORT_DEV : TASK_SERVER_PORT_PROD;

    this.taskManager = new TaskManager(tasksFilePath);
    this.dashboardProviders["moss-ai"] = () => this.taskManager!.getDashboardData();

    try {
      await this.taskManager.autoArchive();
    } catch (e) {
      console.error("[TaskPresenter] autoArchive failed:", e);
    }

    this.server = createTaskServer(this.taskManager, () => this.onTasksChanged());
    await this.server.listen({ port: this.port, host: "127.0.0.1" });

    ipcMain.handle("task:getDashboardData", async (_e, agentId: string) => {
      const provider = this.dashboardProviders[agentId];
      if (!provider) return {};
      return provider();
    });

    ipcMain.handle("task:getServerPort", () => this.port);
  }

  getPort(): number {
    return this.port;
  }

  setActiveMossSession(sessionId: string | null): void {
    this.activeMossSessionId = sessionId;
  }

  private async onTasksChanged(): Promise<void> {
    if (!this.activeMossSessionId || !this.taskManager) return;
    const data = await this.taskManager.getDashboardData();
    eventBus.sendToRenderer(AGENT_EVENTS.DASHBOARD_UPDATE, {
      sessionId: this.activeMossSessionId,
      data,
    });
  }

  async destroy(): Promise<void> {
    await this.server?.close();
    ipcMain.removeHandler("task:getDashboardData");
    ipcMain.removeHandler("task:getServerPort");
  }
}

export const taskPresenter = new TaskPresenter();
