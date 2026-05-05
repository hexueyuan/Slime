import type { CallerContext, Role } from "./auth";

export interface CommandDef {
  name: string;
  description: string;
  detail: string;
  allowedRoles: Role[];
  allowedAgents?: string[];
  run: (args: string[], ctx: CallerContext) => void;
}

export function canAccess(cmd: CommandDef, ctx: CallerContext): boolean {
  if (!cmd.allowedRoles.includes(ctx.role)) return false;
  if (cmd.allowedAgents && !cmd.allowedAgents.includes(ctx.userId)) return false;
  return true;
}
