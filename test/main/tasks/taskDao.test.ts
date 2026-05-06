import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as taskDao from "@/tasks/taskDao";
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
