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
  --creator-id <值>     [必填] 创建者 ID。user 填用户名，agent 填 agent ID
  --assignee-type <值>  [可选] 执行者身份。取值: user 或 agent
  --assignee-id <值>    [可选] 执行者 ID
  --scheduled-at <值>   [可选] 计划时间，Unix 毫秒时间戳
  --repeat <值>         [可选] 重复间隔（分钟）

状态值: todo | in_progress | done | cancelled

示例:
  # ✅ 用户创建任务
  slime-cli task add "修复Bug" --creator-type user --creator-id hexueyuan

  # ✅ Agent 自主创建
  slime-cli task add "巡检" --creator-type agent --creator-id hal-ai

  # ❌ 缺少 creator-id（报错）
  slime-cli task add "测试" --creator-type user
\n`,
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
        "--creator-type is required\n\n" +
          "取值: user（用户创建）或 agent（Agent 自主创建）\n" +
          '示例: slime-cli task add "任务标题" --creator-type user --creator-id <你的用户名>\n\n' +
          "运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    if (!creatorId) {
      throw new Error(
        "--creator-id is required\n\n" +
          `--creator-id 为创建者 ID。当前 --creator-type=${creatorType}，` +
          (creatorType === "user"
            ? "应填写用户名（如 hexueyuan）。"
            : "应填写 agent ID（如 hal-ai）。") +
          "\n" +
          `示例: slime-cli task add "任务标题" --creator-type ${creatorType} --creator-id <ID>\n\n` +
          "运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    if (creatorType !== "user" && creatorType !== "agent") {
      throw new Error(
        `--creator-type 值无效: '${creatorType}'\n\n` +
          "仅允许: user（用户创建）或 agent（Agent 自主创建）\n\n" +
          "运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    if (assigneeType && assigneeType !== "user" && assigneeType !== "agent") {
      throw new Error(
        `--assignee-type 值无效: '${assigneeType}'\n\n` +
          "仅允许: user 或 agent\n\n" +
          "运行 `slime-cli help task` 查看完整用法说明。",
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
    const titleParts: string[] = [];
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
        "任务标题不能为空\n\n" +
          '用法: slime-cli task add "任务标题" --creator-type <user|agent> --creator-id <ID>\n\n' +
          "运行 `slime-cli help task` 查看完整用法说明。",
      );
    }

    const body: Record<string, unknown> = { title, creatorType, creatorId };
    if (assigneeType) body.assigneeType = assigneeType;
    if (assigneeId) body.assigneeId = assigneeId;
    if (scheduledAtStr) body.scheduledAt = Number(scheduledAtStr);
    if (repeatStr) body.repeatInterval = Number(repeatStr);

    const task = (await httpRequest("POST", "/tasks", body)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "start") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task start <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/start`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "done") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task done <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/done`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "cancel") {
    if (!rest[0]) {
      throw new Error(
        "缺少任务 ID\n\n用法: slime-cli task cancel <id>\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const task = (await httpRequest("PATCH", `/tasks/${rest[0]}/cancel`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else if (sub === "list") {
    const statusIdx = rest.indexOf("--status");
    const status = statusIdx >= 0 ? rest[statusIdx + 1] : undefined;
    if (statusIdx >= 0 && !rest[statusIdx + 1]) {
      throw new Error(
        "--status 需要指定值\n\n取值: todo | in_progress | done | cancelled\n\n运行 `slime-cli help task` 查看完整用法说明。",
      );
    }
    const qs = status ? `?status=${status}` : "";
    const tasks = (await httpRequest("GET", `/tasks${qs}`)) as Task[];
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
    const task = (await httpRequest("GET", `/tasks/${rest[0]}`)) as Task;
    process.stdout.write(formatTask(task) + "\n");
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: add | start | done | cancel | list | get\n\n运行 \`slime-cli help task\` 查看完整用法说明。`,
    );
  }
}

export const taskCommand: CommandDef = {
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
  --creator-id <值>     [必填] 创建者 ID。若 creator-type=user 填用户名；若 creator-type=agent 填 agent ID
  --assignee-type <值>  [可选] 执行者身份。取值: user 或 agent
  --assignee-id <值>    [可选] 执行者 ID。同 creator-id 规则
  --scheduled-at <值>   [可选] 计划执行时间，Unix 毫秒时间戳
  --repeat <值>         [可选] 重复间隔（分钟）

状态值: todo | in_progress | done | cancelled

示例:
  # ✅ 用户创建任务
  slime-cli task add "修复登录Bug" --creator-type user --creator-id hexueyuan

  # ✅ Agent 自主创建任务
  slime-cli task add "每日巡检" --creator-type agent --creator-id hal-ai

  # ✅ 指定执行者和计划时间
  slime-cli task add "代码评审" --creator-type user --creator-id hexueyuan --assignee-type agent --assignee-id hal-ai --scheduled-at 1715100000000

  # ✅ 状态流转
  slime-cli task start 3
  slime-cli task done 3

  # ✅ 按状态筛选
  slime-cli task list --status todo

  # ❌ 缺少 --creator-id（报错: --creator-id is required）
  slime-cli task add "测试" --creator-type user

  # ❌ creator-type 值错误（报错: --creator-type must be 'user' or 'agent'）
  slime-cli task add "测试" --creator-type admin --creator-id foo`,
  allowedRoles: ["builtin-agent", "user"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
