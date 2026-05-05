import { getCallerContext } from "./auth";
import { canAccess } from "./registry";
import { logsCommand } from "./commands/logs";
import { makeHelpCommand } from "./commands/help";

const allCommands = [logsCommand];
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

  // No args → help
  if (args.length === 0) {
    helpCommand.run([], ctx);
    return;
  }

  const cmdName = args[0];
  const cmd = commands.find((c) => c.name === cmdName);

  if (!cmd || !canAccess(cmd, ctx)) {
    process.stderr.write(`Unknown command: ${cmdName}\n`);
    process.exit(1);
  }

  cmd.run(args.slice(1), ctx);
}

main();
