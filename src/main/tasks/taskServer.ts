import Fastify, { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import * as taskDao from "./taskDao";
import { agentRegistry } from "../agents/agentRegistry";
import type { TaskStatus } from "@shared/types/schedule";

function msToHHmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function createTaskServer(
  db: BetterSqlite3.Database,
  onTasksChanged: () => void,
): FastifyInstance {
  const app = Fastify({ logger: false });

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

    // creatorType 枚举校验
    const creatorType = req.body.creatorType ?? "user";
    if (creatorType !== "user" && creatorType !== "agent") {
      return reply.status(400).send({ error: `invalid creatorType: ${creatorType}` });
    }

    // creatorId 校验
    let creatorId: string | undefined;
    if (creatorType === "user") {
      creatorId = req.headers["x-slime-user-id"] as string | undefined;
      if (!creatorId) {
        return reply.status(400).send({ error: "missing X-Slime-User-Id header for user creator" });
      }
    } else {
      creatorId = req.body.creatorId;
      if (!creatorId) {
        return reply.status(400).send({ error: "creatorId is required when creatorType=agent" });
      }
      if (!agentRegistry.getById(creatorId)) {
        return reply.status(400).send({ error: `agent not found: ${creatorId}` });
      }
    }

    // assigneeType 枚举校验
    const assigneeType = req.body.assigneeType ?? "user";
    if (assigneeType !== "user" && assigneeType !== "agent") {
      return reply.status(400).send({ error: `invalid assigneeType: ${assigneeType}` });
    }

    // assigneeId 校验
    let assigneeId: string | undefined;
    if (req.body.assigneeId || req.body.assigneeType) {
      if (assigneeType === "user") {
        assigneeId = req.body.assigneeId;
      } else {
        assigneeId = req.body.assigneeId;
        if (!assigneeId) {
          return reply
            .status(400)
            .send({ error: "assigneeId is required when assigneeType=agent" });
        }
        if (!agentRegistry.getById(assigneeId)) {
          return reply.status(400).send({ error: `assignee agent not found: ${assigneeId}` });
        }
      }
    }

    // scheduledAt 校验
    if (req.body.scheduledAt !== undefined) {
      if (typeof req.body.scheduledAt !== "number" || !Number.isInteger(req.body.scheduledAt)) {
        return reply.status(400).send({ error: "scheduledAt must be an integer (ms timestamp)" });
      }
      if (req.body.scheduledAt <= Date.now()) {
        return reply.status(400).send({ error: "scheduledAt must be in the future" });
      }
    }

    // repeatInterval 校验
    if (req.body.repeatInterval !== undefined) {
      if (
        typeof req.body.repeatInterval !== "number" ||
        !Number.isInteger(req.body.repeatInterval) ||
        req.body.repeatInterval <= 0
      ) {
        return reply
          .status(400)
          .send({ error: "repeatInterval must be a positive integer (minutes)" });
      }
      if (req.body.repeatInterval > 525600) {
        return reply
          .status(400)
          .send({ error: "repeatInterval exceeds maximum (525600 minutes = 1 year)" });
      }
    }

    const task = taskDao.createTask(db, {
      title,
      creatorType,
      creatorId,
      assigneeType,
      assigneeId,
      scheduledAt: req.body.scheduledAt,
      repeatInterval: req.body.repeatInterval,
    });
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
      const closed = taskDao.finishTaskAutoTimeline(db, task.id);
      if (!closed) {
        const startTime = msToHHmm(task.startedAt ?? task.createdAt);
        taskDao.addTaskAutoTimeline(db, task.id, `完成: ${task.title}`, {
          startTime,
          endTime: msToHHmm(Date.now()),
        });
      }
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
      const closed = taskDao.finishTaskAutoTimeline(db, task.id);
      if (!closed) {
        const startTime = msToHHmm(task.startedAt ?? task.createdAt);
        taskDao.addTaskAutoTimeline(db, task.id, `取消: ${task.title}`, {
          startTime,
          endTime: msToHHmm(Date.now()),
        });
      }
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
