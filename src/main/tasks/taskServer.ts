import Fastify, { FastifyInstance } from "fastify";
import type BetterSqlite3 from "better-sqlite3";
import * as taskDao from "./taskDao";
import { agentRegistry } from "../agents/agentRegistry";
import type { TaskStatus } from "@shared/types/schedule";
import type { UserProfile } from "@shared/types/agent";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { paths } from "@/utils/paths";
import { MBTI_MAP } from "@shared/constants/mbti";

interface ConfigStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<boolean>;
  readAll: () => Promise<Record<string, unknown>>;
}

interface SkillItem {
  name: string;
  description: string;
  source: "builtin" | "market";
}

function scanSkillDir(dir: string, source: "builtin" | "market"): SkillItem[] {
  if (!existsSync(dir)) return [];
  const items: SkillItem[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const mdPath = join(dir, entry, "SKILL.md");
    if (!existsSync(mdPath)) continue;
    let content: string;
    try {
      content = readFileSync(mdPath, "utf-8");
    } catch {
      continue;
    }
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const raw = match[1];
    let name = "";
    let description = "";
    for (const line of raw.split("\n")) {
      const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
      if (!kv) continue;
      if (kv[1] === "name") name = kv[2].trim();
      if (kv[1] === "description") description = kv[2].trim();
    }
    if (name && description) items.push({ name, description, source });
  }
  return items;
}

function msToHHmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function createTaskServer(
  db: BetterSqlite3.Database,
  onTasksChanged: () => void,
  configStore: ConfigStore,
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
      if (creatorId) creatorId = decodeURIComponent(creatorId);
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

  app.get("/agents", async (_req, reply) => {
    const agents = agentRegistry.list();
    const result = agents.map((a) => ({
      id: a.id,
      name: a.name,
      source: a.type === "builtin" ? "builtin" : "market",
      mbti: a.mbti,
      description: a.description,
      gender: a.gender,
      birthday: a.birthday,
    }));
    return reply.send(result);
  });

  app.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
    const agent = agentRegistry.getById(req.params.id);
    if (!agent) return reply.status(404).send({ error: `agent not found: ${req.params.id}` });
    const mbtiProfile = MBTI_MAP[agent.mbti];
    return reply.send({
      id: agent.id,
      name: agent.name,
      source: agent.type === "builtin" ? "builtin" : "market",
      mbti: agent.mbti,
      mbtiDescription: mbtiProfile?.personality ?? "",
      description: agent.description,
      gender: agent.gender,
      birthday: agent.birthday,
    });
  });

  app.get("/user", async (_req, reply) => {
    const profile = (await configStore.get("app.userProfile")) as UserProfile | null;
    return reply.send({
      name: profile?.name ?? "",
      gender: profile?.gender ?? "unknown",
      birthday: profile?.birthday ?? null,
      bio: profile?.bio ?? "",
    });
  });

  app.get("/skills", async (_req, reply) => {
    const builtin = scanSkillDir(paths.builtinSkillsDir, "builtin");
    const market = scanSkillDir(paths.marketSkillsDir, "market");
    return reply.send([...builtin, ...market]);
  });

  const CONFIG_WRITABLE_KEYS = ["obsidian.vaultPath", "gateway.port"];

  app.get("/config", async (_req, reply) => {
    const all = await configStore.readAll();
    return reply.send(all);
  });

  app.get<{ Params: { key: string } }>("/config/:key", async (req, reply) => {
    const value = await configStore.get(req.params.key);
    if (value === null || value === undefined) {
      return reply.status(404).send({ error: `config key not found: ${req.params.key}` });
    }
    return reply.send({ key: req.params.key, value });
  });

  app.put<{ Params: { key: string }; Body: { value: unknown } }>(
    "/config/:key",
    async (req, reply) => {
      const { key } = req.params;
      if (!CONFIG_WRITABLE_KEYS.includes(key)) {
        return reply.status(403).send({
          error: `key '${key}' is not writable. Allowed: ${CONFIG_WRITABLE_KEYS.join(", ")}`,
        });
      }
      const { value } = req.body;
      if (value === undefined) {
        return reply.status(400).send({ error: "value is required" });
      }
      const ok = await configStore.set(key, value);
      if (!ok) {
        return reply.status(503).send({ error: "config store unavailable" });
      }
      return reply.send({ key, value });
    },
  );

  return app;
}
