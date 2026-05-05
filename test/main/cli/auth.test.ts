import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCallerContext } from "../../../src/cli/auth";

describe("getCallerContext", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns builtin-agent context", () => {
    process.env.SLIME_ROLE = "builtin-agent";
    process.env.SLIME_USER_ID = "hal-ai";
    process.env.SLIME_DATA_DIR = "/tmp/slime-data";
    const ctx = getCallerContext();
    expect(ctx).toEqual({ role: "builtin-agent", userId: "hal-ai", dataDir: "/tmp/slime-data" });
  });

  it("returns user context", () => {
    process.env.SLIME_ROLE = "user";
    process.env.SLIME_USER_ID = "hexueyuan";
    process.env.SLIME_DATA_DIR = "/tmp/slime-data";
    const ctx = getCallerContext();
    expect(ctx).toEqual({ role: "user", userId: "hexueyuan", dataDir: "/tmp/slime-data" });
  });

  it("throws when SLIME_ROLE missing", () => {
    delete process.env.SLIME_ROLE;
    process.env.SLIME_USER_ID = "hal-ai";
    process.env.SLIME_DATA_DIR = "/tmp";
    expect(() => getCallerContext()).toThrow("SLIME_ROLE is not set");
  });

  it("throws when SLIME_USER_ID missing", () => {
    process.env.SLIME_ROLE = "user";
    delete process.env.SLIME_USER_ID;
    process.env.SLIME_DATA_DIR = "/tmp";
    expect(() => getCallerContext()).toThrow("SLIME_USER_ID is not set");
  });

  it("throws when SLIME_DATA_DIR missing", () => {
    process.env.SLIME_ROLE = "user";
    process.env.SLIME_USER_ID = "hexueyuan";
    delete process.env.SLIME_DATA_DIR;
    expect(() => getCallerContext()).toThrow("SLIME_DATA_DIR is not set");
  });
});
