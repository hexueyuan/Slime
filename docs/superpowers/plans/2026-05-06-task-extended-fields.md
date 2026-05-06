# Task Extended Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add creator, assignee, scheduled time, and repeat interval fields to the task system, supporting normal/scheduled/recurring task types.

**Architecture:** ALTER TABLE migration adds 6 columns to `tasks`. DAO/Presenter/Server gain extended params. CLI adds mandatory `--creator-type`/`--creator-id` flags with validation. UI shows assignee badge and schedule indicators in TaskBoard, and adds assignee selector + schedule configurator in TaskDetailDialog.

**Tech Stack:** TypeScript, better-sqlite3, Fastify, Vue 3, Pinia, TailwindCSS

---

## File Structure

| File                                                        | Action           | Responsibility                                                                                    |
| ----------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `src/shared/types/schedule.d.ts`                            | Modify           | Add `ActorType`, `RepeatPreset`, extend `Task` interface                                          |
| `src/main/db/database.ts`                                   | Modify           | Add migration for new columns + indexes                                                           |
| `src/main/tasks/taskDao.ts`                                 | Modify           | Extend `createTask`, `updateTask`, `rowToTask`, `TaskRow`                                         |
| `src/main/presenter/taskPresenter.ts`                       | Modify           | Update IPC handlers for new params                                                                |
| `src/main/tasks/taskServer.ts`                              | Modify           | Extend HTTP endpoints for new fields                                                              |
| `src/cli/commands/task.ts`                                  | Modify           | Add `--creator-type/id`, `--assignee-type/id`, `--scheduled-at`, `--repeat` flags with validation |
| `src/renderer/src/stores/schedule.ts`                       | Modify           | Update `createTask`/`updateTask` signatures                                                       |
| `src/renderer/src/components/schedule/TaskBoard.vue`        | Modify           | Add assignee/schedule indicators                                                                  |
| `src/renderer/src/components/schedule/TaskDetailDialog.vue` | Modify           | Add assignee selector, schedule config, creator display                                           |
| `src/renderer/src/components/schedule/ScheduleConfig.vue`   | Create           | Extracted schedule configuration component                                                        |
| `src/renderer/src/utils/scheduleUtils.ts`                   | Create           | `getNextExecutions()` helper + `REPEAT_PRESETS` map                                               |
| `test/main/tasks/taskDao.test.ts`                           | Create           | Unit tests for extended DAO                                                                       |
| `test/main/tasks/taskServer.test.ts`                        | Modify or Create | HTTP endpoint tests                                                                               |

---

### Task 1: Type Definitions

**Files:**

- Modify: `src/shared/types/schedule.d.ts`

- [x] **Step 1: Update type definitions**

```typescript
// Add at the top of schedule.d.ts, before TaskStatus
export type ActorType = "user" | "agent";

export type RepeatPreset = "none" | "hourly" | "daily" | "weekly" | "monthly" | "custom";
```

Update the `Task` interface to:

```typescript
export interface Task {
  id: string;
  title: string;
  detail?: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  creatorType: ActorType;
  creatorId?: string;
  assigneeType: ActorType;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}
```

- [x] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: May show errors in taskDao.ts and other files that reference Task — this is expected, we'll fix them in subsequent tasks.

- [x] **Step 3: Commit**

```bash
git add src/shared/types/schedule.d.ts
git commit -m "feat(schedule): extend Task type with creator/assignee/schedule fields"
```

---

### Task 2: Database Migration

**Files:**

- Modify: `src/main/db/database.ts`

- [x] **Step 1: Add migration logic in `migrate()` function**

After the existing schedule tables migration block (line ~323), add:

```typescript
// Add extended fields to tasks table (creator/assignee/schedule)
const taskCols = instance.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
if (!taskCols.some((c) => c.name === "creator_type")) {
  instance.exec(`
      ALTER TABLE tasks ADD COLUMN creator_type TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE tasks ADD COLUMN creator_id TEXT;
      ALTER TABLE tasks ADD COLUMN assignee_type TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
      ALTER TABLE tasks ADD COLUMN scheduled_at INTEGER;
      ALTER TABLE tasks ADD COLUMN repeat_interval INTEGER;
      CREATE INDEX idx_tasks_assignee ON tasks(assignee_type, assignee_id);
      CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;
    `);
}
```

- [x] **Step 2: Also update the DDL `CREATE TABLE tasks` in the main DDL string**

Update the tasks table DDL (line ~232) to include the new columns so fresh installs get them:

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  creator_type TEXT NOT NULL DEFAULT 'user',
  creator_id TEXT,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  assignee_id TEXT,
  scheduled_at INTEGER,
  repeat_interval INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_type, assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

- [x] **Step 3: Commit**

```bash
git add src/main/db/database.ts
git commit -m "feat(schedule): add DB migration for task extended fields"
```

---

### Task 3: DAO Layer Extension

**Files:**

- Modify: `src/main/tasks/taskDao.ts`
- Create: `test/main/tasks/taskDao.test.ts`

- [x] **Step 1: Write failing tests**

Create `test/main/tasks/taskDao.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db/database";
import * as taskDao from "@/tasks/taskDao";
import type BetterSqlite3 from "better-sqlite3";

describe("taskDao extended fields", () => {
  let db: BetterSqlite3.Database;

  beforeEach(() => {
    db = initDb(":memory:");
  });

  afterEach(() => {
    closeDb();
  });

  it("createTask with creator and assignee", () => {
    const task = taskDao.createTask(db, {
      title: "test task",
      creatorType: "agent",
      creatorId: "hal-ai",
      assigneeType: "user",
      assigneeId: "user-1",
    });
    expect(task.creatorType).toBe("agent");
    expect(task.creatorId).toBe("hal-ai");
    expect(task.assigneeType).toBe("user");
    expect(task.assigneeId).toBe("user-1");
  });

  it("createTask with schedule", () => {
    const scheduled = Date.now() + 3600_000;
    const task = taskDao.createTask(db, {
      title: "scheduled task",
      scheduledAt: scheduled,
      repeatInterval: 1440,
    });
    expect(task.scheduledAt).toBe(scheduled);
    expect(task.repeatInterval).toBe(1440);
  });

  it("createTask defaults creator/assignee to user", () => {
    const task = taskDao.createTask(db, { title: "default task" });
    expect(task.creatorType).toBe("user");
    expect(task.assigneeType).toBe("user");
    expect(task.scheduledAt).toBeUndefined();
    expect(task.repeatInterval).toBeUndefined();
  });

  it("updateTask can change assignee and schedule", () => {
    const task = taskDao.createTask(db, { title: "updatable" });
    const updated = taskDao.updateTask(db, task.id, {
      assigneeType: "agent",
      assigneeId: "moss-ai",
      scheduledAt: 1700000000000,
      repeatInterval: 60,
    });
    expect(updated.assigneeType).toBe("agent");
    expect(updated.assigneeId).toBe("moss-ai");
    expect(updated.scheduledAt).toBe(1700000000000);
    expect(updated.repeatInterval).toBe(60);
  });

  it("updateTask cannot change creator fields", () => {
    const task = taskDao.createTask(db, {
      title: "immutable creator",
      creatorType: "agent",
      creatorId: "hal-ai",
    });
    // creatorType/creatorId not in updateTask fields type
    const updated = taskDao.updateTask(db, task.id, { title: "renamed" });
    expect(updated.creatorType).toBe("agent");
    expect(updated.creatorId).toBe("hal-ai");
  });

  it("listTasks returns extended fields", () => {
    taskDao.createTask(db, {
      title: "listed",
      creatorType: "agent",
      creatorId: "moss-ai",
      scheduledAt: 1700000000000,
    });
    const tasks = taskDao.listTasks(db);
    expect(tasks[0].creatorType).toBe("agent");
    expect(tasks[0].creatorId).toBe("moss-ai");
    expect(tasks[0].scheduledAt).toBe(1700000000000);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/tasks/taskDao.test.ts`
Expected: FAIL — `createTask` signature doesn't accept object param yet.

- [x] **Step 3: Update TaskRow and rowToTask**

In `src/main/tasks/taskDao.ts`, update `TaskRow`:

```typescript
interface TaskRow {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  creator_type: string;
  creator_id: string | null;
  assignee_type: string;
  assignee_id: string | null;
  scheduled_at: number | null;
  repeat_interval: number | null;
}
```

Update `rowToTask`:

```typescript
function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail ?? undefined,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    creatorType: row.creator_type as ActorType,
    creatorId: row.creator_id ?? undefined,
    assigneeType: row.assignee_type as ActorType,
    assigneeId: row.assignee_id ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    repeatInterval: row.repeat_interval ?? undefined,
  };
}
```

Add the `ActorType` import at the top:

```typescript
import type {
  Task,
  TaskStatus,
  TaskAttachment,
  TimelineEntry,
  TimelineSource,
  Note,
  ActorType,
} from "@shared/types/schedule";
```

- [x] **Step 4: Refactor createTask to accept params object**

Replace the existing `createTask` function:

```typescript
export interface CreateTaskParams {
  title: string;
  detail?: string;
  creatorType?: ActorType;
  creatorId?: string;
  assigneeType?: ActorType;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}

export function createTask(db: BetterSqlite3.Database, params: CreateTaskParams): Task {
  const id = makeId();
  const now = Date.now();
  const creatorType = params.creatorType ?? "user";
  const assigneeType = params.assigneeType ?? "user";
  db.prepare(
    `INSERT INTO tasks (id, title, detail, status, created_at, creator_type, creator_id, assignee_type, assignee_id, scheduled_at, repeat_interval)
     VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.title,
    params.detail ?? null,
    now,
    creatorType,
    params.creatorId ?? null,
    assigneeType,
    params.assigneeId ?? null,
    params.scheduledAt ?? null,
    params.repeatInterval ?? null,
  );
  return {
    id,
    title: params.title,
    detail: params.detail,
    status: "todo",
    createdAt: now,
    creatorType,
    creatorId: params.creatorId,
    assigneeType,
    assigneeId: params.assigneeId,
    scheduledAt: params.scheduledAt,
    repeatInterval: params.repeatInterval,
  };
}
```

- [x] **Step 5: Extend updateTask to accept new fields**

```typescript
export function updateTask(
  db: BetterSqlite3.Database,
  id: string,
  fields: {
    title?: string;
    detail?: string;
    assigneeType?: ActorType;
    assigneeId?: string;
    scheduledAt?: number | null;
    repeatInterval?: number | null;
  },
): Task {
  const task = getTask(db, id);
  if (!task) throw new Error(`task ${id} not found`);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.title !== undefined) {
    sets.push("title = ?");
    values.push(fields.title);
  }
  if (fields.detail !== undefined) {
    sets.push("detail = ?");
    values.push(fields.detail);
  }
  if (fields.assigneeType !== undefined) {
    sets.push("assignee_type = ?");
    values.push(fields.assigneeType);
  }
  if (fields.assigneeId !== undefined) {
    sets.push("assignee_id = ?");
    values.push(fields.assigneeId);
  }
  if (fields.scheduledAt !== undefined) {
    sets.push("scheduled_at = ?");
    values.push(fields.scheduledAt);
  }
  if (fields.repeatInterval !== undefined) {
    sets.push("repeat_interval = ?");
    values.push(fields.repeatInterval);
  }
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }
  return getTask(db, id)!;
}
```

- [x] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- test/main/tasks/taskDao.test.ts`
Expected: All PASS.

- [x] **Step 7: Commit**

```bash
git add src/main/tasks/taskDao.ts test/main/tasks/taskDao.test.ts
git commit -m "feat(schedule): extend taskDao with creator/assignee/schedule fields"
```

---

### Task 4: TaskPresenter IPC Update

**Files:**

- Modify: `src/main/presenter/taskPresenter.ts`

- [x] **Step 1: Update createTask IPC handler**

Change the `task:createTask` handler from:

```typescript
ipcMain.handle("task:createTask", (_e, title: string, detail?: string) => {
  const task = taskDao.createTask(this.db!, title, detail);
  this.emitTasksChanged();
  return task;
});
```

To:

```typescript
ipcMain.handle("task:createTask", (_e, params: taskDao.CreateTaskParams) => {
  const task = taskDao.createTask(this.db!, params);
  this.emitTasksChanged();
  return task;
});
```

- [x] **Step 2: Update updateTask IPC handler**

Change from:

```typescript
ipcMain.handle("task:updateTask", (_e, id: string, fields: { title?: string; detail?: string }) => {
  const task = taskDao.updateTask(this.db!, id, fields);
  this.emitTasksChanged();
  return task;
});
```

To:

```typescript
ipcMain.handle(
  "task:updateTask",
  (
    _e,
    id: string,
    fields: {
      title?: string;
      detail?: string;
      assigneeType?: string;
      assigneeId?: string;
      scheduledAt?: number | null;
      repeatInterval?: number | null;
    },
  ) => {
    const task = taskDao.updateTask(this.db!, id, fields);
    this.emitTasksChanged();
    return task;
  },
);
```

- [x] **Step 3: Commit**

```bash
git add src/main/presenter/taskPresenter.ts
git commit -m "feat(schedule): update TaskPresenter IPC for extended fields"
```

---

### Task 5: TaskServer HTTP Extension

**Files:**

- Modify: `src/main/tasks/taskServer.ts`

- [x] **Step 1: Extend POST /tasks endpoint**

Update the POST handler body type and logic:

```typescript
app.post<{
  Body: {
    title?: string;
    description?: string;
    creatorType?: string;
    creatorId?: string;
    assigneeType?: string;
    assigneeId?: string;
    scheduledAt?: number;
    repeatInterval?: number;
  };
}>("/tasks", async (req, reply) => {
  const title = req.body.title ?? req.body.description;
  if (!title || typeof title !== "string") {
    return reply.status(400).send({ error: "title is required" });
  }
  const task = taskDao.createTask(db, {
    title,
    creatorType: (req.body.creatorType as "user" | "agent") ?? "user",
    creatorId: req.body.creatorId,
    assigneeType: (req.body.assigneeType as "user" | "agent") ?? "user",
    assigneeId: req.body.assigneeId,
    scheduledAt: req.body.scheduledAt,
    repeatInterval: req.body.repeatInterval,
  });
  onTasksChanged();
  return reply.status(201).send(task);
});
```

- [x] **Step 2: Commit**

```bash
git add src/main/tasks/taskServer.ts
git commit -m "feat(schedule): extend TaskServer HTTP for new fields"
```

---

### Task 6: CLI Extension

**Files:**

- Modify: `src/cli/commands/task.ts`

- [x] **Step 1: Update Task interface in CLI**

```typescript
interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  creatorType: string;
  creatorId?: string;
  assigneeType: string;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}
```

- [x] **Step 2: Add argument parsing helper**

```typescript
function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  return args[idx + 1];
}
```

- [x] **Step 3: Update the `add` subcommand**

Replace the existing `add` block:

```typescript
if (sub === "add") {
  // Extract flags from rest
  const creatorType = parseFlag(rest, "--creator-type");
  const creatorId = parseFlag(rest, "--creator-id");
  const assigneeType = parseFlag(rest, "--assignee-type");
  const assigneeId = parseFlag(rest, "--assignee-id");
  const scheduledAtStr = parseFlag(rest, "--scheduled-at");
  const repeatStr = parseFlag(rest, "--repeat");

  // Validate required flags
  if (!creatorType) throw new Error("--creator-type is required (user|agent)");
  if (!creatorId) throw new Error("--creator-id is required");
  if (creatorType !== "user" && creatorType !== "agent") {
    throw new Error(`--creator-type must be 'user' or 'agent', got '${creatorType}'`);
  }
  if (assigneeType && assigneeType !== "user" && assigneeType !== "agent") {
    throw new Error(`--assignee-type must be 'user' or 'agent', got '${assigneeType}'`);
  }

  // Extract title (args that are not flags)
  const flagNames = [
    "--creator-type",
    "--creator-id",
    "--assignee-type",
    "--assignee-id",
    "--scheduled-at",
    "--repeat",
  ];
  const titleParts: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (flagNames.includes(rest[i])) {
      i++;
      continue;
    } // skip flag + value
    titleParts.push(rest[i]);
  }
  const title = titleParts.join(" ").trim();
  if (!title) throw new Error("title is required");

  const body: Record<string, unknown> = {
    title,
    creatorType,
    creatorId,
  };
  if (assigneeType) body.assigneeType = assigneeType;
  if (assigneeId) body.assigneeId = assigneeId;
  if (scheduledAtStr) body.scheduledAt = Number(scheduledAtStr);
  if (repeatStr) body.repeatInterval = Number(repeatStr);

  const task = (await httpRequest("POST", "/tasks", body)) as Task;
  process.stdout.write(formatTask(task) + "\n");
}
```

- [x] **Step 4: Update formatTask to show new fields**

```typescript
function formatTask(t: Task): string {
  const parts = [
    `[${t.id}] ${t.title} [${STATUS_LABEL[t.status] ?? t.status}]`,
    `creator:${t.creatorType}/${t.creatorId ?? "-"}`,
  ];
  if (t.assigneeId) parts.push(`assignee:${t.assigneeType}/${t.assigneeId}`);
  if (t.scheduledAt) parts.push(`scheduled:${formatTime(t.scheduledAt)}`);
  if (t.repeatInterval) parts.push(`repeat:${t.repeatInterval}min`);
  parts.push(`created:${formatTime(t.createdAt)}`);
  if (t.startedAt) parts.push(`started:${formatTime(t.startedAt)}`);
  if (t.finishedAt) parts.push(`finished:${formatTime(t.finishedAt)}`);
  return parts.join(" ");
}
```

- [x] **Step 5: Update help text**

```typescript
process.stdout.write(
  `task <subcommand> [args]
  add <描述> --creator-type <user|agent> --creator-id <id> [--assignee-type <user|agent>] [--assignee-id <id>] [--scheduled-at <timestamp_ms>] [--repeat <minutes>]
  start <id>                   待办 → 进行中
  done <id>                    进行中 → 已完成
  cancel <id>                  任意状态 → 已取消
  list [--status <状态>]       列表查询
  get <id>                     查询单个任务详情

状态值: todo | in_progress | done | cancelled\n`,
);
```

- [x] **Step 6: Update allowedRoles to include all roles**

Since we need both user and agents to create tasks with explicit `--creator-type`:

```typescript
export const taskCommand: CommandDef = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent", "user"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
```

Note: Remove the `allowedAgents` restriction since any agent/user can now use it.

- [x] **Step 7: Commit**

```bash
git add src/cli/commands/task.ts
git commit -m "feat(schedule): extend CLI task command with creator/assignee/schedule flags"
```

---

### Task 7: Schedule Utils

**Files:**

- Create: `src/renderer/src/utils/scheduleUtils.ts`

- [x] **Step 1: Create the utility file**

```typescript
import type { RepeatPreset } from "@shared/types/schedule";

export const REPEAT_PRESETS: { value: RepeatPreset; label: string; minutes: number | null }[] = [
  { value: "none", label: "不循环", minutes: null },
  { value: "hourly", label: "每小时", minutes: 60 },
  { value: "daily", label: "每天", minutes: 1440 },
  { value: "weekly", label: "每周", minutes: 10080 },
  { value: "monthly", label: "每月", minutes: 43200 },
  { value: "custom", label: "自定义", minutes: null },
];

export function getNextExecutions(
  scheduledAt: number,
  repeatInterval: number | null | undefined,
  count = 3,
): number[] {
  if (!scheduledAt) return [];
  if (!repeatInterval) return [scheduledAt];
  const now = Date.now();
  const intervalMs = repeatInterval * 60_000;
  let next = scheduledAt;
  while (next < now) next += intervalMs;
  return Array.from({ length: count }, (_, i) => next + i * intervalMs);
}

export function formatScheduleTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

export function intervalToLabel(minutes: number): string {
  const preset = REPEAT_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}
```

- [x] **Step 2: Commit**

```bash
git add src/renderer/src/utils/scheduleUtils.ts
git commit -m "feat(schedule): add scheduleUtils with getNextExecutions and presets"
```

---

### Task 8: Store Update

**Files:**

- Modify: `src/renderer/src/stores/schedule.ts`

- [x] **Step 1: Update createTask signature**

Change:

```typescript
async function createTask(title: string, detail?: string): Promise<Task> {
  const task = (await ipc.invoke("task:createTask", title, detail)) as Task;
  await fetchTasks();
  return task;
}
```

To:

```typescript
async function createTask(params: {
  title: string;
  detail?: string;
  creatorType?: string;
  creatorId?: string;
  assigneeType?: string;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}): Promise<Task> {
  const task = (await ipc.invoke("task:createTask", params)) as Task;
  await fetchTasks();
  return task;
}
```

- [x] **Step 2: Update updateTask signature**

Change:

```typescript
async function updateTask(id: string, fields: { title?: string; detail?: string }): Promise<void> {
  await ipc.invoke("task:updateTask", id, fields);
  await fetchTasks();
}
```

To:

```typescript
async function updateTask(
  id: string,
  fields: {
    title?: string;
    detail?: string;
    assigneeType?: string;
    assigneeId?: string;
    scheduledAt?: number | null;
    repeatInterval?: number | null;
  },
): Promise<void> {
  await ipc.invoke("task:updateTask", id, fields);
  await fetchTasks();
}
```

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/stores/schedule.ts
git commit -m "feat(schedule): update store createTask/updateTask for new fields"
```

---

### Task 9: SchedulePanel createTask Caller Update

**Files:**

- Modify: `src/renderer/src/views/SchedulePanel.vue`

- [x] **Step 1: Update createNewTask to use object params**

Change:

```typescript
async function createNewTask(): Promise<void> {
  const task = await store.createTask("新任务");
  selectedTaskId.value = task.id;
  showTaskDetail.value = true;
}
```

To:

```typescript
async function createNewTask(): Promise<void> {
  const task = await store.createTask({ title: "新任务" });
  selectedTaskId.value = task.id;
  showTaskDetail.value = true;
}
```

- [x] **Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/views/SchedulePanel.vue
git commit -m "fix(schedule): update SchedulePanel createTask to use params object"
```

---

### Task 10: TaskBoard UI — Assignee & Schedule Indicators

**Files:**

- Modify: `src/renderer/src/components/schedule/TaskBoard.vue`

- [x] **Step 1: Add imports and computed helpers**

Add at the top of `<script setup>`:

```typescript
import { getNextExecutions, formatScheduleTime, intervalToLabel } from "@/utils/scheduleUtils";
```

- [x] **Step 2: Add assignee/schedule indicators to task items in active section**

In the active tasks `<button>` template, after the `<span>` for title, add before the date span:

```html
<span
  v-if="task.assigneeType === 'agent' && task.assigneeId"
  class="shrink-0 rounded bg-violet-500/15 px-1 text-[10px] text-violet-400"
  >{{ task.assigneeId }}</span
>
<span v-if="task.scheduledAt" class="flex shrink-0 items-center gap-0.5 text-[10px] text-blue-400">
  <Icon icon="lucide:clock" class="h-2.5 w-2.5" />
  <Icon v-if="task.repeatInterval" icon="lucide:repeat" class="h-2.5 w-2.5" />
</span>
```

Apply the same indicators to the finished tasks section.

- [x] **Step 3: Commit**

```bash
git add src/renderer/src/components/schedule/TaskBoard.vue
git commit -m "feat(schedule): add assignee/schedule indicators to TaskBoard"
```

---

### Task 11: ScheduleConfig Component

**Files:**

- Create: `src/renderer/src/components/schedule/ScheduleConfig.vue`

- [x] **Step 1: Create the component**

```vue
<template>
  <div class="space-y-3">
    <!-- 定时开关 -->
    <label class="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" :checked="enabled" class="accent-violet-500" @change="toggleEnabled" />
      启用定时
    </label>

    <template v-if="enabled">
      <!-- 首次执行时间 -->
      <div>
        <div class="mb-1 text-xs text-muted-foreground">首次执行时间</div>
        <input
          type="datetime-local"
          :value="scheduledLocal"
          class="w-full rounded-md border border-border bg-muted/30 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          @input="onScheduledChange"
        />
      </div>

      <!-- 循环开关 -->
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          :checked="repeatEnabled"
          class="accent-violet-500"
          @change="toggleRepeat"
        />
        循环执行
      </label>

      <!-- 间隔周期 -->
      <template v-if="repeatEnabled">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="preset in presets"
            :key="preset.value"
            :class="[
              'rounded px-2 py-0.5 text-xs',
              activePreset === preset.value
                ? 'bg-violet-500/20 text-violet-400'
                : 'text-muted-foreground hover:bg-muted',
            ]"
            @click="selectPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>

        <!-- 自定义输入 -->
        <div v-if="activePreset === 'custom'" class="flex items-center gap-2 text-xs">
          <input
            v-model.number="customHours"
            type="number"
            min="0"
            class="w-14 rounded border border-border bg-muted/30 px-1 py-0.5 text-center text-foreground"
            @input="emitCustomInterval"
          />
          <span class="text-muted-foreground">小时</span>
          <input
            v-model.number="customMinutes"
            type="number"
            min="0"
            max="59"
            class="w-14 rounded border border-border bg-muted/30 px-1 py-0.5 text-center text-foreground"
            @input="emitCustomInterval"
          />
          <span class="text-muted-foreground">分钟</span>
        </div>
      </template>

      <!-- 预览 -->
      <div v-if="nextTimes.length > 0" class="rounded bg-muted/30 p-2">
        <div class="mb-1 text-[10px] text-muted-foreground">接下来执行时间</div>
        <div v-for="(t, i) in nextTimes" :key="i" class="text-xs text-foreground">
          {{ formatScheduleTime(t) }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { RepeatPreset } from "@shared/types/schedule";
import { REPEAT_PRESETS, getNextExecutions, formatScheduleTime } from "@/utils/scheduleUtils";

const props = defineProps<{
  scheduledAt?: number;
  repeatInterval?: number;
}>();

const emit = defineEmits<{
  "update:scheduledAt": [value: number | undefined];
  "update:repeatInterval": [value: number | undefined];
}>();

const enabled = computed(() => props.scheduledAt != null);
const repeatEnabled = computed(() => (props.repeatInterval ?? 0) > 0);

const presets = REPEAT_PRESETS.filter((p) => p.value !== "none");

const activePreset = computed<RepeatPreset>(() => {
  if (!props.repeatInterval) return "none";
  const found = REPEAT_PRESETS.find((p) => p.minutes === props.repeatInterval);
  return found ? found.value : "custom";
});

const customHours = ref(0);
const customMinutes = ref(0);

watch(
  () => props.repeatInterval,
  (v) => {
    if (v && activePreset.value === "custom") {
      customHours.value = Math.floor(v / 60);
      customMinutes.value = v % 60;
    }
  },
  { immediate: true },
);

const scheduledLocal = computed(() => {
  if (!props.scheduledAt) return "";
  const d = new Date(props.scheduledAt);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
});

const nextTimes = computed(() => {
  if (!props.scheduledAt) return [];
  return getNextExecutions(props.scheduledAt, props.repeatInterval, 3);
});

function toggleEnabled(e: Event): void {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    // Default to next hour
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    emit("update:scheduledAt", next.getTime());
  } else {
    emit("update:scheduledAt", undefined);
    emit("update:repeatInterval", undefined);
  }
}

function toggleRepeat(e: Event): void {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    emit("update:repeatInterval", 1440); // default daily
  } else {
    emit("update:repeatInterval", undefined);
  }
}

function onScheduledChange(e: Event): void {
  const value = (e.target as HTMLInputElement).value;
  if (value) {
    emit("update:scheduledAt", new Date(value).getTime());
  }
}

function selectPreset(preset: { value: RepeatPreset; minutes: number | null }): void {
  if (preset.value === "custom") {
    const total = customHours.value * 60 + customMinutes.value;
    emit("update:repeatInterval", total > 0 ? total : 60);
  } else if (preset.minutes) {
    emit("update:repeatInterval", preset.minutes);
  }
}

function emitCustomInterval(): void {
  const total = customHours.value * 60 + customMinutes.value;
  if (total > 0) emit("update:repeatInterval", total);
}
</script>
```

- [x] **Step 2: Commit**

```bash
git add src/renderer/src/components/schedule/ScheduleConfig.vue
git commit -m "feat(schedule): add ScheduleConfig component"
```

---

### Task 12: TaskDetailDialog Extension

**Files:**

- Modify: `src/renderer/src/components/schedule/TaskDetailDialog.vue`

- [x] **Step 1: Add imports**

Add to the script imports:

```typescript
import ScheduleConfig from "./ScheduleConfig.vue";
import type { ActorType } from "@shared/types/schedule";
```

- [x] **Step 2: Add state refs for new fields**

After the existing `attachments` ref:

```typescript
const assigneeType = ref<ActorType>("user");
const assigneeId = ref<string | undefined>(undefined);
const scheduledAt = ref<number | undefined>(undefined);
const repeatInterval = ref<number | undefined>(undefined);
const agents = ref<{ id: string; name: string }[]>([]);
```

- [x] **Step 3: Load agents and populate fields on open**

In the `watch` callback, after setting `detail.value`, add:

```typescript
assigneeType.value = task.value?.assigneeType ?? "user";
assigneeId.value = task.value?.assigneeId;
scheduledAt.value = task.value?.scheduledAt;
repeatInterval.value = task.value?.repeatInterval;
// Load agents for assignee selector
const agentList = (await ipc.invoke("presenter:call", "agentConfig", "listAgents")) as {
  id: string;
  name: string;
}[];
agents.value = agentList;
```

- [x] **Step 4: Add assignee selector to template**

After the detail textarea section, add:

```html
<!-- 归属人 -->
<div class="mb-4">
  <div class="mb-1 text-xs text-muted-foreground">归属人</div>
  <select
    :value="assigneeId ?? '__user__'"
    class="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
    @change="onAssigneeChange"
  >
    <option value="__user__">我</option>
    <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
  </select>
</div>
```

- [x] **Step 5: Add schedule config to template**

After the assignee section:

```html
<!-- 定时设置 -->
<div class="mb-4">
  <div class="mb-1 text-xs text-muted-foreground">定时</div>
  <ScheduleConfig
    :scheduled-at="scheduledAt"
    :repeat-interval="repeatInterval"
    @update:scheduled-at="onScheduledAtChange"
    @update:repeat-interval="onRepeatIntervalChange"
  />
</div>
```

- [x] **Step 6: Add creator display to the bottom info section**

Update the bottom info div to include creator:

```html
<div class="text-[11px] text-muted-foreground/60">
  <span v-if="task?.creatorType === 'agent'"> 由 {{ task.creatorId }} 创建 </span>
  <span v-else>由我创建</span>
  · 创建于 {{ formatTime(task?.createdAt) }}
  <span v-if="task?.startedAt"> · 开始于 {{ formatTime(task.startedAt) }}</span>
  <span v-if="task?.finishedAt"> · 结束于 {{ formatTime(task.finishedAt) }}</span>
</div>
```

- [x] **Step 7: Add handler functions**

```typescript
function onAssigneeChange(e: Event): void {
  const value = (e.target as HTMLSelectElement).value;
  if (value === "__user__") {
    assigneeType.value = "user";
    assigneeId.value = undefined;
  } else {
    assigneeType.value = "agent";
    assigneeId.value = value;
  }
  saveAssignee();
}

async function saveAssignee(): Promise<void> {
  if (!props.taskId) return;
  await ipc.invoke("task:updateTask", props.taskId, {
    assigneeType: assigneeType.value,
    assigneeId: assigneeId.value ?? null,
  });
  emit("changed");
}

function onScheduledAtChange(value: number | undefined): void {
  scheduledAt.value = value;
  saveSchedule();
}

function onRepeatIntervalChange(value: number | undefined): void {
  repeatInterval.value = value;
  saveSchedule();
}

async function saveSchedule(): Promise<void> {
  if (!props.taskId) return;
  await ipc.invoke("task:updateTask", props.taskId, {
    scheduledAt: scheduledAt.value ?? null,
    repeatInterval: repeatInterval.value ?? null,
  });
  emit("changed");
}
```

- [x] **Step 8: Run lint and format**

Run: `pnpm run format && pnpm run lint`

- [x] **Step 9: Commit**

```bash
git add src/renderer/src/components/schedule/TaskDetailDialog.vue
git commit -m "feat(schedule): add assignee/schedule/creator UI to TaskDetailDialog"
```

---

### Task 13: Final Typecheck & Lint

**Files:** All modified files

- [x] **Step 1: Run full typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no errors)

- [x] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [x] **Step 3: Run format**

Run: `pnpm run format`

- [x] **Step 4: Run tests**

Run: `pnpm test`
Expected: All tests pass

- [x] **Step 5: Commit any format fixes**

```bash
git add -A
git commit -m "style(schedule): format and lint fixes"
```
