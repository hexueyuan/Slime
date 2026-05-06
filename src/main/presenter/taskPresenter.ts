import { ipcMain, app } from "electron";
import type { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import * as taskDao from "../tasks/taskDao";
import { copyAttachment } from "../tasks/attachmentService";
import { createTaskServer } from "../tasks/taskServer";
import { eventBus } from "../eventbus";
import { TASK_EVENTS } from "../../shared/events";
import type { TaskStatus } from "@shared/types/schedule";

const TASK_SERVER_PORT_PROD = 40001;
const TASK_SERVER_PORT_DEV = 40002;

class TaskPresenter {
  private db: BetterSqlite3.Database | null = null;
  private server: FastifyInstance | null = null;
  private port: number = TASK_SERVER_PORT_DEV;
  private vaultPath: string | null = null;

  async init(db: BetterSqlite3.Database, vaultPath: string): Promise<void> {
    await this.destroy();
    this.db = db;
    this.vaultPath = vaultPath;

    const isDev = !app.isPackaged;
    this.port = isDev ? TASK_SERVER_PORT_DEV : TASK_SERVER_PORT_PROD;

    this.server = createTaskServer(db, () => this.emitTasksChanged());
    await this.server.listen({ port: this.port, host: "127.0.0.1" });

    this.registerIpc();
  }

  getPort(): number {
    return this.port;
  }

  private registerIpc(): void {
    ipcMain.handle("task:getServerPort", () => this.port);
    ipcMain.handle("task:getTasks", (_e, status?: TaskStatus) => {
      return taskDao.listTasks(this.db!, status);
    });
    ipcMain.handle("task:createTask", (_e, title: string, detail?: string) => {
      const task = taskDao.createTask(this.db!, { title, detail });
      this.emitTasksChanged();
      return task;
    });
    ipcMain.handle(
      "task:updateTask",
      (_e, id: string, fields: { title?: string; detail?: string }) => {
        const task = taskDao.updateTask(this.db!, id, fields);
        this.emitTasksChanged();
        return task;
      },
    );
    ipcMain.handle("task:updateTaskStatus", (_e, id: string, status: TaskStatus) => {
      const task = taskDao.updateTaskStatus(this.db!, id, status);
      if (status === "in_progress") {
        taskDao.addTaskAutoTimeline(this.db!, id, `开始: ${task.title}`);
        this.emitTimelineChanged();
      } else if (status === "done" || status === "cancelled") {
        taskDao.finishTaskAutoTimeline(this.db!, id);
        this.emitTimelineChanged();
      }
      this.emitTasksChanged();
      return task;
    });
    ipcMain.handle("task:deleteTask", (_e, id: string) => {
      taskDao.deleteTask(this.db!, id);
      this.emitTasksChanged();
    });
    ipcMain.handle("task:getAttachments", (_e, taskId: string) => {
      return taskDao.getAttachments(this.db!, taskId);
    });
    ipcMain.handle("task:addAttachment", (_e, taskId: string, srcPath: string) => {
      if (!this.vaultPath) throw new Error("vault path not configured");
      const { fileName, filePath, fileType } = copyAttachment(srcPath, this.vaultPath);
      return taskDao.addAttachment(this.db!, taskId, fileName, filePath, fileType);
    });
    ipcMain.handle("task:removeAttachment", (_e, attachmentId: number) => {
      taskDao.removeAttachment(this.db!, attachmentId);
    });
    ipcMain.handle("task:getTimeline", (_e, date: string) => {
      return taskDao.getTimeline(this.db!, date);
    });
    ipcMain.handle(
      "task:addTimelineEntry",
      (_e, entry: { date: string; startTime: string; endTime?: string; content: string }) => {
        const result = taskDao.addTimelineEntry(this.db!, { ...entry, source: "manual" });
        this.emitTimelineChanged();
        return result;
      },
    );
    ipcMain.handle(
      "task:updateTimelineEntry",
      (_e, id: number, fields: { endTime?: string; content?: string }) => {
        taskDao.updateTimelineEntry(this.db!, id, fields);
        this.emitTimelineChanged();
      },
    );
    ipcMain.handle("task:removeTimelineEntry", (_e, id: number) => {
      taskDao.removeTimelineEntry(this.db!, id);
      this.emitTimelineChanged();
    });
    ipcMain.handle("task:getNotes", (_e, limit?: number) => {
      return taskDao.getNotes(this.db!, limit ?? 50);
    });
    ipcMain.handle("task:addNote", (_e, content: string) => {
      const note = taskDao.addNote(this.db!, content);
      this.emitTimelineChanged();
      return note;
    });
    ipcMain.handle("task:deleteNote", (_e, id: number) => {
      taskDao.deleteNote(this.db!, id);
      this.emitTimelineChanged();
    });
  }

  private emitTasksChanged(): void {
    eventBus.sendToRenderer(TASK_EVENTS.TASKS_CHANGED, {});
  }

  private emitTimelineChanged(): void {
    eventBus.sendToRenderer(TASK_EVENTS.TIMELINE_CHANGED, {});
  }

  async destroy(): Promise<void> {
    await this.server?.close();
    this.server = null;
    const handlers = [
      "task:getServerPort",
      "task:getTasks",
      "task:createTask",
      "task:updateTask",
      "task:updateTaskStatus",
      "task:deleteTask",
      "task:getAttachments",
      "task:addAttachment",
      "task:removeAttachment",
      "task:getTimeline",
      "task:addTimelineEntry",
      "task:updateTimelineEntry",
      "task:removeTimelineEntry",
      "task:getNotes",
      "task:addNote",
      "task:deleteNote",
    ];
    for (const h of handlers) {
      ipcMain.removeHandler(h);
    }
  }
}

export const taskPresenter = new TaskPresenter();
