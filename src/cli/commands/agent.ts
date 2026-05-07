import type { CommandDef } from "../registry";

interface AgentListItem {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
}

interface AgentDetail {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
  mbtiDescription: string;
  description?: string;
}

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `agent — 查看 Agent 列表和详情\n\n用法: slime-cli agent <subcommand>\n\n子命令:\n  list          列出全部 agent\n  get <id>      查看指定 agent 详情\n\n示例:\n  slime-cli agent list\n  slime-cli agent get hal-ai\n`,
    );
    return;
  }

  if (sub === "list") {
    const agents = (await httpGet("/agents")) as AgentListItem[];
    if (agents.length === 0) {
      process.stdout.write("(no agents)\n");
    } else {
      for (const a of agents) {
        process.stdout.write(`[${a.id}] ${a.name} (${a.source}) ${a.mbti}\n`);
      }
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少 agent ID\n\n用法: slime-cli agent get <id>\n\n运行 `slime-cli help agent` 查看完整用法说明。",
      );
    }
    const agent = (await httpGet(`/agents/${rest[0]}`)) as AgentDetail;
    process.stdout.write(`name: ${agent.name}\n`);
    process.stdout.write(`mbti: ${agent.mbti} — ${agent.mbtiDescription}\n`);
    process.stdout.write(`description: ${agent.description ?? ""}\n`);
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list | get\n\n运行 \`slime-cli help agent\` 查看完整用法说明。`,
    );
  }
}

export const agentCommand: CommandDef = {
  name: "agent",
  description: "Agent 列表与详情",
  detail: `agent — 查看 Agent 列表和详情

用法:
  slime-cli agent <subcommand>

子命令:
  list          列出全部 agent（内置 + market）
  get <id>      查看指定 agent 的名字、MBTI、描述

list 输出格式:
  [id] name (builtin|market) MBTI

get 输出格式:
  name: <名字>
  mbti: <类型> — <性格描述>
  description: <描述>

示例:
  slime-cli agent list
  slime-cli agent get hal-ai`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
