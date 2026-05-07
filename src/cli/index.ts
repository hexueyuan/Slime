import { getCallerContext } from "./auth";
import { canAccess } from "./registry";
import { logsCommand } from "./commands/logs";
import { taskCommand } from "./commands/task";
import { makeHelpCommand } from "./commands/help";
import { agentCommand } from "./commands/agent";

const allCommands = [logsCommand, taskCommand, agentCommand];
const helpCommand = makeHelpCommand(allCommands);
const commands = [helpCommand, ...allCommands];

function main(): void {
  let ctx;
  try {
    ctx = getCallerContext();
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const args = process.argv.slice(2);

  // No args or --help → help
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    helpCommand.run([], ctx);
    return;
  }

  const cmdName = args[0];
  const cmd = commands.find((c) => c.name === cmdName);

  if (!cmd || !canAccess(cmd, ctx)) {
    process.stderr.write(
      `Error: 未知命令 '${cmdName}'\n\n运行 \`slime-cli help\` 查看当前可用命令列表。\n`,
    );
    process.exit(1);
  }

  cmd.run(args.slice(1), ctx);
}

main();
