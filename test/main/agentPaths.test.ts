import { describe, it, expect } from "vitest";
import { getAgentDir, getPromptPath, getSkillsDir } from "../../src/main/utils/agentPaths";
import { join } from "path";

const builtinAgent = { id: "hal-ai", name: "哈尔", type: "builtin" };
const customAgent = { id: "abc123", name: "我的Agent", type: "custom" };

describe("getAgentDir", () => {
  it("resolves builtin, default, and vault-backed agent directories", () => {
    expect(getAgentDir(builtinAgent, null, "/home/.slime/agents")).toBeNull();
    expect(getAgentDir(customAgent, null, "/home/.slime/agents")).toBe(
      "/home/.slime/agents/abc123",
    );
    expect(getAgentDir(customAgent, "/vault", "/home/.slime/agents")).toBe(
      "/vault/Slime/我的Agent",
    );
  });
});

describe("agent subpaths", () => {
  it("resolves prompt and skills paths under agentDir", () => {
    expect(getPromptPath("/some/dir")).toBe(join("/some/dir", "PROMPT.md"));
    expect(getSkillsDir("/some/dir")).toBe(join("/some/dir", "skills"));
  });
});
