import type { CommandDef } from "../registry";
import { getBaseUrl } from "../utils/baseUrl";

interface AgentListItem {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
  description?: string;
  gender?: "male" | "female" | "unknown";
  birthday?: string;
}

interface AgentDetail {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
  mbtiDescription: string;
  description?: string;
  gender?: "male" | "female" | "unknown";
  birthday?: string;
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
      `agent — 查看 Agent 列表和详情\n\n用法: slime-cli agent <subcommand>\n\n子命令:\n  list          列出全部 agent\n  get <id>      查看指定 agent 详情\n\nlist 输出格式:\n  [id] 名字 (builtin|market) MBTI [性别] [生日] - 简介\n  id   — agent 唯一标识，用于 get 子命令\n  名字 — agent 的显示名称\n\nget 输出格式:\n  name: <名字>\n  mbti: <类型> — <性格描述>\n  gender: <性别>        （有则显示）\n  birthday: <生日>      （有则显示）\n  description: <描述>\n\n示例:\n  slime-cli agent list\n  slime-cli agent get hal-ai\n`,
    );
    return;
  }

  if (sub === "list") {
    const agents = (await httpGet("/agents")) as AgentListItem[];
    if (agents.length === 0) {
      process.stdout.write("(no agents)\n");
    } else {
      const genderLabel: Record<string, string> = { male: "男性", female: "女性" };
      for (const a of agents) {
        const extra = [
          a.gender && a.gender !== "unknown" ? genderLabel[a.gender] : "",
          a.birthday ?? "",
        ]
          .filter(Boolean)
          .join(" ");
        process.stdout.write(
          `[${a.id}] ${a.name} (${a.source}) ${a.mbti}${extra ? " " + extra : ""} - ${a.description ?? ""}\n`,
        );
      }
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少 agent ID\n\n用法: slime-cli agent get <id>\n\n运行 `slime-cli help agent` 查看完整用法说明。",
      );
    }
    const agent = (await httpGet(`/agents/${rest[0]}`)) as AgentDetail;
    const genderLabel: Record<string, string> = { male: "男性", female: "女性", unknown: "未知" };
    process.stdout.write(`name: ${agent.name}\n`);
    process.stdout.write(`mbti: ${agent.mbti} — ${agent.mbtiDescription}\n`);
    if (agent.gender)
      process.stdout.write(`gender: ${genderLabel[agent.gender] ?? agent.gender}\n`);
    if (agent.birthday) process.stdout.write(`birthday: ${agent.birthday}\n`);
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
  get <id>      查看指定 agent 的名字、MBTI、性别、生日、描述

list 输出格式:
  [id] 名字 (builtin|market) MBTI [性别] [生日] - 简介
  id   — agent 唯一标识，用于 get 子命令
  名字 — agent 的显示名称

get 输出格式:
  name: <名字>
  mbti: <类型> — <性格描述>
  gender: <性别>        （有则显示）
  birthday: <生日>      （有则显示）
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
