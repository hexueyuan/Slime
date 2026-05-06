# Task Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Slime 增加任务管理核心模块，moss agent 通过 slime-cli 操作 Tasks.md，仪表盘在会话打开时自动加载并在 CLI 写入后实时更新。

**Architecture:** 纯逻辑层 `taskManager.ts` 负责解析/序列化 Tasks.md；独立 Fastify HTTP 服务 `taskServer.ts` 暴露 REST API；`TaskPresenter` 桥接 IPC + 写入后事件推送；`slime-cli task` 子命令通过 HTTP 调用服务。渲染进程在会话激活时主动拉取仪表盘数据，CLI 写入后由主进程推送实时更新。

**Tech Stack:** TypeScript, Fastify, Node.js fs/promises, Vue 3, Pinia, Vitest

---

## 文件结构

| 操作    | 路径                                       | 职责                                             |
| ------- | ------------------------------------------ | ------------------------------------------------ |
| Create  | `src/main/tasks/taskManager.ts`            | 解析/序列化 Tasks.md、CRUD、自动归档             |
| Create  | `src/main/tasks/taskServer.ts`             | Fastify HTTP 服务，路由调 taskManager            |
| Create  | `src/main/presenter/taskPresenter.ts`      | IPC 桥接，getDashboardData，onTasksChanged 回调  |
| Create  | `src/cli/commands/task.ts`                 | CLI task 子命令，HTTP 调 taskServer              |
| Modify  | `src/main/presenter/index.ts`              | 注册 TaskPresenter，init 时启动 taskServer       |
| Modify  | `src/main/agents/moss.ts`                  | 简化 agentSoul，删除任务格式描述，更新仪表盘模板 |
| Modify  | `src/cli/index.ts`                         | 注册 taskCommand                                 |
| Modify  | `src/renderer/src/views/ChatroomPanel.vue` | watch activeSessionId 时主动拉取仪表盘数据       |
| Modify  | `src/renderer/src/stores/agentChat.ts`     | 确认 setDashboardData 已存在（只读，不改）       |
| Replace | `resources/skills/moss-tasks/SKILL.md`     | 改为 CLI 调用说明                                |
| Create  | `test/main/tasks/taskManager.test.ts`      | taskManager 单元测试                             |

---

## Task 1: taskManager — 数据模型与文件解析

**Files:**

- Create: `src/main/tasks/taskManager.ts`
- Create: `test/main/tasks/taskManager.test.ts`

- [ ] **Step 1: 写失败的测试（解析空文件 / 不存在文件）**

```typescript
// test/main/tasks/taskManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskManager } from "../../../src/main/tasks/taskManager";

let tmpDir: string;
let tasksFile: string;
let tm: TaskManager;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `slime-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  tasksFile = join(tmpDir, "Tasks.md");
  tm = new TaskManager(tasksFile);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("TaskManager.list", () => {
  it("auto-creates Tasks.md when missing", async () => {
    const tasks = await tm.list();
    expect(tasks).toEqual([]);
  });

  it("returns empty list for blank file", async () => {
    await writeFile(tasksFile, "# 任务列表\n");
    const tasks = await tm.list();
    expect(tasks).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm test test/main/tasks/taskManager.test.ts
```

期望：FAIL — `Cannot find module '../../../src/main/tasks/taskManager'`

- [ ] **Step 3: 实现 TaskManager 骨架 + list()**

```typescript
// src/main/tasks/taskManager.ts
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

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function makeId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseMeta(comment: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of comment.matchAll(/(\w+):([^\s]+)/g)) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function statusFromLine(checkbox: string, emoji: string): TaskStatus {
  if (checkbox === "[ ]" && emoji === "🔄") return "in_progress";
  if (checkbox === "[x]" && emoji === "✅") return "done";
  if (checkbox === "[x]" && emoji === "❌") return "cancelled";
  return "todo";
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

function serializeTask(task: Task): string {
  const cb = checkboxForStatus(task.status);
  const emoji = emojiForStatus(
    task.status === "archived"
      ? ((task.completedAt ? "done" : "cancelled") as TaskStatus)
      : task.status,
  );
  const meta: string[] = [`id:${task.id}`, `created:${task.createdAt}`];
  if (task.startedAt) meta.push(`started:${task.startedAt}`);
  if (task.completedAt) meta.push(`completed:${task.completedAt}`);
  if (task.cancelledAt) meta.push(`cancelledAt:${task.cancelledAt}`);
  if (task.archivedAt) meta.push(`archived:${task.archivedAt}`);
  return `- ${cb} ${task.description}${emoji} <!-- ${meta.join(" ")} -->`;
}

function parseTaskLine(line: string): Task | null {
  const m = line.match(/^- (\[.\]) (.+?) *(🔄|✅|❌)? *<!-- (.+?) -->$/);
  if (!m) return null;
  const [, cb, desc, emoji = "", comment] = m;
  const meta = parseMeta(comment);
  if (!meta["id"] || !meta["created"]) return null;
  const status = statusFromLine(cb.slice(1, -1), emoji);
  return {
    id: meta["id"],
    description: desc.trim(),
    status,
    createdAt: meta["created"],
    startedAt: meta["started"],
    completedAt: meta["completed"],
    cancelledAt: meta["cancelledAt"],
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
    const all =
      status === "archived" ? archived : status ? main.filter((t) => t.status === status) : main;
    return all;
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/main/tasks/taskManager.test.ts
```

期望：PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/tasks/taskManager.ts test/main/tasks/taskManager.test.ts
git commit -m "feat(tasks): add TaskManager with list() and file init"
```

---

## Task 2: taskManager — CRUD 操作

**Files:**

- Modify: `src/main/tasks/taskManager.ts`
- Modify: `test/main/tasks/taskManager.test.ts`

- [ ] **Step 1: 写失败的测试（add / get / start / done / cancel）**

在 `test/main/tasks/taskManager.test.ts` 末尾追加：

```typescript
describe("TaskManager CRUD", () => {
  it("add creates a todo task", async () => {
    const task = await tm.add("写代码");
    expect(task.description).toBe("写代码");
    expect(task.status).toBe("todo");
    expect(task.id).toMatch(/^\d{14}$/);
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("get returns task by id", async () => {
    const added = await tm.add("测试任务");
    const got = await tm.get(added.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(added.id);
  });

  it("get returns null for unknown id", async () => {
    const got = await tm.get("00000000000000");
    expect(got).toBeNull();
  });

  it("start transitions todo to in_progress", async () => {
    const t = await tm.add("任务");
    const updated = await tm.start(t.id);
    expect(updated.status).toBe("in_progress");
    expect(updated.startedAt).toBeDefined();
  });

  it("done transitions in_progress to done", async () => {
    const t = await tm.add("任务");
    await tm.start(t.id);
    const updated = await tm.done(t.id);
    expect(updated.status).toBe("done");
    expect(updated.completedAt).toBeDefined();
  });

  it("cancel transitions any state to cancelled", async () => {
    const t = await tm.add("任务");
    const updated = await tm.cancel(t.id);
    expect(updated.status).toBe("cancelled");
    expect(updated.cancelledAt).toBeDefined();
  });

  it("throws on invalid transition", async () => {
    const t = await tm.add("任务");
    await tm.done(t.id); // skip start — should throw or allow? cancel from done
    await expect(tm.start(t.id)).rejects.toThrow("cannot transition");
  });

  it("persists tasks across instances", async () => {
    await tm.add("持久化任务");
    const tm2 = new TaskManager(tasksFile);
    const tasks = await tm2.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("持久化任务");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/main/tasks/taskManager.test.ts
```

期望：FAIL — `tm.add is not a function`

- [ ] **Step 3: 实现 add / get / start / done / cancel**

在 `TaskManager` 类中追加以下方法（在 `list()` 之后）：

```typescript
  async add(description: string): Promise<Task> {
    const { main, archived } = await this.readAll()
    const task: Task = {
      id: makeId(),
      description,
      status: 'todo',
      createdAt: nowLocal(),
    }
    main.push(task)
    await this.writeAll(main, archived)
    return task
  }

  async get(id: string): Promise<Task | null> {
    const { main, archived } = await this.readAll()
    return [...main, ...archived].find((t) => t.id === id) ?? null
  }

  async start(id: string): Promise<Task> {
    const { main, archived } = await this.readAll()
    const task = main.find((t) => t.id === id)
    if (!task) throw new Error(`task ${id} not found`)
    if (task.status !== 'todo') throw new Error(`task ${id} cannot transition from ${task.status} to in_progress`)
    task.status = 'in_progress'
    task.startedAt = nowLocal()
    await this.writeAll(main, archived)
    return task
  }

  async done(id: string): Promise<Task> {
    const { main, archived } = await this.readAll()
    const task = main.find((t) => t.id === id)
    if (!task) throw new Error(`task ${id} not found`)
    if (task.status === 'done') throw new Error(`task ${id} cannot transition from done to done`)
    task.status = 'done'
    task.completedAt = nowLocal()
    await this.writeAll(main, archived)
    return task
  }

  async cancel(id: string): Promise<Task> {
    const { main, archived } = await this.readAll()
    const task = main.find((t) => t.id === id)
    if (!task) throw new Error(`task ${id} not found`)
    if (task.status === 'cancelled') throw new Error(`task ${id} cannot transition from cancelled to cancelled`)
    task.status = 'cancelled'
    task.cancelledAt = nowLocal()
    await this.writeAll(main, archived)
    return task
  }
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/main/tasks/taskManager.test.ts
```

期望：PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/tasks/taskManager.ts test/main/tasks/taskManager.test.ts
git commit -m "feat(tasks): add CRUD operations to TaskManager"
```

---

## Task 3: taskManager — 自动归档

**Files:**

- Modify: `src/main/tasks/taskManager.ts`
- Modify: `test/main/tasks/taskManager.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到测试文件：

```typescript
describe("TaskManager.autoArchive", () => {
  it("archives done tasks older than 7 days", async () => {
    // 手动写一个 8 天前完成的任务
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const oldDate = `${eightDaysAgo.getFullYear()}-${pad(eightDaysAgo.getMonth() + 1)}-${pad(eightDaysAgo.getDate())}T${pad(eightDaysAgo.getHours())}:${pad(eightDaysAgo.getMinutes())}:${pad(eightDaysAgo.getSeconds())}`;
    const content = `# 任务列表\n\n- [x] 旧任务 ✅ <!-- id:20250101120000 created:2025-01-01T12:00:00 completed:${oldDate} -->\n`;
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const main = await tm.list();
    const archived = await tm.list("archived");
    expect(main).toHaveLength(0);
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("20250101120000");
    expect(archived[0].archivedAt).toBeDefined();
  });

  it("does not archive done tasks within 7 days", async () => {
    const t = await tm.add("新任务");
    await tm.start(t.id);
    await tm.done(t.id);
    await tm.autoArchive();
    const main = await tm.list();
    expect(main).toHaveLength(1);
  });

  it("archives cancelled tasks older than 7 days", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const oldDate = `${eightDaysAgo.getFullYear()}-${pad(eightDaysAgo.getMonth() + 1)}-${pad(eightDaysAgo.getDate())}T${pad(eightDaysAgo.getHours())}:${pad(eightDaysAgo.getMinutes())}:${pad(eightDaysAgo.getSeconds())}`;
    const content = `# 任务列表\n\n- [x] 旧取消任务 ❌ <!-- id:20250102120000 created:2025-01-02T12:00:00 cancelledAt:${oldDate} -->\n`;
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const archived = await tm.list("archived");
    expect(archived[0].id).toBe("20250102120000");
  });

  it("sorts archived section by completedAt/cancelledAt ascending", async () => {
    const makeOldLine = (id: string, dateStr: string, emoji: string, field: string) =>
      `- [x] 任务${id} ${emoji} <!-- id:${id} created:2025-01-01T00:00:00 ${field}:${dateStr} -->`;
    const content = [
      "# 任务列表",
      "",
      makeOldLine("20250101000001", "2025-01-10T00:00:00", "✅", "completed"),
      makeOldLine("20250101000002", "2025-01-09T00:00:00", "✅", "completed"),
      "",
    ].join("\n");
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const archived = await tm.list("archived");
    expect(archived[0].id).toBe("20250101000002");
    expect(archived[1].id).toBe("20250101000001");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/main/tasks/taskManager.test.ts
```

期望：FAIL — `tm.autoArchive is not a function`

- [ ] **Step 3: 实现 autoArchive() + getDashboardData()**

在 `TaskManager` 类末尾追加：

```typescript
  async autoArchive(): Promise<void> {
    const { main, archived } = await this.readAll()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const toArchive: Task[] = []
    const remaining: Task[] = []

    for (const task of main) {
      const terminalDate = task.completedAt ?? task.cancelledAt
      if ((task.status === 'done' || task.status === 'cancelled') && terminalDate) {
        const age = now - new Date(terminalDate).getTime()
        if (age > sevenDaysMs) {
          toArchive.push({ ...task, status: 'archived', archivedAt: nowLocal() })
          continue
        }
      }
      remaining.push(task)
    }

    if (toArchive.length === 0) return

    const allArchived = [...archived, ...toArchive].sort((a, b) => {
      const da = a.completedAt ?? a.cancelledAt ?? ''
      const db = b.completedAt ?? b.cancelledAt ?? ''
      return da.localeCompare(db)
    })

    await this.writeAll(remaining, allArchived)
  }

  async getDashboardData(): Promise<Record<string, unknown>> {
    const { main } = await this.readAll()
    const fmt = (tasks: Task[]) =>
      tasks.length === 0
        ? '<span class="empty">暂无</span>'
        : tasks.map((t) => `<div class="task-item">${t.description}</div>`).join('')

    const todo = main.filter((t) => t.status === 'todo')
    const inProgress = main.filter((t) => t.status === 'in_progress')
    const done = main.filter((t) => t.status === 'done')

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const lastUpdated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

    return {
      todo: fmt(todo),
      in_progress: fmt(inProgress),
      done: fmt(done),
      last_updated: lastUpdated,
    }
  }
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/main/tasks/taskManager.test.ts
```

期望：PASS（所有测试）

- [ ] **Step 5: 提交**

```bash
git add src/main/tasks/taskManager.ts test/main/tasks/taskManager.test.ts
git commit -m "feat(tasks): add autoArchive and getDashboardData to TaskManager"
```

---

## Task 4: taskServer — 内部 HTTP 服务

**Files:**

- Create: `src/main/tasks/taskServer.ts`

- [ ] **Step 1: 实现 taskServer**

```typescript
// src/main/tasks/taskServer.ts
import Fastify, { FastifyInstance } from "fastify";
import { TaskManager, TaskStatus } from "./taskManager";

export function createTaskServer(
  taskManager: TaskManager,
  onTasksChanged: () => void,
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.post<{ Body: { description: string } }>("/tasks", async (req, reply) => {
    const { description } = req.body;
    if (!description || typeof description !== "string") {
      return reply.status(400).send({ error: "description is required" });
    }
    const task = await taskManager.add(description);
    await taskManager.autoArchive();
    onTasksChanged();
    return reply.status(201).send(task);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id/start", async (req, reply) => {
    try {
      const task = await taskManager.start(req.params.id);
      await taskManager.autoArchive();
      onTasksChanged();
      return reply.send(task);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id/done", async (req, reply) => {
    try {
      const task = await taskManager.done(req.params.id);
      await taskManager.autoArchive();
      onTasksChanged();
      return reply.send(task);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id/cancel", async (req, reply) => {
    try {
      const task = await taskManager.cancel(req.params.id);
      await taskManager.autoArchive();
      onTasksChanged();
      return reply.send(task);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: msg });
    }
  });

  app.get<{ Querystring: { status?: string } }>("/tasks", async (req, reply) => {
    const status = req.query.status as TaskStatus | undefined;
    const validStatuses: TaskStatus[] = ["todo", "in_progress", "done", "cancelled", "archived"];
    if (status && !validStatuses.includes(status)) {
      return reply.status(400).send({ error: `invalid status: ${status}` });
    }
    const tasks = await taskManager.list(status);
    return reply.send(tasks);
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const task = await taskManager.get(req.params.id);
    if (!task) return reply.status(404).send({ error: `task ${req.params.id} not found` });
    return reply.send(task);
  });

  return app;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/tasks/taskServer.ts
git commit -m "feat(tasks): add Fastify taskServer with REST routes"
```

---

## Task 5: TaskPresenter — IPC 桥接 + 仪表盘同步

**Files:**

- Create: `src/main/presenter/taskPresenter.ts`
- Modify: `src/main/presenter/index.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1: 在 events.ts 新增 TASK_EVENTS**

读取 `src/shared/events.ts`，在末尾追加：

```typescript
export const TASK_EVENTS = {
  DASHBOARD_UPDATE: "agent:dashboard:update", // 复用现有事件，保持兼容
} as const;
```

（注意：仪表盘更新复用 `AGENT_EVENTS.DASHBOARD_UPDATE`，无需新增事件）

实际上不需要改 events.ts，直接在 TaskPresenter 中 import `AGENT_EVENTS` 即可。

- [ ] **Step 2: 实现 TaskPresenter**

```typescript
// src/main/presenter/taskPresenter.ts
import { ipcMain } from "electron";
import { app } from "electron";
import { FastifyInstance } from "fastify";
import { TaskManager } from "../tasks/taskManager";
import { createTaskServer } from "../tasks/taskServer";
import { eventBus } from "../eventbus";
import { AGENT_EVENTS } from "../../shared/events";
import { configPresenter } from "./index";

const TASK_SERVER_PORT_PROD = 40001;
const TASK_SERVER_PORT_DEV = 40002;

// dashboardProviders 注册表：agentId → 数据提供函数
const dashboardProviders: Record<string, () => Promise<Record<string, unknown>>> = {};

class TaskPresenter {
  private taskManager: TaskManager | null = null;
  private server: FastifyInstance | null = null;
  private port: number = TASK_SERVER_PORT_DEV;
  // 当前活跃的 moss-ai 会话 ID（由 AgentChatPresenterAdapter 写入）
  private activeMossSessionId: string | null = null;

  async init(): Promise<void> {
    const vaultPath = (await configPresenter.get("obsidian.vaultPath")) as string | undefined;
    if (!vaultPath) return;

    const isDev = !app.isPackaged;
    const tasksFileName = isDev ? "Tasks-dev.md" : "Tasks.md";
    const tasksFilePath = `${vaultPath}/${tasksFileName}`;
    this.port = isDev ? TASK_SERVER_PORT_DEV : TASK_SERVER_PORT_PROD;

    this.taskManager = new TaskManager(tasksFilePath);

    // 注册 moss-ai dashboard provider
    dashboardProviders["moss-ai"] = () => this.taskManager!.getDashboardData();

    // app 启动时执行一次归档
    await this.taskManager.autoArchive();

    // 启动 HTTP 服务
    this.server = createTaskServer(this.taskManager, () => this.onTasksChanged());
    await this.server.listen({ port: this.port, host: "127.0.0.1" });

    // 注册 IPC
    ipcMain.handle("task:getDashboardData", async (_e, agentId: string) => {
      const provider = dashboardProviders[agentId];
      if (!provider) return {};
      return provider();
    });

    ipcMain.handle("task:getServerPort", () => this.port);
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
```

- [ ] **Step 3: 在 presenter/index.ts 注册 TaskPresenter**

读取 `src/main/presenter/index.ts`，找到 `init()` 方法，在 `gatewayPresenter.init()` 调用之后追加：

```typescript
await taskPresenter.init();
```

同时在文件顶部 import：

```typescript
import { taskPresenter } from "./taskPresenter";
```

在 `Presenter` 类的 `destroy()` 方法（或 app `will-quit` 处理）中追加：

```typescript
await taskPresenter.destroy();
```

- [ ] **Step 4: 提交**

```bash
git add src/main/presenter/taskPresenter.ts src/main/presenter/index.ts
git commit -m "feat(tasks): add TaskPresenter with IPC and HTTP lifecycle"
```

---

## Task 6: SLIME_TASK_PORT 注入到 exec 环境

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`（找到 exec 工具注入 env 的地方）

- [ ] **Step 1: 找到 exec env 注入位置**

在 `src/main/presenter/agentChat/agentChatPresenter.ts` 中搜索 `SLIME_ROLE` 或 `setSessionContext`，找到 exec 工具执行时注入 env 的代码位置。

- [ ] **Step 2: 注入 SLIME_TASK_PORT**

在 `ToolPresenter.setSessionContext()` 调用处或 exec env 构造处，加入端口注入：

```typescript
import { taskPresenter } from "../taskPresenter";

// 在 setSessionContext 或 exec env 注入时追加：
const taskPort = taskPresenter.getPort();
// 将 SLIME_TASK_PORT 加入 exec 环境变量
```

在 `TaskPresenter` 中新增 `getPort()` 方法：

```typescript
getPort(): number {
  return this.port
}
```

在 `ToolPresenter` 中找到构造 exec env 的地方，追加 `SLIME_TASK_PORT: String(taskPresenter.getPort())`。

- [ ] **Step 3: 提交**

```bash
git add src/main/presenter/taskPresenter.ts src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(tasks): inject SLIME_TASK_PORT into exec environment"
```

---

## Task 7: CLI task 命令

**Files:**

- Create: `src/cli/commands/task.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 实现 task 命令**

```typescript
// src/cli/commands/task.ts
import { CommandDef } from "../registry";
import { Task } from "../../main/tasks/taskManager";

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
  archived: "已归档",
};

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

function formatTask(t: Task): string {
  const parts = [
    `[${t.id}] ${t.description} [${STATUS_LABEL[t.status] ?? t.status}]`,
    `created:${t.createdAt}`,
  ];
  if (t.startedAt) parts.push(`started:${t.startedAt}`);
  if (t.completedAt) parts.push(`completed:${t.completedAt}`);
  if (t.cancelledAt) parts.push(`cancelledAt:${t.cancelledAt}`);
  if (t.archivedAt) parts.push(`archived:${t.archivedAt}`);
  return parts.join(" ");
}

async function run(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    console.log(`task <subcommand> [args]
  add <描述>                   新增待办任务
  start <id>                   待办 → 进行中
  done <id>                    进行中 → 已完成
  cancel <id>                  任意状态 → 已取消
  list [--status <状态>]       列表查询（默认返回非归档任务）
  get <id>                     查询单个任务详情

状态值: todo | in_progress | done | cancelled | archived`);
    return;
  }

  try {
    if (sub === "add") {
      const description = rest.join(" ").trim();
      if (!description) throw new Error("description is required");
      const task = (await httpRequest("POST", "/tasks", { description })) as Task;
      console.log(formatTask(task));
    } else if (sub === "start") {
      const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/start`)) as Task;
      console.log(formatTask(task));
    } else if (sub === "done") {
      const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/done`)) as Task;
      console.log(formatTask(task));
    } else if (sub === "cancel") {
      const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`)) as Task;
      console.log(formatTask(task));
    } else if (sub === "list") {
      const statusIdx = rest.indexOf("--status");
      const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
      const qs = status ? `?status=${status}` : "";
      const tasks = (await httpRequest("GET", `/tasks${qs}`)) as Task[];
      if (tasks.length === 0) {
        console.log("(no tasks)");
      } else {
        tasks.forEach((t) => console.log(formatTask(t)));
      }
    } else if (sub === "get") {
      const task = (await httpRequest("GET", `/tasks/${rest[0]}`)) as Task;
      console.log(formatTask(task));
    } else {
      throw new Error(`unknown subcommand: ${sub}`);
    }
  } catch (e: unknown) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

export const taskCommand: CommandDef = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消/已归档）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent"],
  allowedAgents: ["moss-ai"],
  run,
};
```

- [ ] **Step 2: 注册到 src/cli/index.ts**

读取 `src/cli/index.ts`，找到 `const allCommands = [logsCommand]`，改为：

```typescript
import { taskCommand } from "./commands/task";

const allCommands = [logsCommand, taskCommand];
```

- [ ] **Step 3: 提交**

```bash
git add src/cli/commands/task.ts src/cli/index.ts
git commit -m "feat(tasks): add slime-cli task subcommand"
```

---

## Task 8: 渲染进程 — 会话激活时主动拉取仪表盘

**Files:**

- Modify: `src/renderer/src/views/ChatroomPanel.vue`

- [ ] **Step 1: 在 ChatroomPanel.vue 中 watch activeSessionId，主动拉取**

读取 `src/renderer/src/views/ChatroomPanel.vue`，找到现有 `watch(activeSessionId, ...)` 或 `watch(activeSession, ...)` 逻辑，在其中追加 dashboard 拉取：

在 `<script setup>` 区块中，找到合适位置追加：

```typescript
// 会话激活时主动拉取仪表盘数据
watch(
  () => sessionStore.activeSessionId,
  async (sessionId) => {
    if (!sessionId || !dashboardTemplate.value) return;
    const agentId = activeAgent.value?.id;
    if (!agentId) return;
    const data = await window.electron.ipcRenderer.invoke("task:getDashboardData", agentId);
    chatStore.setDashboardData(sessionId, data as Record<string, unknown>);
  },
  { immediate: true },
);
```

- [ ] **Step 2: 运行开发环境确认无 TypeScript 错误**

```bash
pnpm run typecheck
```

期望：无错误

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/views/ChatroomPanel.vue
git commit -m "feat(tasks): auto-fetch dashboard data on session activate"
```

---

## Task 9: activeMossSessionId 同步

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`（或 AgentChatPresenterAdapter）
- Modify: `src/main/presenter/taskPresenter.ts`

- [ ] **Step 1: 在 AgentChat 会话开始/结束时通知 TaskPresenter**

读取 `src/main/presenter/agentChat/agentChatPresenter.ts`，找到 `chat()` 方法入口和结束处。

在 `chat()` 开始时，若 agentId === 'moss-ai'，调用 `taskPresenter.setActiveMossSession(sessionId)`。

```typescript
import { taskPresenter } from "../taskPresenter";

// chat() 方法开始处：
if (agentId === "moss-ai") {
  taskPresenter.setActiveMossSession(sessionId);
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(tasks): sync activeMossSessionId to TaskPresenter"
```

---

## Task 10: 更新 moss agentSoul + moss-tasks skill

**Files:**

- Modify: `src/main/agents/moss.ts`
- Replace: `resources/skills/moss-tasks/SKILL.md`

- [ ] **Step 1: 更新 moss.ts agentSoul**

读取 `src/main/agents/moss.ts`，找到 `buildAgentSoul` 函数，删除所有关于 Tasks.md 格式、dashboard_update 调用说明的内容。保留 Obsidian vault 路径说明和日记功能说明。

- [ ] **Step 2: 更新仪表盘模板占位符**

在 `MOSS_DASHBOARD_TEMPLATE` 中确认占位符为 `{{todo}}`、`{{in_progress}}`、`{{done}}`、`{{last_updated}}`，与 `taskManager.getDashboardData()` 返回的 key 一致。若不一致，以 taskManager 返回的 key 为准更新模板。

- [ ] **Step 3: 替换 moss-tasks skill**

```markdown
## <!-- resources/skills/moss-tasks/SKILL.md -->

name: moss-tasks
description: 管理待办任务，通过 slime-cli task 命令操作
agentIds:

- moss-ai

---

# 任务管理

任务通过 `slime-cli task` 命令管理，所有操作都经由 CLI 完成，仪表盘由系统自动更新。

## 命令

- 新增任务：`exec slime-cli task add <任务描述>`
- 开始任务：`exec slime-cli task start <id>`
- 完成任务：`exec slime-cli task done <id>`
- 取消任务：`exec slime-cli task cancel <id>`
- 查询列表：`exec slime-cli task list [--status todo|in_progress|done|cancelled|archived]`
- 查询详情：`exec slime-cli task get <id>`

`list` 不传 `--status` 时返回所有非归档任务。

## 状态流转

todo → in_progress（start）→ done（done）
任意状态 → cancelled（cancel）

## 说明

- 仪表盘由系统自动更新，无需任何额外操作
- 任务完成或取消超过 7 天后自动归档
```

- [ ] **Step 4: 运行 lint + typecheck**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 5: 提交**

```bash
git add src/main/agents/moss.ts resources/skills/moss-tasks/SKILL.md
git commit -m "feat(tasks): simplify moss agentSoul and update moss-tasks skill to CLI"
```

---

## Task 11: 格式化 + 最终验证

**Files:** 全部已修改文件

- [ ] **Step 1: 格式化**

```bash
pnpm run format
```

- [ ] **Step 2: Lint**

```bash
pnpm run lint
```

- [ ] **Step 3: 类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 4: 运行全部测试**

```bash
pnpm test
```

期望：所有测试 PASS

- [ ] **Step 5: 提交格式化变更（如有）**

```bash
git add -A
git commit -m "style: format after task management implementation"
```

---

## 自检：Spec 覆盖情况

| Spec 要求                                            | 对应 Task |
| ---------------------------------------------------- | --------- |
| Tasks.md 格式（扁平列表 + 注释元数据）               | Task 1    |
| 5 种状态（todo/in_progress/done/cancelled/archived） | Task 1, 2 |
| 任务 ID（本地时间戳 YYYYMMDDHHmmss）                 | Task 1    |
| 本地时间 ISO 8601                                    | Task 1    |
| CRUD 操作                                            | Task 2    |
| 自动归档（7天，按完成时间升序）                      | Task 3    |
| 文件不存在时自动创建                                 | Task 1    |
| 内部 HTTP 服务（Fastify，REST 路由）                 | Task 4    |
| dev/prod 端口隔离（40001/40002）                     | Task 5    |
| SLIME_TASK_PORT 注入                                 | Task 6    |
| slime-cli task 子命令                                | Task 7    |
| allowedRoles: builtin-agent, allowedAgents: moss-ai  | Task 7    |
| 会话打开主动拉取仪表盘                               | Task 8    |
| CLI 写入后实时推送仪表盘                             | Task 5    |
| dashboardProviders 注册表                            | Task 5    |
| activeMossSessionId 同步                             | Task 9    |
| moss-tasks skill 改为 CLI 说明                       | Task 10   |
| moss agentSoul 删除任务格式描述                      | Task 10   |
| dev 用 Tasks-dev.md                                  | Task 5    |
