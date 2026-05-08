import type { CommandDef } from "../registry";
import { getBaseUrl } from "../utils/baseUrl";

interface UserInfo {
  name: string;
  gender: "male" | "female" | "unknown";
  birthday: string | null;
  bio: string;
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

const genderLabel: Record<string, string> = { male: "男性", female: "女性", unknown: "保密" };

async function runAsync(args: string[]): Promise<void> {
  const [sub] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `user — 查看当前用户信息\n\n用法: slime-cli user <subcommand>\n\n子命令:\n  get           查看用户信息\n\nget 输出格式:\n  name: <名字>\n  gender: <性别>        （有则显示）\n  birthday: <生日>      （有则显示）\n  bio: <个人介绍>       （有则显示）\n\n示例:\n  slime-cli user get\n`,
    );
    return;
  }

  if (sub === "get") {
    const user = (await httpGet("/user")) as UserInfo;
    process.stdout.write(`name: ${user.name}\n`);
    if (user.gender && user.gender !== "unknown") {
      process.stdout.write(`gender: ${genderLabel[user.gender] ?? user.gender}\n`);
    }
    if (user.birthday) process.stdout.write(`birthday: ${user.birthday}\n`);
    if (user.bio) process.stdout.write(`bio: ${user.bio}\n`);
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: get\n\n运行 \`slime-cli help user\` 查看完整用法说明。`,
    );
  }
}

export const userCommand: CommandDef = {
  name: "user",
  description: "查看当前用户信息",
  detail: `user — 查看当前用户信息

用法:
  slime-cli user <subcommand>

子命令:
  get           查看用户名、性别、生日、个人介绍

get 输出格式:
  name: <名字>
  gender: <性别>        （有则显示）
  birthday: <生日>      （有则显示）
  bio: <个人介绍>       （有则显示）

示例:
  slime-cli user get`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
