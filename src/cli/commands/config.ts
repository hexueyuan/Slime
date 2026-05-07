import type { CommandDef } from "../registry";

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

async function httpPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `config — 查询和修改 Slime 配置\n\n用法: slime-cli config <subcommand>\n\n子命令:\n  list              列出全部配置项\n  get <key>         查询单个配置项\n  set <key> <value> 修改配置项（仅白名单 key）\n\n可写入的 key:\n  obsidian.vaultPath\n  gateway.port\n\n示例:\n  slime-cli config list\n  slime-cli config get obsidian.vaultPath\n  slime-cli config set obsidian.vaultPath /Users/me/vault\n`,
    );
    return;
  }

  if (sub === "list") {
    const all = (await httpGet("/config")) as Record<string, unknown>;
    const entries = Object.entries(all);
    if (entries.length === 0) {
      process.stdout.write("(empty)\n");
    } else {
      for (const [k, v] of entries) {
        process.stdout.write(`${k}=${JSON.stringify(v)}\n`);
      }
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少 key\n\n用法: slime-cli config get <key>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    const result = (await httpGet(`/config/${rest[0]}`)) as { key: string; value: unknown };
    process.stdout.write(`${result.key}=${JSON.stringify(result.value)}\n`);
  } else if (sub === "set") {
    if (!rest[0]) {
      throw new Error(
        "缺少 key\n\n用法: slime-cli config set <key> <value>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    if (rest[1] === undefined) {
      throw new Error(
        "缺少 value\n\n用法: slime-cli config set <key> <value>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(rest[1]);
    } catch {
      value = rest[1];
    }
    const result = (await httpPut(`/config/${rest[0]}`, { value })) as {
      key: string;
      value: unknown;
    };
    process.stdout.write(`${result.key}=${JSON.stringify(result.value)}\n`);
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list | get | set\n\n运行 \`slime-cli help config\` 查看完整用法说明。`,
    );
  }
}

export const configCommand: CommandDef = {
  name: "config",
  description: "查询和修改 Slime 配置",
  detail: `config — 查询和修改 Slime 配置

用法:
  slime-cli config <subcommand>

子命令:
  list              列出全部配置项
  get <key>         查询单个配置项
  set <key> <value> 修改配置项（仅白名单 key）

可写入的 key:
  obsidian.vaultPath   Obsidian vault 目录路径
  gateway.port         LLM Gateway 端口号

value 解析规则:
  先尝试 JSON.parse，失败则作为字符串处理
  示例: set gateway.port 40000  → 数字 40000
        set obsidian.vaultPath /path/to/vault  → 字符串

示例:
  slime-cli config list
  slime-cli config get obsidian.vaultPath
  slime-cli config set obsidian.vaultPath /Users/me/vault
  slime-cli config set gateway.port 40000

  # ❌ 不可写的 key（报错: key is not writable）
  slime-cli config set app.onboarded true`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
