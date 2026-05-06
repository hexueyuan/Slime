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
