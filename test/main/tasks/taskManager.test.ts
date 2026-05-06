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
