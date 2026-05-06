import Fastify, { FastifyInstance } from "fastify";
import { TaskManager, TaskStatus } from "./taskManager";

export function createTaskServer(
  taskManager: TaskManager,
  onTasksChanged: () => void,
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.post<{ Body: { description: string } }>("/tasks", async (req, reply) => {
    const { description } = req.body;
    if (!description || typeof description !== "string") {
      return reply.status(400).send({ error: "description is required" });
    }
    const task = await taskManager.add(description);
    await taskManager.autoArchive();
    onTasksChanged();
    return reply.status(201).send(task);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id/start", async (req, reply) => {
    try {
      const task = await taskManager.start(req.params.id);
      await taskManager.autoArchive();
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
      const task = await taskManager.done(req.params.id);
      await taskManager.autoArchive();
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
      const task = await taskManager.cancel(req.params.id);
      await taskManager.autoArchive();
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
    const validStatuses: TaskStatus[] = ["todo", "in_progress", "done", "cancelled", "archived"];
    if (status && !validStatuses.includes(status)) {
      return reply.status(400).send({ error: `invalid status: ${status}` });
    }
    const tasks = await taskManager.list(status);
    return reply.send(tasks);
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const task = await taskManager.get(req.params.id);
    if (!task) return reply.status(404).send({ error: `task ${req.params.id} not found` });
    return reply.send(task);
  });

  return app;
}
