export type Role = "user" | "builtin-agent" | "external-agent";

export interface CallerContext {
  role: Role;
  userId: string;
  dataDir: string;
}

const VALID_ROLES: Role[] = ["user", "builtin-agent", "external-agent"];

export function getCallerContext(): CallerContext {
  const role = process.env.SLIME_ROLE;
  const userId = process.env.SLIME_USER_ID;
  const dataDir = process.env.SLIME_DATA_DIR;

  if (!role) throw new Error("SLIME_ROLE is not set. Run via Slime app or slime-cli wrapper.");
  if (!userId) throw new Error("SLIME_USER_ID is not set. Run via Slime app or slime-cli wrapper.");
  if (!dataDir)
    throw new Error("SLIME_DATA_DIR is not set. Run via Slime app or slime-cli wrapper.");

  if (!(VALID_ROLES as string[]).includes(role)) {
    throw new Error(`Invalid SLIME_ROLE: ${role}`);
  }

  return { role: role as Role, userId, dataDir };
}
