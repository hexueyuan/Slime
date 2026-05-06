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
    process.stdout.write("Error: --head and --tail are mutually exclusive\n");
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
  run: runLogs,
};
