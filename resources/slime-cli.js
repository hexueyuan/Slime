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
  if (cmd.allowedAgents && ctx.role === "builtin-agent") {
    if (!cmd.allowedAgents.includes(ctx.userId)) return false;
  }
  const allowed = process.env.SLIME_ALLOWED_COMMANDS;
  if (allowed !== void 0) {
    const list = allowed.split(",").map((s) => s.trim());
    if (!list.includes(cmd.name)) return false;
  }
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
    process.stdout.write(
      "Error: --head 和 --tail 不能同时使用\n\n两者互斥：--head 取前 N 行，--tail 取后 N 行，只能选一个。\n\n运行 `slime-cli help logs` 查看完整用法说明。\n",
    );
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
  detail: `logs — 查看和管理 Slime 应用运行日志（仅今日日志）

用法: slime-cli logs [选项]

选项:
  --key <关键词>   按关键词过滤（大小写不敏感，匹配日志消息和 meta 字段）
  --tail <n>       输出最后 n 行（与 --head 互斥）
  --head <n>       输出前 n 行（与 --tail 互斥）
  --clear          清空今日日志文件（保留文件，截断为空）

说明:
  日志文件路径: {dataDir}/logs/slime-YYYY-MM-DD.log
  选项可组合: 先按 --key 过滤，再按 --tail/--head 截取

示例:
  # ✅ 查看全部今日日志
  slime-cli logs

  # ✅ 过滤包含 "gateway" 的日志
  slime-cli logs --key gateway

  # ✅ 查看最后 50 条
  slime-cli logs --tail 50

  # ✅ 组合使用：过滤后取最后 20 条
  slime-cli logs --key error --tail 20

  # ✅ 清空今日日志
  slime-cli logs --clear

  # ❌ --head 和 --tail 不能同时用（报错）
  slime-cli logs --head 10 --tail 10`,
  allowedRoles: ["builtin-agent", "user"],
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
  const userId = process.env["SLIME_USER_ID"];
  if (userId) headers["X-Slime-User-Id"] = userId;
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
      `task — 创建和管理待办任务

用法: slime-cli task <subcommand> [参数]

子命令:
  add <标题> [选项]      创建新任务
  start <id>            待办 → 进行中
  done <id>             进行中 → 已完成
  cancel <id>           任意状态 → 已取消
  list [--status <值>]  列出任务（可按状态过滤）
  get <id>              查看任务详情

add 选项:
  --creator-type <值>   [必填] 创建者身份。取值: user（用户创建）或 agent（Agent 自主创建）
  --creator-id <值>     [agent必填] 创建者 ID。agent 填 agent ID；user 时可省略（从环境获取）
  --assignee-type <值>  [可选] 执行者身份。取值: user 或 agent
  --assignee-id <值>    [可选] 执行者 ID（assignee-type=agent 时必填）
  --scheduled-at <值>   [可选] 计划时间，Unix 毫秒时间戳（必须为未来时间）
  --repeat <值>         [可选] 重复间隔（分钟，上限 525600）

状态值: todo | in_progress | done | cancelled

示例:
  # ✅ 用户创建任务（自动从环境获取用户ID）
  slime-cli task add "修复Bug" --creator-type user

  # ✅ Agent 自主创建
  slime-cli task add "巡检" --creator-type agent --creator-id hal-ai

  # ❌ agent 缺少 creator-id（报错）
  slime-cli task add "测试" --creator-type agent

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
    if (!creatorType) {
      throw new Error(
        '--creator-type is required\n\n取值: user（用户创建）或 agent（Agent 自主创建）\n示例: slime-cli task add "任务标题" --creator-type user --creator-id <你的用户名>\n\n运行 `slime-cli help task` 查看完整用法说明。',
      );
    }
    if (creatorType !== "user" && creatorType !== "agent") {
      throw new Error(
        `--creator-type 值无效: '${creatorType}'

仅允许: user（用户创建）或 agent（Agent 自主创建）

运行 \`slime-cli help task\` 查看完整用法说明。`,
      );
    }
    if (creatorType === "agent" && !creatorId) {
      throw new Error(
        `--creator-id is required when --creator-type=agent

应填写 agent ID（如 hal-ai）。
示例: slime-cli task add "任务标题" --creator-type agent --creator-id <agent-id>

运行 \`slime-cli help task\` 查看完整用法说明。`,
      );
    }
    if (assigneeType && assigneeType !== "user" && assigneeType !== "agent") {
      throw new Error(
        `--assignee-type 值无效: '${assigneeType}'

仅允许: user 或 agent

运行 \`slime-cli help task\` 查看完整用法说明。`,
      );
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
    if (!title) {
      throw new Error(
        '任务标题不能为空\n\n用法: slime-cli task add "任务标题" --creator-type <user|agent> --creator-id <ID>\n\n运行 `slime-cli help task` 查看完整用法说明。',
      );
    }
    const body = { title, creatorType };
    if (creatorId) body.creatorId = creatorId;
    if (assigneeType) body.assigneeType = assigneeType;
    if (assigneeId) body.assigneeId = assigneeId;
    if (scheduledAtStr) {
      const n = Number(scheduledAtStr);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--scheduled-at 必须为正整数（Unix 毫秒时间戳）");
      }
      if (n <= Date.now()) {
        throw new Error("--scheduled-at 必须为未来时间");
      }
      body.scheduledAt = n;
    }
    if (repeatStr) {
      const n = Number(repeatStr);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--repeat 必须为正整数（分钟）");
      }
      if (n > 525600) {
        throw new Error("--repeat 不能超过 525600 分钟（1年）");
      }
      body.repeatInterval = n;
    }
    const task = await httpRequest("POST", "/tasks", body);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task start <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/start`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task done <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/done`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task cancel <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`);
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : void 0;
    if (statusIdx >= 0 && !rest[statusIdx + 1]) {
      throw new Error(
        "--status 需要指定值\n\n取值: todo | in_progress | done | cancelled\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const qs = status ? `?status=${status}` : "";
    const tasks = await httpRequest("GET", `/tasks${qs}`);
    if (tasks.length === 0) {
      process.stdout.write("(no tasks)\n");
    } else {
      tasks.forEach((t) => process.stdout.write(formatTask(t) + "\n"));
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task get <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = await httpRequest("GET", `/tasks/${rest[0]}`);
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(
      `未知子命令: ${sub}

可用子命令: add | start | done | cancel | list | get

运行 \`slime-cli help task\` 查看完整用法说明。`,
    );
  }
}
const taskCommand = {
  name: "task",
  description: "任务管理（待办/进行中/已完成/已取消）",
  detail: `task — 创建和管理待办任务

用法:
  slime-cli task <subcommand> [参数]

子命令:
  add <标题> [选项]      创建新任务
  start <id>            将任务状态设为"进行中"
  done <id>             将任务状态设为"已完成"
  cancel <id>           将任务状态设为"已取消"
  list [--status <值>]  列出任务（可按状态过滤）
  get <id>              查看任务详情

add 选项:
  --creator-type <值>   [必填] 创建者身份。取值: user（用户创建）或 agent（Agent 自主创建）
  --creator-id <值>     [agent必填] 创建者 ID。agent 填 agent ID；user 时可省略（从环境获取）
  --assignee-type <值>  [可选] 执行者身份。取值: user 或 agent
  --assignee-id <值>    [可选] 执行者 ID（assignee-type=agent 时必填）
  --scheduled-at <值>   [可选] 计划执行时间，Unix 毫秒时间戳（必须为未来时间）
  --repeat <值>         [可选] 重复间隔（分钟，上限 525600）

状态值: todo | in_progress | done | cancelled

示例:
  # ✅ 用户创建任务（自动从环境获取用户ID）
  slime-cli task add "修复登录Bug" --creator-type user

  # ✅ Agent 自主创建任务
  slime-cli task add "每日巡检" --creator-type agent --creator-id hal-ai

  # ✅ 指定执行者和计划时间
  slime-cli task add "代码评审" --creator-type user --assignee-type agent --assignee-id hal-ai --scheduled-at 1715100000000

  # ✅ 状态流转
  slime-cli task start 3
  slime-cli task done 3

  # ✅ 按状态筛选
  slime-cli task list --status todo

  # ❌ agent 缺少 --creator-id（报错: --creator-id is required when --creator-type=agent）
  slime-cli task add "测试" --creator-type agent

  # ❌ creator-type 值错误（报错: --creator-type 值无效）
  slime-cli task add "测试" --creator-type admin --creator-id foo`,
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
    process.stdout.write(
      `Error: 未知命令 '${name}'

运行 \`slime-cli help\` 查看当前可用命令列表。
`,
    );
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
    process.stderr.write(
      `Error: 未知命令 '${cmdName}'

运行 \`slime-cli help\` 查看当前可用命令列表。
`,
    );
    process.exit(1);
  }
  cmd.run(args.slice(1), ctx);
}
main();
