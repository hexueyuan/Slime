import type { CallerContext, Role } from "./auth";

export interface CommandDef {
  name: string;
  description: string;
  detail: string;
  allowedRoles: Role[];
  run: (args: string[], ctx: CallerContext) => void;
}

export function canAccess(cmd: CommandDef, ctx: CallerContext): boolean {
  if (!cmd.allowedRoles.includes(ctx.role)) return false;
  // SLIME_ALLOWED_COMMANDS whitelist from agent config
  const allowed = process.env.SLIME_ALLOWED_COMMANDS;
  if (allowed !== undefined) {
    const list = allowed.split(",").map((s) => s.trim());
    if (!list.includes(cmd.name)) return false;
  }
  return true;
}
