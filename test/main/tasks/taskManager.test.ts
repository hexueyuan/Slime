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

describe("serializeTask / parseTaskLine round-trip", () => {
  it("todo task round-trips correctly", async () => {
    const task = await tm.add("测试任务");
    const tasks = await tm.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(task.id);
    expect(tasks[0].description).toBe("测试任务");
    expect(tasks[0].status).toBe("todo");
  });

  it("list filters by status", async () => {
    await tm.add("任务A");
    await tm.add("任务B");
    const all = await tm.list();
    expect(all).toHaveLength(2);
    const todo = await tm.list("todo");
    expect(todo).toHaveLength(2);
    const inProg = await tm.list("in_progress");
    expect(inProg).toHaveLength(0);
  });
});

describe("TaskManager CRUD", () => {
  it("add creates a todo task", async () => {
    const task = await tm.add("写代码");
    expect(task.description).toBe("写代码");
    expect(task.status).toBe("todo");
    expect(task.id).toMatch(/^\d{17}$/);
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("get returns task by id", async () => {
    const added = await tm.add("测试任务");
    const got = await tm.get(added.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(added.id);
  });

  it("get returns null for unknown id", async () => {
    const got = await tm.get("00000000000000000");
    expect(got).toBeNull();
  });

  it("start transitions todo to in_progress", async () => {
    const t = await tm.add("任务");
    const updated = await tm.start(t.id);
    expect(updated.status).toBe("in_progress");
    expect(updated.startedAt).toBeDefined();
  });

  it("done transitions to done", async () => {
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

  it("throws on invalid transition: done -> start", async () => {
    const t = await tm.add("任务");
    await tm.start(t.id);
    await tm.done(t.id);
    await expect(tm.start(t.id)).rejects.toThrow("cannot transition");
  });

  it("done throws when already cancelled", async () => {
    const t = await tm.add("任务");
    await tm.cancel(t.id);
    await expect(tm.done(t.id)).rejects.toThrow("cannot transition");
  });

  it("cancel throws when already done", async () => {
    const t = await tm.add("任务");
    await tm.start(t.id);
    await tm.done(t.id);
    await expect(tm.cancel(t.id)).rejects.toThrow("cannot transition");
  });

  it("persists tasks across instances", async () => {
    await tm.add("持久化任务");
    const tm2 = new TaskManager(tasksFile);
    const tasks = await tm2.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("持久化任务");
  });
});

describe("TaskManager.autoArchive", () => {
  it("archives done tasks older than 7 days", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const oldDate = `${eightDaysAgo.getFullYear()}-${pad(eightDaysAgo.getMonth() + 1)}-${pad(eightDaysAgo.getDate())}T${pad(eightDaysAgo.getHours())}:${pad(eightDaysAgo.getMinutes())}:${pad(eightDaysAgo.getSeconds())}`;
    const content = `# 任务列表\n\n- [x] 旧任务 ✅ <!-- id:20250101120000000 created:2025-01-01T12:00:00 completed:${oldDate} -->\n`;
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const main = await tm.list();
    const archived = await tm.list("archived");
    expect(main).toHaveLength(0);
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("20250101120000000");
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
    const content = `# 任务列表\n\n- [x] 旧取消任务 ❌ <!-- id:20250102120000000 created:2025-01-02T12:00:00 cancelled:${oldDate} -->\n`;
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const archived = await tm.list("archived");
    expect(archived[0].id).toBe("20250102120000000");
  });

  it("sorts archived section by completedAt/cancelledAt ascending", async () => {
    const makeOldLine = (id: string, dateStr: string, emoji: string, field: string) =>
      `- [x] 任务${id} ${emoji} <!-- id:${id} created:2025-01-01T00:00:00 ${field}:${dateStr} -->`;
    const content = [
      "# 任务列表",
      "",
      makeOldLine("20250101000000001", "2025-01-10T00:00:00", "✅", "completed"),
      makeOldLine("20250101000000002", "2025-01-09T00:00:00", "✅", "completed"),
      "",
    ].join("\n");
    await writeFile(tasksFile, content, "utf-8");

    await tm.autoArchive();

    const archived = await tm.list("archived");
    expect(archived[0].id).toBe("20250101000000002");
    expect(archived[1].id).toBe("20250101000000001");
  });
});
