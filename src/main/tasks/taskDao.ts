import type BetterSqlite3 from "better-sqlite3";
import type {
  Task,
  TaskStatus,
  TaskAttachment,
  TimelineEntry,
  TimelineSource,
  Note,
  ActorType,
} from "@shared/types/schedule";

let _idCounter = 0;

function makeId(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  _idCounter = (_idCounter + 1) % 1000;
  const suffix = pad(_idCounter, 3);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${suffix}`;
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
  creator_type: string;
  creator_id: string | null;
  assignee_type: string;
  assignee_id: string | null;
  scheduled_at: number | null;
  repeat_interval: number | null;
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
    creatorType: row.creator_type as ActorType,
    creatorId: row.creator_id ?? undefined,
    assigneeType: row.assignee_type as ActorType,
    assigneeId: row.assignee_id ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined,
    repeatInterval: row.repeat_interval ?? undefined,
  };
}

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
  opts?: { startTime?: string; endTime?: string },
): TimelineEntry {
  return addTimelineEntry(db, {
    date: todayDate(),
    startTime: opts?.startTime ?? nowHHmm(),
    endTime: opts?.endTime,
    content,
    source: "task_auto",
    sourceId: taskId,
  });
}

export function finishTaskAutoTimeline(db: BetterSqlite3.Database, taskId: string): boolean {
  const row = db
    .prepare(
      "SELECT * FROM timeline_entries WHERE source = 'task_auto' AND source_id = ? AND end_time IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .get(taskId) as TimelineRow | undefined;
  if (row) {
    db.prepare("UPDATE timeline_entries SET end_time = ? WHERE id = ?").run(nowHHmm(), row.id);
    return true;
  }
  return false;
}
