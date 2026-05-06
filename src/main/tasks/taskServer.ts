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
    const title = req.body.title ?? req.body.description;
    if (!title || typeof title !== "string") {
      return reply.status(400).send({ error: "title is required" });
    }
    const task = taskDao.createTask(db, { title });
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
