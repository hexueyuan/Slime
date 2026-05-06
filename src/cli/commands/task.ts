import type { CommandDef } from "../registry";

interface Task {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  creatorType: string;
  creatorId?: string;
  assigneeType: string;
  assigneeId?: string;
  scheduledAt?: number;
  repeatInterval?: number;
}

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

function formatTime(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

function formatTask(t: Task): string {
  const parts = [
    `[${t.id}] ${t.title} [${STATUS_LABEL[t.status] ?? t.status}]`,
    `creator:${t.creatorType}/${t.creatorId ?? "-"}`,
  ];
  if (t.assigneeId) parts.push(`assignee:${t.assigneeType}/${t.assigneeId}`);
  if (t.scheduledAt) parts.push(`scheduled:${formatTime(t.scheduledAt)}`);
  if (t.repeatInterval) parts.push(`repeat:${t.repeatInterval}min`);
  parts.push(`created:${formatTime(t.createdAt)}`);
  if (t.startedAt) parts.push(`started:${formatTime(t.startedAt)}`);
  if (t.finishedAt) parts.push(`finished:${formatTime(t.finishedAt)}`);
  return parts.join(" ");
}

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0) return undefined;
  return args[idx + 1];
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `task <subcommand> [args]
  add <描述> --creator-type <user|agent> --creator-id <id> [--assignee-type <user|agent>] [--assignee-id <id>] [--scheduled-at <timestamp_ms>] [--repeat <minutes>]
  start <id>                   待办 → 进行中
  done <id>                    进行中 → 已完成
  cancel <id>                  任意状态 → 已取消
  list [--status <状态>]       列表查询
  get <id>                     查询单个任务详情

状态值: todo | in_progress | done | cancelled\n`,
    );
    return;
  }

  if (sub === "add") {
    const creatorType = parseFlag(rest, "--creator-type");
    const creatorId = parseFlag(rest, "--creator-id");
    const assigneeType = parseFlag(rest, "--assignee-type");
    const assigneeId = parseFlag(rest, "--assignee-id");
    const scheduledAtStr = parseFlag(rest, "--scheduled-at");
    const repeatStr = parseFlag(rest, "--repeat");

    if (!creatorType) throw new Error("--creator-type is required (user|agent)");
    if (!creatorId) throw new Error("--creator-id is required");
    if (creatorType !== "user" && creatorType !== "agent") {
      throw new Error(`--creator-type must be 'user' or 'agent', got '${creatorType}'`);
    }
    if (assigneeType && assigneeType !== "user" && assigneeType !== "agent") {
      throw new Error(`--assignee-type must be 'user' or 'agent', got '${assigneeType}'`);
    }

    const flagNames = [
      "--creator-type",
      "--creator-id",
      "--assignee-type",
      "--assignee-id",
      "--scheduled-at",
      "--repeat",
    ];
    const titleParts: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      if (flagNames.includes(rest[i])) {
        i++;
        continue;
      }
      titleParts.push(rest[i]);
    }
    const title = titleParts.join(" ").trim();
    if (!title) throw new Error("title is required");

    const body: Record<string, unknown> = { title, creatorType, creatorId };
    if (assigneeType) body.assigneeType = assigneeType;
    if (assigneeId) body.assigneeId = assigneeId;
    if (scheduledAtStr) body.scheduledAt = Number(scheduledAtStr);
    if (repeatStr) body.repeatInterval = Number(repeatStr);

    const task = (await httpRequest("POST", "/tasks", body)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/start`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/done`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
    if (statusIdx >= 0 && !rest[statusIdx + 1]) throw new Error("--status requires a value");
    const qs = status ? `?status=${status}` : "";
    const tasks = (await httpRequest("GET", `/tasks${qs}`)) as Task[];
    if (tasks.length === 0) {
      process.stdout.write("(no tasks)\n");
    } else {
      tasks.forEach((t) => process.stdout.write(formatTask(t) + "\n"));
    }
  } else if (sub === "get") {
    if (!rest[0]) throw new Error("id is required");
    const task = (await httpRequest("GET", `/tasks/${rest[0]}`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(`unknown subcommand: ${sub}`);
  }
}

export const taskCommand: CommandDef = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent", "user"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
