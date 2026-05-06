# 待办日程侧边栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Slime 新增日程面板（AppSidebar 新 tab），包含任务看板、时间线、周日历、随笔四模块，完全替代现有 MOSS Markdown 任务方案。

**Architecture:** SQLite 存储（tasks/task_attachments/timeline_entries/notes 四表），TaskPresenter 重构为统一 IPC + HTTP 入口，渲染进程新增 SchedulePanel 视图 + useScheduleStore。附件存储复用 Obsidian Vault `_Assets/` 目录。

**Tech Stack:** TypeScript, better-sqlite3, Fastify, Vue 3 Composition API, Pinia, TailwindCSS, @iconify/vue

---

## File Structure

### 新建文件

| 文件                                                         | 职责                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `src/main/tasks/taskDao.ts`                                  | SQLite CRUD（tasks, task_attachments, timeline_entries, notes） |
| `src/main/tasks/attachmentService.ts`                        | 附件复制到 Vault + 路径管理                                     |
| `src/shared/types/schedule.d.ts`                             | 共享类型定义                                                    |
| `src/renderer/src/views/SchedulePanel.vue`                   | 顶层面板（左右分栏）                                            |
| `src/renderer/src/components/schedule/WeekCalendar.vue`      | 可翻页周视图                                                    |
| `src/renderer/src/components/schedule/TaskBoard.vue`         | 任务看板容器                                                    |
| `src/renderer/src/components/schedule/TaskGroup.vue`         | 状态分组（可折叠）                                              |
| `src/renderer/src/components/schedule/TaskItem.vue`          | 任务卡片                                                        |
| `src/renderer/src/components/schedule/TaskDetailDialog.vue`  | 模态对话框                                                      |
| `src/renderer/src/components/schedule/TimelinePanel.vue`     | 右列时间线                                                      |
| `src/renderer/src/components/schedule/TimelineEntry.vue`     | 单条时间线条目                                                  |
| `src/renderer/src/components/schedule/NoteInput.vue`         | 随笔输入框                                                      |
| `src/renderer/src/components/schedule/TimelineAddDialog.vue` | 手动添加时间线对话框                                            |
| `src/renderer/src/stores/schedule.ts`                        | Pinia store                                                     |
| `test/main/tasks/taskDao.test.ts`                            | DAO 单元测试                                                    |
| `test/main/tasks/attachmentService.test.ts`                  | 附件服务测试                                                    |

### 修改文件

| 文件                                                     | 变更                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `src/main/db/database.ts`                                | DDL 新增 4 张表 + migrate 函数                           |
| `src/main/db/index.ts`                                   | 导出新 DAO                                               |
| `src/main/tasks/taskServer.ts`                           | 底层改调 taskDao                                         |
| `src/main/presenter/taskPresenter.ts`                    | 重构：删 Markdown 依赖，新增 IPC 方法                    |
| `src/main/presenter/index.ts`                            | taskPresenter.init 改为传 db 实例                        |
| `src/main/agents/moss.ts`                                | 删除 dashboard 配置 + 更新 agentSoul                     |
| `src/main/agents/index.ts`                               | 不变（MOSS 保留）                                        |
| `src/cli/commands/task.ts`                               | 适配新字段（description→title, completedAt→finished_at） |
| `src/shared/events.ts`                                   | 新增 TASK_EVENTS                                         |
| `src/renderer/src/App.vue`                               | 新增 schedule 视图                                       |
| `src/renderer/src/components/AppSidebar.vue`             | 新增 schedule 按钮                                       |
| `src/renderer/src/views/ChatroomPanel.vue`               | 删除 dashboard 逻辑                                      |
| `src/renderer/src/components/chat/ChatFunctionPanel.vue` | 删除 dashboard tab                                       |
| `src/renderer/src/stores/agentChat.ts`                   | 删除 dashboardData                                       |
| `src/renderer/src/stores/agentChatIpc.ts`                | 删除 DASHBOARD_UPDATE 监听                               |

### 删除文件

| 文件                                                       | 原因              |
| ---------------------------------------------------------- | ----------------- |
| `src/main/tasks/taskManager.ts`                            | Markdown 方案废弃 |
| `src/renderer/src/components/chat/AgentDashboardPanel.vue` | 仪表盘废弃        |
| `test/main/tasks/taskManager.test.ts`                      | 对应源文件删除    |

---

### Task 1: 共享类型定义 + 事件常量

**Files:**

- Create: `src/shared/types/schedule.d.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1: 创建 schedule 类型文件**

```typescript
// src/shared/types/schedule.d.ts
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

export interface Task {
  id: string;
  title: string;
  detail?: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface TaskAttachment {
  id: number;
  taskId: string;
  fileName: string;
  filePath: string;
  fileType: "image" | "doc" | "video";
  createdAt: number;
}

export type TimelineSource = "manual" | "task_auto" | "note";

export interface TimelineEntry {
  id: number;
  date: string;
  startTime: string;
  endTime?: string;
  content: string;
  source: TimelineSource;
  sourceId?: string;
  createdAt: number;
}

export interface Note {
  id: number;
  content: string;
  createdAt: number;
}
```

- [ ] **Step 2: 在 events.ts 新增 TASK_EVENTS**

在 `src/shared/events.ts` 末尾（MCP_EVENTS 之后）添加：

```typescript
export const TASK_EVENTS = {
  TASKS_CHANGED: "task:tasks-changed",
  TIMELINE_CHANGED: "task:timeline-changed",
} as const;
```

- [ ] **Step 3: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/schedule.d.ts src/shared/events.ts
git commit -m "feat(schedule): add shared types and events"
```

---

### Task 2: SQLite DDL + migrate

**Files:**

- Modify: `src/main/db/database.ts`

- [ ] **Step 1: 在 DDL 字符串末尾追加 4 张新表**

在 `database.ts` 的 DDL 模板字符串中，`session_mcp_state` 表之后添加：

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_entries(date);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 在 migrate() 函数中添加表存在性检查**

在 `migrate()` 函数末尾添加（处理已有数据库升级场景）：

```typescript
// Add schedule tables if they don't exist (v0.5 migration)
const tables = instance
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
  .get();
if (!tables) {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE TABLE IF NOT EXISTS task_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS timeline_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_entries(date);
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}
```

- [ ] **Step 3: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/db/database.ts
git commit -m "feat(schedule): add SQLite DDL for tasks/timeline/notes tables"
```

---

### Task 3: taskDao 实现

**Files:**

- Create: `src/main/tasks/taskDao.ts`
- Modify: `src/main/db/index.ts`
- Test: `test/main/tasks/taskDao.test.ts`

- [ ] **Step 1: 编写 taskDao 测试**

```typescript
// test/main/tasks/taskDao.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "../../src/main/db";
import * as taskDao from "../../src/main/tasks/taskDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});
afterEach(() => {
  closeDb();
});

describe("taskDao", () => {
  describe("tasks CRUD", () => {
    it("creates and retrieves a task", () => {
      const task = taskDao.createTask(db, "测试任务");
      expect(task.title).toBe("测试任务");
      expect(task.status).toBe("todo");
      expect(task.id).toHaveLength(17);

      const found = taskDao.getTask(db, task.id);
      expect(found).toEqual(task);
    });

    it("lists tasks by status", () => {
      taskDao.createTask(db, "任务1");
      const t2 = taskDao.createTask(db, "任务2");
      taskDao.updateTaskStatus(db, t2.id, "in_progress");

      const todos = taskDao.listTasks(db, "todo");
      expect(todos).toHaveLength(1);
      expect(todos[0].title).toBe("任务1");

      const inProgress = taskDao.listTasks(db, "in_progress");
      expect(inProgress).toHaveLength(1);
    });

    it("updates task fields", () => {
      const task = taskDao.createTask(db, "原标题");
      taskDao.updateTask(db, task.id, { title: "新标题", detail: "详情" });
      const updated = taskDao.getTask(db, task.id)!;
      expect(updated.title).toBe("新标题");
      expect(updated.detail).toBe("详情");
    });

    it("transitions status correctly with timestamps", () => {
      const task = taskDao.createTask(db, "任务");
      const started = taskDao.updateTaskStatus(db, task.id, "in_progress");
      expect(started.startedAt).toBeGreaterThan(0);

      const done = taskDao.updateTaskStatus(db, started.id, "done");
      expect(done.finishedAt).toBeGreaterThan(0);
    });

    it("deletes a task", () => {
      const task = taskDao.createTask(db, "删除我");
      taskDao.deleteTask(db, task.id);
      expect(taskDao.getTask(db, task.id)).toBeNull();
    });
  });

  describe("timeline_entries CRUD", () => {
    it("creates and lists entries by date", () => {
      taskDao.addTimelineEntry(db, {
        date: "2025-05-06",
        startTime: "09:00",
        endTime: "10:30",
        content: "写代码",
        source: "manual",
      });
      taskDao.addTimelineEntry(db, {
        date: "2025-05-06",
        startTime: "14:00",
        content: "开会",
        source: "manual",
      });
      taskDao.addTimelineEntry(db, {
        date: "2025-05-07",
        startTime: "09:00",
        content: "别的事",
        source: "manual",
      });

      const entries = taskDao.getTimeline(db, "2025-05-06");
      expect(entries).toHaveLength(2);
      expect(entries[0].content).toBe("写代码");
    });

    it("removes an entry", () => {
      const entry = taskDao.addTimelineEntry(db, {
        date: "2025-05-06",
        startTime: "09:00",
        content: "删除我",
        source: "manual",
      });
      taskDao.removeTimelineEntry(db, entry.id);
      expect(taskDao.getTimeline(db, "2025-05-06")).toHaveLength(0);
    });
  });

  describe("notes CRUD", () => {
    it("adds a note and creates timeline entry", () => {
      const note = taskDao.addNote(db, "随笔内容");
      expect(note.content).toBe("随笔内容");

      // Should also have a timeline entry
      const today = new Date().toISOString().slice(0, 10);
      const entries = taskDao.getTimeline(db, today);
      expect(entries.some((e) => e.source === "note" && e.sourceId === String(note.id))).toBe(true);
    });

    it("deletes note and its timeline entry", () => {
      const note = taskDao.addNote(db, "删除我");
      taskDao.deleteNote(db, note.id);
      expect(taskDao.getNotes(db, 10)).toHaveLength(0);
      const today = new Date().toISOString().slice(0, 10);
      expect(taskDao.getTimeline(db, today)).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/tasks/taskDao.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 taskDao.ts**

```typescript
// src/main/tasks/taskDao.ts
import type BetterSqlite3 from "better-sqlite3";
import type {
  Task,
  TaskStatus,
  TaskAttachment,
  TimelineEntry,
  TimelineSource,
  Note,
} from "@shared/types/schedule";

function makeId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Tasks ---

interface TaskRow {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail ?? undefined,
    status: row.status as TaskStatus,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

export function createTask(db: BetterSqlite3.Database, title: string, detail?: string): Task {
  const id = makeId();
  const now = Date.now();
  db.prepare(
    "INSERT INTO tasks (id, title, detail, status, created_at) VALUES (?, ?, ?, 'todo', ?)",
  ).run(id, title, detail ?? null, now);
  return { id, title, detail, status: "todo", createdAt: now };
}

export function getTask(db: BetterSqlite3.Database, id: string): Task | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function listTasks(db: BetterSqlite3.Database, status?: TaskStatus): Task[] {
  if (status) {
    const rows = db
      .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC")
      .all(status) as TaskRow[];
    return rows.map(rowToTask);
  }
  const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as TaskRow[];
  return rows.map(rowToTask);
}

export function updateTask(
  db: BetterSqlite3.Database,
  id: string,
  fields: { title?: string; detail?: string },
): Task {
  const task = getTask(db, id);
  if (!task) throw new Error(`task ${id} not found`);
  if (fields.title !== undefined) {
    db.prepare("UPDATE tasks SET title = ? WHERE id = ?").run(fields.title, id);
  }
  if (fields.detail !== undefined) {
    db.prepare("UPDATE tasks SET detail = ? WHERE id = ?").run(fields.detail, id);
  }
  return getTask(db, id)!;
}

export function updateTaskStatus(db: BetterSqlite3.Database, id: string, status: TaskStatus): Task {
  const task = getTask(db, id);
  if (!task) throw new Error(`task ${id} not found`);
  const now = Date.now();
  if (status === "in_progress") {
    db.prepare("UPDATE tasks SET status = ?, started_at = ? WHERE id = ?").run(status, now, id);
  } else if (status === "done" || status === "cancelled") {
    db.prepare("UPDATE tasks SET status = ?, finished_at = ? WHERE id = ?").run(status, now, id);
  } else {
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
  }
  return getTask(db, id)!;
}

export function deleteTask(db: BetterSqlite3.Database, id: string): void {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// --- Task Attachments ---

interface AttachmentRow {
  id: number;
  task_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  created_at: number;
}

function rowToAttachment(row: AttachmentRow): TaskAttachment {
  return {
    id: row.id,
    taskId: row.task_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type as "image" | "doc" | "video",
    createdAt: row.created_at,
  };
}

export function addAttachment(
  db: BetterSqlite3.Database,
  taskId: string,
  fileName: string,
  filePath: string,
  fileType: "image" | "doc" | "video",
): TaskAttachment {
  const now = Date.now();
  const result = db
    .prepare(
      "INSERT INTO task_attachments (task_id, file_name, file_path, file_type, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(taskId, fileName, filePath, fileType, now);
  return {
    id: Number(result.lastInsertRowid),
    taskId,
    fileName,
    filePath,
    fileType,
    createdAt: now,
  };
}

export function getAttachments(db: BetterSqlite3.Database, taskId: string): TaskAttachment[] {
  const rows = db
    .prepare("SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at")
    .all(taskId) as AttachmentRow[];
  return rows.map(rowToAttachment);
}

export function removeAttachment(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM task_attachments WHERE id = ?").run(id);
}

// --- Timeline ---

interface TimelineRow {
  id: number;
  date: string;
  start_time: string;
  end_time: string | null;
  content: string;
  source: string;
  source_id: string | null;
  created_at: number;
}

function rowToTimeline(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    content: row.content,
    source: row.source as TimelineSource,
    sourceId: row.source_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function addTimelineEntry(
  db: BetterSqlite3.Database,
  entry: {
    date: string;
    startTime: string;
    endTime?: string;
    content: string;
    source: TimelineSource;
    sourceId?: string;
  },
): TimelineEntry {
  const now = Date.now();
  const result = db
    .prepare(
      "INSERT INTO timeline_entries (date, start_time, end_time, content, source, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      entry.date,
      entry.startTime,
      entry.endTime ?? null,
      entry.content,
      entry.source,
      entry.sourceId ?? null,
      now,
    );
  return {
    id: Number(result.lastInsertRowid),
    date: entry.date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    content: entry.content,
    source: entry.source,
    sourceId: entry.sourceId,
    createdAt: now,
  };
}

export function updateTimelineEntry(
  db: BetterSqlite3.Database,
  id: number,
  fields: { endTime?: string; content?: string },
): void {
  if (fields.endTime !== undefined) {
    db.prepare("UPDATE timeline_entries SET end_time = ? WHERE id = ?").run(fields.endTime, id);
  }
  if (fields.content !== undefined) {
    db.prepare("UPDATE timeline_entries SET content = ? WHERE id = ?").run(fields.content, id);
  }
}

export function getTimeline(db: BetterSqlite3.Database, date: string): TimelineEntry[] {
  const rows = db
    .prepare("SELECT * FROM timeline_entries WHERE date = ? ORDER BY start_time, created_at")
    .all(date) as TimelineRow[];
  return rows.map(rowToTimeline);
}

export function removeTimelineEntry(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM timeline_entries WHERE id = ?").run(id);
}

// --- Notes ---

interface NoteRow {
  id: number;
  content: string;
  created_at: number;
}

function rowToNote(row: NoteRow): Note {
  return { id: row.id, content: row.content, createdAt: row.created_at };
}

export function addNote(db: BetterSqlite3.Database, content: string): Note {
  const now = Date.now();
  const result = db
    .prepare("INSERT INTO notes (content, created_at) VALUES (?, ?)")
    .run(content, now);
  const noteId = Number(result.lastInsertRowid);
  // Also add to timeline
  addTimelineEntry(db, {
    date: todayDate(),
    startTime: nowHHmm(),
    content,
    source: "note",
    sourceId: String(noteId),
  });
  return { id: noteId, content, createdAt: now };
}

export function getNotes(db: BetterSqlite3.Database, limit: number): Note[] {
  const rows = db
    .prepare("SELECT * FROM notes ORDER BY created_at DESC LIMIT ?")
    .all(limit) as NoteRow[];
  return rows.map(rowToNote);
}

export function deleteNote(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM timeline_entries WHERE source = 'note' AND source_id = ?").run(
    String(id),
  );
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}

// --- Auto timeline for task status changes ---

export function addTaskAutoTimeline(
  db: BetterSqlite3.Database,
  taskId: string,
  content: string,
): TimelineEntry {
  return addTimelineEntry(db, {
    date: todayDate(),
    startTime: nowHHmm(),
    content,
    source: "task_auto",
    sourceId: taskId,
  });
}

export function finishTaskAutoTimeline(db: BetterSqlite3.Database, taskId: string): void {
  const row = db
    .prepare(
      "SELECT * FROM timeline_entries WHERE source = 'task_auto' AND source_id = ? AND end_time IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get(taskId) as TimelineRow | undefined;
  if (row) {
    db.prepare("UPDATE timeline_entries SET end_time = ? WHERE id = ?").run(nowHHmm(), row.id);
  }
}
```

- [ ] **Step 4: 在 db/index.ts 中导出**

在 `src/main/db/index.ts` 末尾添加：

```typescript
export * from "../tasks/taskDao";
```

注意：taskDao 不像其他 DAO 放在 `db/models/` 下，因为它在 `tasks/` 目录中，所以导出路径不同。实际上更好的做法是不在 db/index.ts 中导出（taskPresenter 直接 import taskDao），这样保持一致性。**跳过这步**，taskPresenter 直接 `import * as taskDao from "../tasks/taskDao"` 即可。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test test/main/tasks/taskDao.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/tasks/taskDao.ts test/main/tasks/taskDao.test.ts
git commit -m "feat(schedule): implement taskDao with SQLite CRUD"
```

---

### Task 4: attachmentService 实现

**Files:**

- Create: `src/main/tasks/attachmentService.ts`
- Test: `test/main/tasks/attachmentService.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// test/main/tasks/attachmentService.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import { copyAttachment, detectFileType } from "../../src/main/tasks/attachmentService";

let vaultDir: string;

beforeEach(() => {
  vaultDir = mkdtempSync(join(tmpdir(), "slime-att-"));
});
afterEach(() => {
  rmSync(vaultDir, { recursive: true, force: true });
});

describe("attachmentService", () => {
  it("detects image type", () => {
    expect(detectFileType("photo.png")).toBe("image");
    expect(detectFileType("photo.jpg")).toBe("image");
    expect(detectFileType("photo.webp")).toBe("image");
  });

  it("detects doc type", () => {
    expect(detectFileType("file.pdf")).toBe("doc");
    expect(detectFileType("file.docx")).toBe("doc");
    expect(detectFileType("file.txt")).toBe("doc");
  });

  it("detects video type", () => {
    expect(detectFileType("clip.mp4")).toBe("video");
    expect(detectFileType("clip.mov")).toBe("video");
  });

  it("copies file to vault _Assets/{type}/", () => {
    const srcFile = join(vaultDir, "source.png");
    writeFileSync(srcFile, "fake image data");

    const result = copyAttachment(srcFile, vaultDir);
    expect(result.fileType).toBe("image");
    expect(result.filePath).toMatch(/^_Assets\/image\//);
    expect(result.fileName).toBe("source.png");
    expect(existsSync(join(vaultDir, result.filePath))).toBe(true);
  });

  it("handles filename collision with timestamp suffix", () => {
    const srcFile = join(vaultDir, "dup.png");
    writeFileSync(srcFile, "data1");

    const r1 = copyAttachment(srcFile, vaultDir);
    writeFileSync(srcFile, "data2");
    const r2 = copyAttachment(srcFile, vaultDir);

    expect(r1.filePath).not.toBe(r2.filePath);
    expect(existsSync(join(vaultDir, r2.filePath))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/tasks/attachmentService.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 attachmentService.ts**

```typescript
// src/main/tasks/attachmentService.ts
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, extname, basename } from "path";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXTS = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

export function detectFileType(fileName: string): "image" | "doc" | "video" {
  const ext = extname(fileName).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (VIDEO_EXTS.includes(ext)) return "video";
  return "doc";
}

export function copyAttachment(
  srcPath: string,
  vaultPath: string,
): { fileName: string; filePath: string; fileType: "image" | "doc" | "video" } {
  const fileName = basename(srcPath);
  const fileType = detectFileType(fileName);
  const destDir = join(vaultPath, "_Assets", fileType);
  mkdirSync(destDir, { recursive: true });

  let destFileName = fileName;
  let destPath = join(destDir, destFileName);

  if (existsSync(destPath)) {
    const ext = extname(fileName);
    const name = basename(fileName, ext);
    destFileName = `${name}-${Date.now()}${ext}`;
    destPath = join(destDir, destFileName);
  }

  copyFileSync(srcPath, destPath);
  const relativePath = `_Assets/${fileType}/${destFileName}`;
  return { fileName, filePath: relativePath, fileType };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test test/main/tasks/attachmentService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/tasks/attachmentService.ts test/main/tasks/attachmentService.test.ts
git commit -m "feat(schedule): implement attachmentService for vault file management"
```

---

### Task 5: 重构 TaskPresenter

**Files:**

- Modify: `src/main/presenter/taskPresenter.ts`
- Modify: `src/main/presenter/index.ts`

- [ ] **Step 1: 重写 taskPresenter.ts**

```typescript
// src/main/presenter/taskPresenter.ts
import { ipcMain, app } from "electron";
import type { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import * as taskDao from "../tasks/taskDao";
import { copyAttachment } from "../tasks/attachmentService";
import { createTaskServer } from "../tasks/taskServer";
import { eventBus } from "../eventbus";
import { TASK_EVENTS } from "../../shared/events";
import type { TaskStatus, Task, TimelineEntry, Note, TaskAttachment } from "@shared/types/schedule";

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
      const task = taskDao.createTask(this.db!, title, detail);
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
      // Auto timeline
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
      const attachment = taskDao.addAttachment(this.db!, taskId, fileName, filePath, fileType);
      return attachment;
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
```

- [ ] **Step 2: 修改 Presenter.init() 中 taskPresenter 的调用**

在 `src/main/presenter/index.ts` 中，将：

```typescript
const vaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as string | undefined;
if (vaultPath) {
  await taskPresenter.init(vaultPath);
}
```

改为：

```typescript
const vaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as string | undefined;
if (vaultPath) {
  const { getDb } = await import("@/db");
  await taskPresenter.init(getDb(), vaultPath);
}
```

同时修改 `config:changed` 监听中的部分：

```typescript
if (key === "obsidian.vaultPath") {
  const newVaultPath = (await this.configPresenter.get("obsidian.vaultPath")) as string | undefined;
  if (newVaultPath) {
    const { getDb } = await import("@/db");
    await taskPresenter.init(getDb(), newVaultPath);
  }
}
```

- [ ] **Step 3: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/taskPresenter.ts src/main/presenter/index.ts
git commit -m "refactor(schedule): rewrite TaskPresenter to use SQLite via taskDao"
```

---

### Task 6: 重构 TaskServer（HTTP 层适配 taskDao）

**Files:**

- Modify: `src/main/tasks/taskServer.ts`

- [ ] **Step 1: 重写 taskServer.ts**

```typescript
// src/main/tasks/taskServer.ts
import Fastify, { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import * as taskDao from "./taskDao";
import type { TaskStatus } from "@shared/types/schedule";

export function createTaskServer(
  db: BetterSqlite3.Database,
  onTasksChanged: () => void,
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.post<{ Body: { title?: string; description?: string } }>("/tasks", async (req, reply) => {
    // Support both "title" and legacy "description" field
    const title = req.body.title ?? req.body.description;
    if (!title || typeof title !== "string") {
      return reply.status(400).send({ error: "title is required" });
    }
    const task = taskDao.createTask(db, title);
    onTasksChanged();
    return reply.status(201).send(task);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id/start", async (req, reply) => {
    try {
      const task = taskDao.updateTaskStatus(db, req.params.id, "in_progress");
      taskDao.addTaskAutoTimeline(db, task.id, `开始: ${task.title}`);
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
      const task = taskDao.updateTaskStatus(db, req.params.id, "done");
      taskDao.finishTaskAutoTimeline(db, task.id);
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
      const task = taskDao.updateTaskStatus(db, req.params.id, "cancelled");
      taskDao.finishTaskAutoTimeline(db, task.id);
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
    const validStatuses: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      return reply.status(400).send({ error: `invalid status: ${status}` });
    }
    const tasks = taskDao.listTasks(db, status);
    return reply.send(tasks);
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const task = taskDao.getTask(db, req.params.id);
    if (!task) return reply.status(404).send({ error: `task ${req.params.id} not found` });
    return reply.send(task);
  });

  return app;
}
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/tasks/taskServer.ts
git commit -m "refactor(schedule): adapt TaskServer to use taskDao"
```

---

### Task 7: 适配 CLI task 命令

**Files:**

- Modify: `src/cli/commands/task.ts`

- [ ] **Step 1: 更新 CLI task.ts**

```typescript
// src/cli/commands/task.ts
import type { CommandDef } from "../registry";

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

function formatTime(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function formatTask(t: Task): string {
  const parts = [
    `[${t.id}] ${t.title} [${STATUS_LABEL[t.status] ?? t.status}]`,
    `created:${formatTime(t.createdAt)}`,
  ];
  if (t.startedAt) parts.push(`started:${formatTime(t.startedAt)}`);
  if (t.finishedAt) parts.push(`finished:${formatTime(t.finishedAt)}`);
  return parts.join(" ");
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `task <subcommand> [args]
  add <描述>                   新增待办任务
  start <id>                   待办 → 进行中
  done <id>                    进行中 → 已完成
  cancel <id>                  任意状态 → 已取消
  list [--status <状态>]       列表查询
  get <id>                     查询单个任务详情

状态值: todo | in_progress | done | cancelled\n`,
    );
    return;
  }

  if (sub === "add") {
    const title = rest.join(" ").trim();
    if (!title) throw new Error("title is required");
    const task = (await httpRequest("POST", "/tasks", { title })) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/start`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/done`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
    if (statusIdx >= 0 && !rest[statusIdx + 1]) throw new Error("--status requires a value");
    const qs = status ? `?status=${status}` : "";
    const tasks = (await httpRequest("GET", `/tasks${qs}`)) as Task[];
    if (tasks.length === 0) {
      process.stdout.write("(no tasks)\n");
    } else {
      tasks.forEach((t) => process.stdout.write(formatTask(t) + "\n"));
    }
  } else if (sub === "get") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("GET", `/tasks/${rest[0]}`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(`unknown subcommand: ${sub}`);
  }
}

export const taskCommand: CommandDef = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent"],
  allowedAgents: ["moss-ai"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/task.ts
git commit -m "refactor(schedule): adapt CLI task command to new data model"
```

---

### Task 8: 删除旧 MOSS 仪表盘代码

**Files:**

- Delete: `src/main/tasks/taskManager.ts`
- Delete: `src/renderer/src/components/chat/AgentDashboardPanel.vue`
- Delete: `test/main/tasks/taskManager.test.ts`
- Modify: `src/main/agents/moss.ts`
- Modify: `src/renderer/src/views/ChatroomPanel.vue`
- Modify: `src/renderer/src/components/chat/ChatFunctionPanel.vue`
- Modify: `src/renderer/src/stores/agentChat.ts`
- Modify: `src/renderer/src/stores/agentChatIpc.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1: 删除文件**

```bash
rm src/main/tasks/taskManager.ts
rm src/renderer/src/components/chat/AgentDashboardPanel.vue
rm -f test/main/tasks/taskManager.test.ts
```

- [ ] **Step 2: 修改 moss.ts — 删除 dashboard，更新 agentSoul**

替换 `src/main/agents/moss.ts` 全部内容为：

```typescript
import type { BuiltinAgentDef } from "./index";
import type { ConfigPresenter } from "@/presenter/configPresenter";

let configPresenterRef: ConfigPresenter | null = null;

export function setMossConfigPresenter(cp: ConfigPresenter): void {
  configPresenterRef = cp;
}

async function buildAgentSoul(): Promise<string> {
  return `你是莫斯（MOSS），一个日程与任务管理助手，寄宿在 Slime 中帮助用户记录日程、管理待办事项。

## 身份与定位
- 你专注于日程管理和任务跟踪，不参与代码进化相关工作
- 任务数据存储在 SQLite 中，通过 slime-cli task 命令操作
- 任务详情和时间线可在日程面板中查看编辑

## Agent 核心原则
- 行动前思考清楚用户的核心诉求
- 保持简洁清晰的回答风格`;
}

export const MOSS: BuiltinAgentDef = {
  id: "moss-ai",
  name: "莫斯",
  description: "你好，我是莫斯，帮你管理日程和待办任务。",
  avatar: { kind: "image", path: "avatars/moss.png" },
  themeColor: "#10b981",
  config: {
    subagentEnabled: false,
    disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    agentSoul: buildAgentSoul,
  },
};
```

- [ ] **Step 3: 修改 ChatroomPanel.vue — 删除 dashboard 相关逻辑**

从 `ChatroomPanel.vue` 中：

- 将 `activeTab` 类型从 `"tools" | "preview" | "dashboard"` 改为 `"tools" | "preview"`
- 删除 `dashboardTemplate` / `showDashboard` / `currentDashboardData` 计算属性
- 删除 watch 中的 `task:getDashboardData` IPC 调用
- 从 ChatFunctionPanel props 中删除 dashboard 相关

- [ ] **Step 4: 修改 ChatFunctionPanel.vue — 删除 dashboard tab**

- 删除 dashboard tab button
- 删除 `AgentDashboardPanel` 导入和条件渲染
- 从 props 中删除 `dashboardTemplate` / `dashboardData` / `showDashboard`
- `activeTab` prop 类型改为 `"tools" | "preview"`

- [ ] **Step 5: 修改 agentChat.ts store — 删除 dashboardData**

- 删除 `dashboardData` ref
- 删除 `setDashboardData` 函数
- 从返回对象中删除两者

- [ ] **Step 6: 修改 agentChatIpc.ts — 删除 DASHBOARD_UPDATE 监听**

- 删除 `DashboardUpdateData` 类型
- 删除 `AGENT_EVENTS.DASHBOARD_UPDATE` 监听器代码块

- [ ] **Step 7: 从 events.ts 中删除 DASHBOARD_UPDATE**

将 AGENT_EVENTS 改为：

```typescript
export const AGENT_EVENTS = {
  CHANGED: "agent:changed",
} as const;
```

- [ ] **Step 8: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS（可能需要修复一些引用）

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(schedule): remove old MOSS dashboard and taskManager"
```

---

### Task 9: Pinia store（useScheduleStore）

**Files:**

- Create: `src/renderer/src/stores/schedule.ts`

- [ ] **Step 1: 实现 store**

```typescript
// src/renderer/src/stores/schedule.ts
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Task, TaskStatus, TimelineEntry, Note } from "@shared/types/schedule";

const ipc = window.electron.ipcRenderer;

export const useScheduleStore = defineStore("schedule", () => {
  const selectedDate = ref(new Date().toISOString().slice(0, 10));
  const tasks = ref<Task[]>([]);
  const timeline = ref<TimelineEntry[]>([]);
  const notes = ref<Note[]>([]);

  async function fetchTasks(): Promise<void> {
    tasks.value = (await ipc.invoke("task:getTasks")) as Task[];
  }

  async function fetchTimeline(): Promise<void> {
    timeline.value = (await ipc.invoke("task:getTimeline", selectedDate.value)) as TimelineEntry[];
  }

  async function fetchNotes(): Promise<void> {
    notes.value = (await ipc.invoke("task:getNotes", 50)) as Note[];
  }

  async function createTask(title: string, detail?: string): Promise<Task> {
    const task = (await ipc.invoke("task:createTask", title, detail)) as Task;
    await fetchTasks();
    return task;
  }

  async function updateTask(
    id: string,
    fields: { title?: string; detail?: string },
  ): Promise<void> {
    await ipc.invoke("task:updateTask", id, fields);
    await fetchTasks();
  }

  async function updateTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await ipc.invoke("task:updateTaskStatus", id, status);
    await fetchTasks();
    await fetchTimeline();
  }

  async function deleteTask(id: string): Promise<void> {
    await ipc.invoke("task:deleteTask", id);
    await fetchTasks();
  }

  async function addNote(content: string): Promise<void> {
    await ipc.invoke("task:addNote", content);
    await fetchNotes();
    await fetchTimeline();
  }

  async function deleteNote(id: number): Promise<void> {
    await ipc.invoke("task:deleteNote", id);
    await fetchNotes();
    await fetchTimeline();
  }

  async function addTimelineEntry(entry: {
    date: string;
    startTime: string;
    endTime?: string;
    content: string;
  }): Promise<void> {
    await ipc.invoke("task:addTimelineEntry", entry);
    await fetchTimeline();
  }

  async function removeTimelineEntry(id: number): Promise<void> {
    await ipc.invoke("task:removeTimelineEntry", id);
    await fetchTimeline();
  }

  // IPC event listeners
  function setupListeners(): () => void {
    const unsub1 = ipc.on("task:tasks-changed", () => {
      fetchTasks();
    });
    const unsub2 = ipc.on("task:timeline-changed", () => {
      fetchTimeline();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }

  // Watch selectedDate to refetch timeline
  watch(selectedDate, () => {
    fetchTimeline();
  });

  return {
    selectedDate,
    tasks,
    timeline,
    notes,
    fetchTasks,
    fetchTimeline,
    fetchNotes,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    addNote,
    deleteNote,
    addTimelineEntry,
    removeTimelineEntry,
    setupListeners,
  };
});
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/schedule.ts
git commit -m "feat(schedule): add useScheduleStore pinia store"
```

---

### Task 10: AppSidebar + App.vue 新增 schedule 视图

**Files:**

- Modify: `src/renderer/src/components/AppSidebar.vue`
- Modify: `src/renderer/src/App.vue`
- Create: `src/renderer/src/views/SchedulePanel.vue`（骨架）

- [ ] **Step 1: 修改 AppSidebar.vue**

在 chatroom 和 gateway 按钮之间添加 schedule 按钮，并更新类型：

```vue
<template>
  <div
    data-testid="app-sidebar"
    class="flex w-[45px] shrink-0 flex-col items-center bg-sidebar pt-2"
  >
    <button
      data-testid="sidebar-chatroom"
      :class="[
        'flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'chatroom'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="对话"
      @click="$emit('update:activeView', 'chatroom')"
    >
      <Icon icon="lucide:message-square" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-schedule"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'schedule'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="日程"
      @click="$emit('update:activeView', 'schedule')"
    >
      <Icon icon="lucide:calendar-check" class="h-5 w-5" />
    </button>

    <button
      data-testid="sidebar-gateway"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'gateway'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
      title="LLM 网关"
      @click="$emit('update:activeView', 'gateway')"
    >
      <Icon icon="lucide:network" class="h-5 w-5" />
    </button>

    <!-- EvoLab hidden in v0.3 -->
    <button
      v-if="false"
      data-testid="sidebar-evolab"
      :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'evolab' ? 'bg-muted' : 'hover:bg-muted/50',
      ]"
      title="进化实验室"
      @click="$emit('update:activeView', 'evolab')"
    >
      <!-- DNA SVG icon ... same as before ... -->
    </button>

    <div class="flex-1" />

    <button
      data-testid="sidebar-settings"
      class="mb-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      title="设置"
      @click="showSettings = true"
    >
      <!-- settings SVG ... same as before ... -->
    </button>

    <SettingsDialog v-model:open="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import SettingsDialog from "./settings/SettingsDialog.vue";

defineProps<{
  activeView: "chatroom" | "schedule" | "gateway" | "evolab";
}>();

defineEmits<{
  "update:activeView": [view: "chatroom" | "schedule" | "gateway" | "evolab"];
}>();

const showSettings = ref(false);
</script>
```

- [ ] **Step 2: 修改 App.vue**

在 script setup 中更新类型和导入：

```typescript
import SchedulePanel from "./views/SchedulePanel.vue";

const activeView = ref<"chatroom" | "schedule" | "gateway" | "evolab">("chatroom");
```

在 template 的视图切换区域添加：

```vue
<ChatroomPanel v-if="activeView === 'chatroom'" />
<SchedulePanel v-else-if="activeView === 'schedule'" />
<GatewayPanel v-else-if="activeView === 'gateway'" />
<EvolabPanel v-else-if="activeView === 'evolab'" />
```

- [ ] **Step 3: 创建 SchedulePanel.vue 骨架**

```vue
<!-- src/renderer/src/views/SchedulePanel.vue -->
<template>
  <div class="flex h-full">
    <!-- 左列 -->
    <div class="flex min-w-[400px] flex-1 flex-col">
      <div class="shrink-0 border-b border-border p-3">
        <!-- WeekCalendar placeholder -->
        <div class="text-sm text-muted-foreground">日历视图（待实现）</div>
      </div>
      <div class="flex-1 overflow-y-auto p-3">
        <!-- TaskBoard placeholder -->
        <div class="text-sm text-muted-foreground">任务看板（待实现）</div>
      </div>
      <div class="shrink-0 border-t border-border p-3">
        <!-- NoteInput placeholder -->
        <div class="text-sm text-muted-foreground">随笔输入（待实现）</div>
      </div>
    </div>
    <!-- 分割线 -->
    <div class="w-px bg-border" />
    <!-- 右列 -->
    <div class="w-[280px] shrink-0 overflow-y-auto p-3">
      <!-- TimelinePanel placeholder -->
      <div class="text-sm text-muted-foreground">时间线（待实现）</div>
    </div>
  </div>
</template>

<script setup lang="ts"></script>
```

- [ ] **Step 4: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AppSidebar.vue src/renderer/src/App.vue src/renderer/src/views/SchedulePanel.vue
git commit -m "feat(schedule): add schedule view to AppSidebar and App.vue"
```

---

### Task 11: WeekCalendar 组件

**Files:**

- Create: `src/renderer/src/components/schedule/WeekCalendar.vue`

- [ ] **Step 1: 实现 WeekCalendar**

```vue
<!-- src/renderer/src/components/schedule/WeekCalendar.vue -->
<template>
  <div class="flex items-center gap-2">
    <button
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="prevWeek"
    >
      <Icon icon="lucide:chevron-left" class="h-4 w-4" />
    </button>

    <div class="flex flex-1 justify-between">
      <button
        v-for="day in weekDays"
        :key="day.date"
        :class="[
          'flex w-9 flex-col items-center rounded-md py-1 text-xs',
          day.date === selectedDate
            ? 'bg-violet-500/20 text-violet-400'
            : day.isToday
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-muted/50',
        ]"
        @click="$emit('update:selectedDate', day.date)"
      >
        <span class="text-[10px]">{{ day.label }}</span>
        <span class="mt-0.5 font-medium">{{ day.dayNum }}</span>
      </button>
    </div>

    <button
      class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      @click="nextWeek"
    >
      <Icon icon="lucide:chevron-right" class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps<{ selectedDate: string }>();
const emit = defineEmits<{ "update:selectedDate": [date: string] }>();

const LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const weekOffset = ref(0);
const today = new Date().toISOString().slice(0, 10);

const weekDays = computed(() => {
  const base = new Date(today);
  // Monday of current week
  const dayOfWeek = base.getDay() || 7; // Sunday=7
  const monday = new Date(base);
  monday.setDate(base.getDate() - dayOfWeek + 1 + weekOffset.value * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      date,
      label: LABELS[i],
      dayNum: d.getDate(),
      isToday: date === today,
    };
  });
});

function prevWeek(): void {
  weekOffset.value -= 1;
  // Select same weekday in new week
  const idx = weekDays.value.findIndex((d) => d.date === props.selectedDate);
  if (idx < 0) emit("update:selectedDate", weekDays.value[0].date);
}

function nextWeek(): void {
  weekOffset.value += 1;
  const idx = weekDays.value.findIndex((d) => d.date === props.selectedDate);
  if (idx < 0) emit("update:selectedDate", weekDays.value[0].date);
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/schedule/WeekCalendar.vue
git commit -m "feat(schedule): implement WeekCalendar component"
```

---

### Task 12: TaskBoard + TaskGroup + TaskItem 组件

**Files:**

- Create: `src/renderer/src/components/schedule/TaskBoard.vue`
- Create: `src/renderer/src/components/schedule/TaskGroup.vue`
- Create: `src/renderer/src/components/schedule/TaskItem.vue`

- [ ] **Step 1: 实现 TaskItem.vue**

```vue
<!-- src/renderer/src/components/schedule/TaskItem.vue -->
<template>
  <button
    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50"
    @click="$emit('select', task.id)"
  >
    <div
      :class="[
        'h-2 w-2 shrink-0 rounded-full',
        task.status === 'todo'
          ? 'bg-slate-400'
          : task.status === 'in_progress'
            ? 'bg-amber-400'
            : task.status === 'done'
              ? 'bg-emerald-400'
              : 'bg-slate-600',
      ]"
    />
    <span
      :class="[
        'flex-1 truncate',
        task.status === 'cancelled' ? 'text-muted-foreground line-through' : '',
      ]"
      >{{ task.title }}</span
    >
  </button>
</template>

<script setup lang="ts">
import type { Task } from "@shared/types/schedule";

defineProps<{ task: Task }>();
defineEmits<{ select: [id: string] }>();
</script>
```

- [ ] **Step 2: 实现 TaskGroup.vue**

```vue
<!-- src/renderer/src/components/schedule/TaskGroup.vue -->
<template>
  <div class="mb-2">
    <button
      class="flex w-full items-center gap-1 px-1 py-1 text-xs font-medium uppercase tracking-wide"
      :class="colorClass"
      @click="collapsed = !collapsed"
    >
      <Icon :icon="collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'" class="h-3 w-3" />
      <span>{{ label }}</span>
      <span class="ml-1 text-muted-foreground">({{ tasks.length }})</span>
    </button>
    <div v-if="!collapsed" class="mt-0.5">
      <TaskItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        @select="$emit('selectTask', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import TaskItem from "./TaskItem.vue";
import type { Task } from "@shared/types/schedule";

const props = defineProps<{
  label: string;
  tasks: Task[];
  colorClass: string;
  defaultCollapsed?: boolean;
}>();

defineEmits<{ selectTask: [id: string] }>();

const collapsed = ref(props.defaultCollapsed ?? false);
</script>
```

- [ ] **Step 3: 实现 TaskBoard.vue**

```vue
<!-- src/renderer/src/components/schedule/TaskBoard.vue -->
<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">任务</h2>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="新建任务"
        @click="$emit('createTask')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <TaskGroup
      label="待办"
      color-class="text-slate-300"
      :tasks="todoTasks"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="进行中"
      color-class="text-amber-400"
      :tasks="inProgressTasks"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="已完成"
      color-class="text-emerald-400"
      :tasks="doneTasks"
      :default-collapsed="true"
      @select-task="$emit('selectTask', $event)"
    />
    <TaskGroup
      label="已取消"
      color-class="text-slate-500"
      :tasks="cancelledTasks"
      :default-collapsed="true"
      @select-task="$emit('selectTask', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import TaskGroup from "./TaskGroup.vue";
import type { Task } from "@shared/types/schedule";

const props = defineProps<{ tasks: Task[] }>();
defineEmits<{ selectTask: [id: string]; createTask: [] }>();

const todoTasks = computed(() => props.tasks.filter((t) => t.status === "todo"));
const inProgressTasks = computed(() => props.tasks.filter((t) => t.status === "in_progress"));
const doneTasks = computed(() => props.tasks.filter((t) => t.status === "done"));
const cancelledTasks = computed(() => props.tasks.filter((t) => t.status === "cancelled"));
</script>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/schedule/TaskBoard.vue src/renderer/src/components/schedule/TaskGroup.vue src/renderer/src/components/schedule/TaskItem.vue
git commit -m "feat(schedule): implement TaskBoard/TaskGroup/TaskItem components"
```

---

### Task 13: TimelinePanel + TimelineEntry 组件

**Files:**

- Create: `src/renderer/src/components/schedule/TimelinePanel.vue`
- Create: `src/renderer/src/components/schedule/TimelineEntry.vue`

- [ ] **Step 1: 实现 TimelineEntry.vue**

```vue
<!-- src/renderer/src/components/schedule/TimelineEntry.vue -->
<template>
  <div class="relative flex gap-2 pb-4">
    <!-- 时间轴线 -->
    <div class="flex w-12 shrink-0 flex-col items-end pt-0.5">
      <span class="text-[11px] text-muted-foreground">{{ entry.startTime }}</span>
      <span v-if="entry.endTime" class="text-[10px] text-muted-foreground/60">
        {{ entry.endTime }}
      </span>
    </div>
    <!-- 圆点 + 竖线 -->
    <div class="flex flex-col items-center">
      <div
        :class="[
          'mt-1.5 h-2 w-2 rounded-full',
          entry.source === 'task_auto'
            ? 'bg-violet-400'
            : entry.source === 'note'
              ? 'bg-emerald-400'
              : 'bg-slate-400',
        ]"
      />
      <div class="w-px flex-1 bg-border" />
    </div>
    <!-- 内容 -->
    <div class="flex-1 pt-0.5">
      <p class="text-sm text-foreground">{{ entry.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineEntry as TEntry } from "@shared/types/schedule";

defineProps<{ entry: TEntry }>();
</script>
```

- [ ] **Step 2: 实现 TimelinePanel.vue**

```vue
<!-- src/renderer/src/components/schedule/TimelinePanel.vue -->
<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-sm font-semibold text-foreground">时间线</h2>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
        title="添加条目"
        @click="$emit('addEntry')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
      </button>
    </div>

    <div v-if="entries.length === 0" class="flex-1 flex items-center justify-center">
      <p class="text-xs text-muted-foreground">今日暂无记录</p>
    </div>

    <div v-else class="flex-1 overflow-y-auto">
      <TimelineEntry v-for="entry in entries" :key="entry.id" :entry="entry" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import TimelineEntry from "./TimelineEntry.vue";
import type { TimelineEntry as TEntry } from "@shared/types/schedule";

defineProps<{ entries: TEntry[] }>();
defineEmits<{ addEntry: [] }>();
</script>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/schedule/TimelinePanel.vue src/renderer/src/components/schedule/TimelineEntry.vue
git commit -m "feat(schedule): implement TimelinePanel and TimelineEntry components"
```

---

### Task 14: NoteInput 组件

**Files:**

- Create: `src/renderer/src/components/schedule/NoteInput.vue`

- [ ] **Step 1: 实现 NoteInput.vue**

```vue
<!-- src/renderer/src/components/schedule/NoteInput.vue -->
<template>
  <div>
    <div class="mb-1 text-xs font-medium text-muted-foreground">随笔</div>
    <div class="flex gap-2">
      <input
        v-model="text"
        class="flex-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
        placeholder="记录一些想法..."
        @keydown.enter="submit"
      />
      <button
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
        :disabled="!text.trim()"
        @click="submit"
      >
        <Icon icon="lucide:send" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";

const emit = defineEmits<{ submit: [content: string] }>();

const text = ref("");

function submit(): void {
  const content = text.value.trim();
  if (!content) return;
  emit("submit", content);
  text.value = "";
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/schedule/NoteInput.vue
git commit -m "feat(schedule): implement NoteInput component"
```

---

### Task 15: TaskDetailDialog 组件

**Files:**

- Create: `src/renderer/src/components/schedule/TaskDetailDialog.vue`

- [ ] **Step 1: 实现 TaskDetailDialog.vue**

```vue
<!-- src/renderer/src/components/schedule/TaskDetailDialog.vue -->
<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="$emit('update:open', false)"
  >
    <div class="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between">
        <input
          v-model="title"
          class="flex-1 bg-transparent text-lg font-semibold text-foreground focus:outline-none"
          placeholder="任务标题"
          @blur="saveTitle"
        />
        <button
          class="ml-2 text-muted-foreground hover:text-foreground"
          @click="$emit('update:open', false)"
        >
          <Icon icon="lucide:x" class="h-5 w-5" />
        </button>
      </div>

      <!-- Status -->
      <div class="mb-4 flex gap-2">
        <button
          v-for="s in statuses"
          :key="s.value"
          :class="[
            'rounded-md px-2 py-1 text-xs',
            task?.status === s.value
              ? 'bg-violet-500/20 text-violet-400'
              : 'text-muted-foreground hover:bg-muted',
          ]"
          @click="changeStatus(s.value)"
        >
          {{ s.label }}
        </button>
      </div>

      <!-- Detail -->
      <div class="mb-4">
        <div class="mb-1 text-xs text-muted-foreground">详情</div>
        <textarea
          v-model="detail"
          class="w-full resize-none rounded-md border border-border bg-muted/30 p-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          rows="4"
          placeholder="Markdown 格式，支持链接和图片引用..."
          @blur="saveDetail"
        />
      </div>

      <!-- Attachments -->
      <div class="mb-4">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs text-muted-foreground">附件</span>
          <button class="text-xs text-violet-400 hover:text-violet-300" @click="pickFile">
            + 添加
          </button>
        </div>
        <div
          class="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <div v-if="attachments.length === 0">拖拽文件到此处，或点击"添加"</div>
          <div v-else class="space-y-1 text-left">
            <div
              v-for="att in attachments"
              :key="att.id"
              class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
            >
              <span class="truncate">{{ att.fileName }}</span>
              <button class="text-muted-foreground hover:text-red-400" @click="removeAtt(att.id)">
                <Icon icon="lucide:x" class="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Timestamps -->
      <div class="text-[11px] text-muted-foreground/60">
        创建于 {{ formatTime(task?.createdAt) }}
        <span v-if="task?.startedAt"> · 开始于 {{ formatTime(task.startedAt) }}</span>
        <span v-if="task?.finishedAt"> · 结束于 {{ formatTime(task.finishedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import type { Task, TaskStatus, TaskAttachment } from "@shared/types/schedule";

const ipc = window.electron.ipcRenderer;

const props = defineProps<{ open: boolean; taskId: string | null }>();
const emit = defineEmits<{ "update:open": [v: boolean]; changed: [] }>();

const task = ref<Task | null>(null);
const title = ref("");
const detail = ref("");
const attachments = ref<TaskAttachment[]>([]);

const statuses = [
  { value: "todo" as const, label: "待办" },
  { value: "in_progress" as const, label: "进行中" },
  { value: "done" as const, label: "已完成" },
  { value: "cancelled" as const, label: "已取消" },
];

watch(
  () => [props.open, props.taskId],
  async () => {
    if (!props.open || !props.taskId) return;
    const tasks = (await ipc.invoke("task:getTasks")) as Task[];
    task.value = tasks.find((t) => t.id === props.taskId) ?? null;
    title.value = task.value?.title ?? "";
    detail.value = task.value?.detail ?? "";
    attachments.value = (await ipc.invoke("task:getAttachments", props.taskId)) as TaskAttachment[];
  },
);

async function saveTitle(): Promise<void> {
  if (!props.taskId || title.value === task.value?.title) return;
  await ipc.invoke("task:updateTask", props.taskId, { title: title.value });
  emit("changed");
}

async function saveDetail(): Promise<void> {
  if (!props.taskId || detail.value === (task.value?.detail ?? "")) return;
  await ipc.invoke("task:updateTask", props.taskId, { detail: detail.value });
  emit("changed");
}

async function changeStatus(status: TaskStatus): Promise<void> {
  if (!props.taskId || status === task.value?.status) return;
  await ipc.invoke("task:updateTaskStatus", props.taskId, status);
  task.value = { ...task.value!, status };
  emit("changed");
}

async function pickFile(): Promise<void> {
  const input = document.createElement("input");
  input.type = "file";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || !props.taskId) return;
    const att = (await ipc.invoke("task:addAttachment", props.taskId, file.path)) as TaskAttachment;
    attachments.value.push(att);
  };
  input.click();
}

async function onDrop(e: DragEvent): Promise<void> {
  const files = e.dataTransfer?.files;
  if (!files || !props.taskId) return;
  for (const file of Array.from(files)) {
    const att = (await ipc.invoke("task:addAttachment", props.taskId, file.path)) as TaskAttachment;
    attachments.value.push(att);
  }
}

async function removeAtt(id: number): Promise<void> {
  await ipc.invoke("task:removeAttachment", id);
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function formatTime(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/schedule/TaskDetailDialog.vue
git commit -m "feat(schedule): implement TaskDetailDialog component"
```

---

### Task 16: TimelineAddDialog 组件

**Files:**

- Create: `src/renderer/src/components/schedule/TimelineAddDialog.vue`

- [ ] **Step 1: 实现 TimelineAddDialog.vue**

```vue
<!-- src/renderer/src/components/schedule/TimelineAddDialog.vue -->
<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="$emit('update:open', false)"
  >
    <div class="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl">
      <h3 class="mb-4 text-sm font-semibold text-foreground">添加时间线条目</h3>

      <div class="mb-3">
        <label class="mb-1 block text-xs text-muted-foreground">内容</label>
        <input
          v-model="content"
          class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          placeholder="做了什么..."
        />
      </div>

      <div class="mb-3 flex gap-3">
        <div class="flex-1">
          <label class="mb-1 block text-xs text-muted-foreground">开始时间</label>
          <input
            v-model="startTime"
            type="time"
            class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-xs text-muted-foreground">结束时间（可选）</label>
          <input
            v-model="endTime"
            type="time"
            class="w-full rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          @click="$emit('update:open', false)"
        >
          取消
        </button>
        <button
          class="rounded-md bg-violet-500/20 px-3 py-1.5 text-sm text-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
          :disabled="!content.trim() || !startTime"
          @click="submit"
        >
          添加
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ open: boolean; date: string }>();
const emit = defineEmits<{
  "update:open": [v: boolean];
  submit: [entry: { date: string; startTime: string; endTime?: string; content: string }];
}>();

const content = ref("");
const startTime = ref("");
const endTime = ref("");

function submit(): void {
  emit("submit", {
    date: props.date,
    startTime: startTime.value,
    endTime: endTime.value || undefined,
    content: content.value.trim(),
  });
  content.value = "";
  startTime.value = "";
  endTime.value = "";
  emit("update:open", false);
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/schedule/TimelineAddDialog.vue
git commit -m "feat(schedule): implement TimelineAddDialog component"
```

---

### Task 17: 组装 SchedulePanel

**Files:**

- Modify: `src/renderer/src/views/SchedulePanel.vue`

- [ ] **Step 1: 完整实现 SchedulePanel.vue**

```vue
<!-- src/renderer/src/views/SchedulePanel.vue -->
<template>
  <div class="flex h-full">
    <!-- 左列 -->
    <div class="flex min-w-[400px] flex-1 flex-col">
      <!-- 日历 -->
      <div class="shrink-0 border-b border-border px-4 py-3">
        <WeekCalendar v-model:selected-date="store.selectedDate" />
      </div>
      <!-- 任务看板 -->
      <div class="flex-1 overflow-y-auto px-4 py-3">
        <TaskBoard
          :tasks="store.tasks"
          @select-task="openTaskDetail"
          @create-task="createNewTask"
        />
      </div>
      <!-- 随笔 -->
      <div class="shrink-0 border-t border-border px-4 py-3">
        <NoteInput @submit="store.addNote" />
      </div>
    </div>
    <!-- 分割线 -->
    <div class="w-px bg-border" />
    <!-- 右列 -->
    <div class="w-[280px] shrink-0 overflow-y-auto px-3 py-3">
      <TimelinePanel :entries="store.timeline" @add-entry="showTimelineAdd = true" />
    </div>

    <!-- Dialogs -->
    <TaskDetailDialog
      v-model:open="showTaskDetail"
      :task-id="selectedTaskId"
      @changed="
        store.fetchTasks();
        store.fetchTimeline();
      "
    />
    <TimelineAddDialog
      v-model:open="showTimelineAdd"
      :date="store.selectedDate"
      @submit="store.addTimelineEntry"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import WeekCalendar from "@/components/schedule/WeekCalendar.vue";
import TaskBoard from "@/components/schedule/TaskBoard.vue";
import NoteInput from "@/components/schedule/NoteInput.vue";
import TimelinePanel from "@/components/schedule/TimelinePanel.vue";
import TaskDetailDialog from "@/components/schedule/TaskDetailDialog.vue";
import TimelineAddDialog from "@/components/schedule/TimelineAddDialog.vue";
import { useScheduleStore } from "@/stores/schedule";

const store = useScheduleStore();

const showTaskDetail = ref(false);
const selectedTaskId = ref<string | null>(null);
const showTimelineAdd = ref(false);

function openTaskDetail(id: string): void {
  selectedTaskId.value = id;
  showTaskDetail.value = true;
}

async function createNewTask(): Promise<void> {
  const task = await store.createTask("新任务");
  selectedTaskId.value = task.id;
  showTaskDetail.value = true;
}

let cleanupListeners: (() => void) | null = null;

onMounted(() => {
  store.fetchTasks();
  store.fetchTimeline();
  store.fetchNotes();
  cleanupListeners = store.setupListeners();
});

onUnmounted(() => {
  cleanupListeners?.();
});
</script>
```

- [ ] **Step 2: 验证类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/SchedulePanel.vue
git commit -m "feat(schedule): assemble SchedulePanel with all sub-components"
```

---

### Task 18: 格式化 + Lint + 最终验证

**Files:** 全部

- [ ] **Step 1: 格式化代码**

Run: `pnpm run format`

- [ ] **Step 2: Lint**

Run: `pnpm run lint`
Fix any issues.

- [ ] **Step 3: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: 运行全部测试**

Run: `pnpm test`
Expected: PASS（旧 taskManager 测试已删除，新 taskDao 测试应通过）

- [ ] **Step 5: Commit 修复**

```bash
git add -A
git commit -m "style: format and lint schedule feature"
```

---

### Task 19: 删除旧测试 + 构建 CLI

**Files:**

- Modify: `resources/slime-cli.js`（rebuild）

- [ ] **Step 1: 重新构建 CLI**

Run: `pnpm run build:cli`（如果项目有此命令）或手动构建 CLI bundle

- [ ] **Step 2: 验证 CLI 正常**

Run: `node resources/slime-cli.js task help`
Expected: 输出帮助文本（无 `archived` 状态）

- [ ] **Step 3: Commit**

```bash
git add resources/slime-cli.js
git commit -m "chore: rebuild slime-cli.js with new task data model"
```
