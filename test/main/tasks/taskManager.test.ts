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
