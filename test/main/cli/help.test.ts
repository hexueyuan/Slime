import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildHelp, runHelp } from "../../../src/cli/commands/help";
import type { CallerContext } from "../../../src/cli/auth";
import type { CommandDef } from "../../../src/cli/registry";

const makeCmd = (name: string, roles: string[], agents?: string[]): CommandDef => ({
  name,
  description: `${name} description`,
  detail: `${name} detail`,
  allowedRoles: roles as any,
  allowedAgents: agents,
  run: () => {},
});

const userCtx: CallerContext = { role: "user", userId: "alice", dataDir: "/tmp" };
const builtinCtx: CallerContext = { role: "builtin-agent", userId: "hal-ai", dataDir: "/tmp" };
const externalCtx: CallerContext = { role: "external-agent", userId: "bot", dataDir: "/tmp" };

describe("buildHelp", () => {
  const allCmds = [
    makeCmd("help", ["user", "builtin-agent", "external-agent"]),
    makeCmd("logs", ["builtin-agent"], ["hal-ai"]),
  ];

  it("shows all commands to builtin hal-ai", () => {
    const out = buildHelp(allCmds, builtinCtx);
    expect(out).toContain("help");
    expect(out).toContain("logs");
  });

  it("only shows help to user (logs hidden)", () => {
    const out = buildHelp(allCmds, userCtx);
    expect(out).toContain("help");
    expect(out).not.toContain("logs");
  });

  it("hides logs from external-agent", () => {
    const out = buildHelp(allCmds, externalCtx);
    expect(out).not.toContain("logs");
  });

  it("hides logs from builtin-agent not in allowedAgents", () => {
    const otherCtx: CallerContext = { role: "builtin-agent", userId: "other", dataDir: "/tmp" };
    const out = buildHelp(allCmds, otherCtx);
    expect(out).not.toContain("logs");
  });
});

describe("runHelp", () => {
  let output: string[];

  beforeEach(() => {
    output = [];
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      output.push(String(s));
      return true;
    });
  });

  const allCmds = [
    makeCmd("help", ["user", "builtin-agent", "external-agent"]),
    makeCmd("logs", ["builtin-agent"], ["hal-ai"]),
  ];

  it("prints command list when no arg", () => {
    runHelp([], builtinCtx, allCmds);
    expect(output.join("")).toContain("Slime CLI");
    expect(output.join("")).toContain("logs");
  });

  it("prints detail for accessible command", () => {
    runHelp(["logs"], builtinCtx, allCmds);
    expect(output.join("")).toContain("logs detail");
  });

  it("prints error for inaccessible command", () => {
    let exitCode: number | undefined;
    vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    });
    expect(() => runHelp(["logs"], userCtx, allCmds)).toThrow("exit");
    expect(exitCode).toBe(1);
    expect(output.join("")).toContain("未知命令 'logs'");
  });
});
