import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled" | "archived";

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  archivedAt?: string;
}

const INITIAL_CONTENT = "# 任务列表\n";
const ARCHIVE_HEADER = "\n## 已归档\n";

export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function makeId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

function parseMeta(comment: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of comment.matchAll(/(\w+):([^\s]+)/g)) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function statusFromLine(checkbox: string, emoji: string): TaskStatus | null {
  if (checkbox === " " && emoji === "") return "todo";
  if (checkbox === " " && emoji === "🔄") return "in_progress";
  if (checkbox === "x" && emoji === "✅") return "done";
  if (checkbox === "x" && emoji === "❌") return "cancelled";
  return null;
}

function emojiForStatus(status: TaskStatus): string {
  if (status === "in_progress") return " 🔄";
  if (status === "done") return " ✅";
  if (status === "cancelled") return " ❌";
  return "";
}

function checkboxForStatus(status: TaskStatus): string {
  return status === "done" || status === "cancelled" || status === "archived" ? "[x]" : "[ ]";
}

export function serializeTask(task: Task): string {
  const cb = checkboxForStatus(task.status);
  const displayStatus =
    task.status === "archived"
      ? ((task.completedAt ? "done" : "cancelled") as TaskStatus)
      : task.status;
  const emoji = emojiForStatus(displayStatus);
  const meta: string[] = [`id:${task.id}`, `created:${task.createdAt}`];
  if (task.startedAt) meta.push(`started:${task.startedAt}`);
  if (task.completedAt) meta.push(`completed:${task.completedAt}`);
  if (task.cancelledAt) meta.push(`cancelled:${task.cancelledAt}`);
  if (task.archivedAt) meta.push(`archived:${task.archivedAt}`);
  return `- ${cb} ${task.description}${emoji} <!-- ${meta.join(" ")} -->`;
}

export function parseTaskLine(line: string): Task | null {
  const m = line.match(/^- (\[.\]) (.+?) *(🔄|✅|❌)? *<!-- (.+?) -->$/);
  if (!m) return null;
  const [, cb, desc, emoji = "", comment] = m;
  const meta = parseMeta(comment);
  if (!meta["id"] || !meta["created"]) return null;
  const status = statusFromLine(cb.slice(1, -1), emoji);
  if (status === null) return null;
  return {
    id: meta["id"],
    description: desc.trim(),
    status,
    createdAt: meta["created"],
    startedAt: meta["started"],
    completedAt: meta["completed"],
    cancelledAt: meta["cancelled"],
    archivedAt: meta["archived"],
  };
}

export class TaskManager {
  constructor(private filePath: string) {}

  private async ensureFile(): Promise<void> {
    if (!existsSync(this.filePath)) {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, INITIAL_CONTENT, "utf-8");
    }
  }

  private async readAll(): Promise<{ main: Task[]; archived: Task[] }> {
    await this.ensureFile();
    const content = await readFile(this.filePath, "utf-8");
    const archiveIdx = content.indexOf("\n## 已归档");
    const mainSection = archiveIdx >= 0 ? content.slice(0, archiveIdx) : content;
    const archiveSection = archiveIdx >= 0 ? content.slice(archiveIdx) : "";

    const main: Task[] = [];
    for (const line of mainSection.split("\n")) {
      const t = parseTaskLine(line);
      if (t) main.push(t);
    }
    const archived: Task[] = [];
    for (const line of archiveSection.split("\n")) {
      const t = parseTaskLine(line);
      if (t) archived.push({ ...t, status: "archived" });
    }
    return { main, archived };
  }

  private async writeAll(main: Task[], archived: Task[]): Promise<void> {
    const mainLines = ["# 任务列表", "", ...main.map(serializeTask)].join("\n");
    const archiveLines =
      archived.length > 0 ? ARCHIVE_HEADER + archived.map(serializeTask).join("\n") + "\n" : "";
    await writeFile(this.filePath, mainLines + "\n" + archiveLines, "utf-8");
  }

  async list(status?: TaskStatus): Promise<Task[]> {
    const { main, archived } = await this.readAll();
    if (status === "archived") return archived;
    if (status) return main.filter((t) => t.status === status);
    return main;
  }

  async add(description: string): Promise<Task> {
    const { main, archived } = await this.readAll();
    const task: Task = {
      id: makeId(),
      description,
      status: "todo",
      createdAt: nowLocal(),
    };
    main.push(task);
    await this.writeAll(main, archived);
    return task;
  }

  async get(id: string): Promise<Task | null> {
    const { main, archived } = await this.readAll();
    return [...main, ...archived].find((t) => t.id === id) ?? null;
  }

  async start(id: string): Promise<Task> {
    const { main, archived } = await this.readAll();
    const task = main.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    if (task.status !== "todo")
      throw new Error(`task ${id} cannot transition from ${task.status} to in_progress`);
    task.status = "in_progress";
    task.startedAt = nowLocal();
    await this.writeAll(main, archived);
    return task;
  }

  async done(id: string): Promise<Task> {
    const { main, archived } = await this.readAll();
    const task = main.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    if (task.status === "done" || task.status === "cancelled")
      throw new Error(`task ${id} cannot transition from ${task.status} to done`);
    task.status = "done";
    task.completedAt = nowLocal();
    await this.writeAll(main, archived);
    return task;
  }

  async cancel(id: string): Promise<Task> {
    const { main, archived } = await this.readAll();
    const task = main.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    if (task.status === "done" || task.status === "cancelled")
      throw new Error(`task ${id} cannot transition from ${task.status} to cancelled`);
    task.status = "cancelled";
    task.cancelledAt = nowLocal();
    await this.writeAll(main, archived);
    return task;
  }
}
