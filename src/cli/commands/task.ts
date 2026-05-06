import type { CommandDef } from "../registry";
import type { Task } from "../../main/tasks/taskManager";

const STATUS_LABEL: Record<string, string> = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
  archived: "已归档",
};

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

function formatTask(t: Task): string {
  const parts = [
    `[${t.id}] ${t.description} [${STATUS_LABEL[t.status] ?? t.status}]`,
    `created:${t.createdAt}`,
  ];
  if (t.startedAt) parts.push(`started:${t.startedAt}`);
  if (t.completedAt) parts.push(`completed:${t.completedAt}`);
  if (t.cancelledAt) parts.push(`cancelledAt:${t.cancelledAt}`);
  if (t.archivedAt) parts.push(`archived:${t.archivedAt}`);
  return parts.join(" ");
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `task <subcommand> [args]
  add <描述>                   新增待办任务
  start <id>                   待办 → 进行中
  done <id>                    进行中 → 已完成
  cancel <id>                  任意状态 → 已取消
  list [--status <状态>]       列表查询（默认返回非归档任务）
  get <id>                     查询单个任务详情

状态值: todo | in_progress | done | cancelled | archived\n`,
    );
    return;
  }

  if (sub === "add") {
    const description = rest.join(" ").trim();
    if (!description) throw new Error("description is required");
    const task = (await httpRequest("POST", "/tasks", { description })) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/start`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/done`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
    const qs = status ? `?status=${status}` : "";
    const tasks = (await httpRequest("GET", `/tasks${qs}`)) as Task[];
    if (tasks.length === 0) {
      process.stdout.write("(no tasks)\n");
    } else {
      tasks.forEach((t) => process.stdout.write(formatTask(t) + "\n"));
    }
  } else if (sub === "get") {
    const task = (await httpRequest("GET", `/tasks/${rest[0]}`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(`unknown subcommand: ${sub}`);
  }
}

export const taskCommand: CommandDef = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消/已归档）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent"],
  allowedAgents: ["moss-ai"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
