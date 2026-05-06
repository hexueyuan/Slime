import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
const VALID_ROLES = ["user", "builtin-agent", "external-agent"];
function getCallerContext() {
  const role = process.env.SLIME_ROLE;
  const userId = process.env.SLIME_USER_ID;
  const dataDir = process.env.SLIME_DATA_DIR;
  if (!role) throw new Error("SLIME_ROLE is not set. Run via Slime app or slime-cli wrapper.");
  if (!userId) throw new Error("SLIME_USER_ID is not set. Run via Slime app or slime-cli wrapper.");
  if (!dataDir)
    throw new Error("SLIME_DATA_DIR is not set. Run via Slime app or slime-cli wrapper.");
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid SLIME_ROLE: ${role}`);
  }
  return { role, userId, dataDir };
}
function canAccess(cmd, ctx) {
  if (!cmd.allowedRoles.includes(ctx.role)) return false;
  if (cmd.allowedAgents && !cmd.allowedAgents.includes(ctx.userId)) return false;
  return true;
}
function getTodayLogPath(dataDir) {
  const date = /* @__PURE__ */ new Date().toISOString().split("T")[0];
  return join(dataDir, "logs", `slime-${date}.log`);
}
function formatLogLine(raw) {
  try {
    const obj = JSON.parse(raw);
    const { timestamp, level, message, ...meta } = obj;
    const levelStr = `[${(level ?? "?").toUpperCase()}]`.padEnd(7);
    const metaStr = Object.keys(meta).length ? "  " + JSON.stringify(meta) : "";
    return `${levelStr} ${timestamp}  ${message}${metaStr}`;
  } catch {
    return raw;
  }
}
function readLogs(dataDir, opts) {
  const logsDir = join(dataDir, "logs");
  if (!existsSync(logsDir)) {
    throw new Error(`data directory not found: ${logsDir}`);
  }
  const logPath = getTodayLogPath(dataDir);
  if (!existsSync(logPath)) return [];
  const raw = readFileSync(logPath, "utf-8");
  let lines = raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map(formatLogLine);
  if (opts.key) {
    const lower = opts.key.toLowerCase();
    lines = lines.filter((l) => l.toLowerCase().includes(lower));
  }
  if (opts.tail !== void 0) {
    lines = lines.slice(-opts.tail);
  } else if (opts.head !== void 0) {
    lines = lines.slice(0, opts.head);
  }
  return lines;
}
function clearLogs(dataDir) {
  const logPath = getTodayLogPath(dataDir);
  if (!existsSync(logPath)) throw new Error("No logs found for today");
  writeFileSync(logPath, "");
  return logPath;
}
function parseLogsArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--key" && args[i + 1]) {
      result.key = args[++i];
    } else if (args[i] === "--tail" && args[i + 1]) {
      result.tail = parseInt(args[++i], 10);
    } else if (args[i] === "--head" && args[i + 1]) {
      result.head = parseInt(args[++i], 10);
    } else if (args[i] === "--clear") {
      result.clear = true;
    }
  }
  return result;
}
function runLogs(args, ctx) {
  const opts = parseLogsArgs(args);
  if (opts.head !== void 0 && opts.tail !== void 0) {
    process.stdout.write("Error: --head and --tail are mutually exclusive\n");
    process.exit(1);
  }
  if (opts.clear) {
    try {
      const path = clearLogs(ctx.dataDir);
      process.stdout.write(`Cleared: ${path}
`);
    } catch (err) {
      process.stdout.write(`Error: ${err instanceof Error ? err.message : String(err)}
`);
      process.exit(1);
    }
    return;
  }
  let lines;
  try {
    lines = readLogs(ctx.dataDir, { key: opts.key, tail: opts.tail, head: opts.head });
  } catch (err) {
    process.stdout.write(`Error: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
  if (lines.length === 0) {
    process.stdout.write("No logs found for today.\n");
    return;
  }
  process.stdout.write(lines.join("\n") + "\n");
}
const logsCommand = {
  name: "logs",
  description: "查看和管理 Slime 运行日志（仅限今日日志文件）",
  detail: `用法: slime-cli logs [options]

选项:
  --key <keyword>   关键词过滤（大小写不敏感，匹配日志消息和 meta 字段）
  --tail <n>        输出最后 n 行（与 --head 互斥）
  --head <n>        输出前 n 行（与 --tail 互斥）
  --clear           清空今日日志文件（保留文件，截断为空）

可组合使用: slime-cli logs --key error --tail 20
  先按关键词过滤，再取尾部 20 条。

示例:
  slime-cli logs                    # 输出今日全部日志
  slime-cli logs --key gateway      # 过滤包含 "gateway" 的日志
  slime-cli logs --tail 50          # 查看最后 50 条日志
  slime-cli logs --key error --tail 20  # 查看最后 20 条错误日志
  slime-cli logs --clear            # 清空今日日志`,
  allowedRoles: ["builtin-agent"],
  allowedAgents: ["hal-ai"],
  run: runLogs,
};
const STATUS_LABEL = {
  todo: "待办",
  in_progress: "进行中",
  done: "已完成",
  cancelled: "已取消",
};
function getBaseUrl() {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}
async function httpRequest(method, path, body) {
  const headers = {};
  if (body !== void 0) headers["Content-Type"] = "application/json";
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== void 0 ? JSON.stringify(body) : void 0,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}
function formatTime(ms) {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}
function formatTask(t) {
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
function parseFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx < 0) return void 0;
  return args[idx + 1];
}
async function runAsync(args) {
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

状态值: todo | in_progress | done | cancelled
`,
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
    const titleParts = [];
    for (let i = 0; i < rest.length; i++) {
      if (flagNames.includes(rest[i])) {
        i++;
        continue;
      }
      titleParts.push(rest[i]);
    }
    const title = titleParts.join(" ").trim();
    if (!title) throw new Error("title is required");
    const body = { title, creatorType, creatorId };
    if (assigneeType) body.assigneeType = assigneeType;
    if (assigneeId) body.assigneeId = assigneeId;
    if (scheduledAtStr) body.scheduledAt = Number(scheduledAtStr);
    if (repeatStr) body.repeatInterval = Number(repeatStr);
    const task = await httpRequest("POST", "/tasks", body);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    if (!rest[0]) throw new Error("id is required");
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/start`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    if (!rest[0]) throw new Error("id is required");
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/done`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    if (!rest[0]) throw new Error("id is required");
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : void 0;
    if (statusIdx >= 0 && !rest[statusIdx + 1]) throw new Error("--status requires a value");
    const qs = status ? `?status=${status}` : "";
    const tasks = await httpRequest("GET", `/tasks${qs}`);
    if (tasks.length === 0) {
      process.stdout.write("(no tasks)\n");
    } else {
      tasks.forEach((t) => process.stdout.write(formatTask(t) + "\n"));
    }
  } else if (sub === "get") {
    if (!rest[0]) throw new Error("id is required");
    const task = await httpRequest("GET", `/tasks/${rest[0]}`);
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(`unknown subcommand: ${sub}`);
  }
}
const taskCommand = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消）",
  detail: "task <subcommand> — add/start/done/cancel/list/get",
  allowedRoles: ["builtin-agent", "user"],
  run(args) {
    runAsync(args).catch((e) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}
`);
      process.exit(1);
    });
  },
};
function buildHelp(commands2, ctx) {
  const visible = commands2.filter((cmd) => canAccess(cmd, ctx));
  const lines = [
    "Slime CLI — Slime 应用管理工具",
    "",
    "用法: slime-cli <command> [options]",
    "",
    "命令:",
  ];
  for (const cmd of visible) {
    lines.push(`  ${cmd.name.padEnd(20)}${cmd.description}`);
  }
  lines.push("");
  lines.push("运行 `slime-cli help <command>` 查看命令详细说明。");
  return lines.join("\n");
}
function runHelp(args, ctx, commands2) {
  if (args.length === 0) {
    process.stdout.write(buildHelp(commands2, ctx) + "\n");
    return;
  }
  const name = args[0];
  const cmd = commands2.find((c) => c.name === name);
  if (!cmd || !canAccess(cmd, ctx)) {
    process.stdout.write(`Unknown command: ${name}
`);
    process.exit(1);
  }
  process.stdout.write(cmd.detail + "\n");
}
function makeHelpCommand(commands2) {
  return {
    name: "help",
    description: "显示帮助信息",
    detail: `用法: slime-cli help [command]

  slime-cli help            列出当前角色可用的全部命令
  slime-cli help <command>  显示指定命令的详细说明`,
    allowedRoles: ["user", "builtin-agent", "external-agent"],
    run: (args, ctx) => runHelp(args, ctx, commands2),
  };
}
const allCommands = [logsCommand, taskCommand];
const helpCommand = makeHelpCommand(allCommands);
const commands = [helpCommand, ...allCommands];
function main() {
  let ctx;
  try {
    ctx = getCallerContext();
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    helpCommand.run([], ctx);
    return;
  }
  const cmdName = args[0];
  const cmd = commands.find((c) => c.name === cmdName);
  if (!cmd || !canAccess(cmd, ctx)) {
    process.stderr.write(`Unknown command: ${cmdName}
`);
    process.exit(1);
  }
  cmd.run(args.slice(1), ctx);
}
main();
