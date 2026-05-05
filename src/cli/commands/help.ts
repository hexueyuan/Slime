import type { CallerContext } from "../auth";
import type { CommandDef } from "../registry";
import { canAccess } from "../registry";

export function buildHelp(commands: CommandDef[], ctx: CallerContext): string {
  const visible = commands.filter((cmd) => canAccess(cmd, ctx));
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

export function runHelp(args: string[], ctx: CallerContext, commands: CommandDef[]): void {
  if (args.length === 0) {
    process.stdout.write(buildHelp(commands, ctx) + "\n");
    return;
  }

  const name = args[0];
  const cmd = commands.find((c) => c.name === name);
  if (!cmd || !canAccess(cmd, ctx)) {
    process.stdout.write(`Unknown command: ${name}\n`);
    process.exit(1);
  }

  process.stdout.write(cmd.detail + "\n");
}

export function makeHelpCommand(commands: CommandDef[]): CommandDef {
  return {
    name: "help",
    description: "显示帮助信息",
    detail: `用法: slime-cli help [command]

  slime-cli help            列出当前角色可用的全部命令
  slime-cli help <command>  显示指定命令的详细说明`,
    allowedRoles: ["user", "builtin-agent", "external-agent"],
    run: (args, ctx) => runHelp(args, ctx, commands),
  };
}
