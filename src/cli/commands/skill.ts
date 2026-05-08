import type { CommandDef } from "../registry";
import { getBaseUrl } from "../utils/baseUrl";

interface SkillItem {
  name: string;
  description: string;
  source: "builtin" | "market";
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `skill — 查看 Skill 列表\n\n用法: slime-cli skill <subcommand>\n\n子命令:\n  list          列出全部 skill\n\n示例:\n  slime-cli skill list\n`,
    );
    return;
  }

  if (sub === "list") {
    const skills = (await httpGet("/skills")) as SkillItem[];
    if (skills.length === 0) {
      process.stdout.write("(no skills)\n");
    } else {
      for (const s of skills) {
        process.stdout.write(`${s.name} (${s.source}) - ${s.description}\n`);
      }
    }
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list\n\n运行 \`slime-cli help skill\` 查看完整用法说明。`,
    );
  }
}

export const skillCommand: CommandDef = {
  name: "skill",
  description: "Skill 列表",
  detail: `skill — 查看 Skill 列表

用法:
  slime-cli skill <subcommand>

子命令:
  list          列出全部 skill（内置 + market）

list 输出格式:
  name (builtin|market) - description

示例:
  slime-cli skill list`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
