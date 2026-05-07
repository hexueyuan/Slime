import { readLogs, clearLogs } from "../utils/logReader";
import type { CallerContext } from "../auth";
import type { CommandDef } from "../registry";

function parseLogsArgs(args: string[]): {
  key?: string;
  tail?: number;
  head?: number;
  clear?: boolean;
} {
  const result: { key?: string; tail?: number; head?: number; clear?: boolean } = {};
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

export function runLogs(args: string[], ctx: CallerContext): void {
  const opts = parseLogsArgs(args);

  if (opts.head !== undefined && opts.tail !== undefined) {
    process.stdout.write(
      "Error: --head 和 --tail 不能同时使用\n\n" +
        "两者互斥：--head 取前 N 行，--tail 取后 N 行，只能选一个。\n\n" +
        "运行 `slime-cli help logs` 查看完整用法说明。\n",
    );
    process.exit(1);
  }

  if (opts.clear) {
    try {
      const path = clearLogs(ctx.dataDir);
      process.stdout.write(`Cleared: ${path}\n`);
    } catch (err) {
      process.stdout.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    return;
  }

  let lines: string[];
  try {
    lines = readLogs(ctx.dataDir, { key: opts.key, tail: opts.tail, head: opts.head });
  } catch (err) {
    process.stdout.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  if (lines.length === 0) {
    process.stdout.write("No logs found for today.\n");
    return;
  }
  process.stdout.write(lines.join("\n") + "\n");
}

export const logsCommand: CommandDef = {
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
