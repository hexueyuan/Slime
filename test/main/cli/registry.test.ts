import { describe, it, expect } from "vitest";
import { canAccess, type CommandDef } from "../../../src/cli/registry";
import type { CallerContext } from "../../../src/cli/auth";

const mockCmd = (allowedRoles: string[], allowedAgents?: string[]): CommandDef => ({
  name: "test",
  description: "test cmd",
  detail: "test detail",
  allowedRoles: allowedRoles as any,
  allowedAgents,
  run: () => {},
});

describe("canAccess", () => {
  it("allows user when role in allowedRoles", () => {
    const ctx: CallerContext = { role: "user", userId: "alice", dataDir: "/tmp" };
    expect(canAccess(mockCmd(["user", "builtin-agent"]), ctx)).toBe(true);
  });

  it("denies when role not in allowedRoles", () => {
    const ctx: CallerContext = { role: "external-agent", userId: "bot", dataDir: "/tmp" };
    expect(canAccess(mockCmd(["builtin-agent"]), ctx)).toBe(false);
  });

  it("allows builtin-agent when in allowedAgents", () => {
    const ctx: CallerContext = { role: "builtin-agent", userId: "hal-ai", dataDir: "/tmp" };
    expect(canAccess(mockCmd(["builtin-agent"], ["hal-ai"]), ctx)).toBe(true);
  });

  it("denies builtin-agent not in allowedAgents", () => {
    const ctx: CallerContext = { role: "builtin-agent", userId: "other-agent", dataDir: "/tmp" };
    expect(canAccess(mockCmd(["builtin-agent"], ["hal-ai"]), ctx)).toBe(false);
  });

  it("allows any builtin-agent when allowedAgents not set", () => {
    const ctx: CallerContext = { role: "builtin-agent", userId: "any-agent", dataDir: "/tmp" };
    expect(canAccess(mockCmd(["builtin-agent"]), ctx)).toBe(true);
  });
});
