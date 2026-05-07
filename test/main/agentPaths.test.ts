import { describe, it, expect } from "vitest";
import { getAgentDir, getPromptPath, getSkillsDir } from "../../src/main/utils/agentPaths";
import { join } from "path";

const builtinAgent = { id: "hal-ai", name: "哈尔", type: "builtin" };
const customAgent = { id: "abc123", name: "我的Agent", type: "custom" };

describe("getAgentDir", () => {
  it("builtin agent returns null", () => {
    expect(getAgentDir(builtinAgent, null, "/home/.slime/agents")).toBeNull();
  });

  it("no vault path uses default dir with agent id", () => {
    const result = getAgentDir(customAgent, null, "/home/.slime/agents");
    expect(result).toBe("/home/.slime/agents/abc123");
  });

  it("vault path uses agent name under {vault}/Slime/", () => {
    const result = getAgentDir(customAgent, "/vault", "/home/.slime/agents");
    expect(result).toBe("/vault/Slime/我的Agent");
  });
});

describe("getPromptPath", () => {
  it("returns PROMPT.md under agentDir", () => {
    expect(getPromptPath("/some/dir")).toBe(join("/some/dir", "PROMPT.md"));
  });
});

describe("getSkillsDir", () => {
  it("returns skills/ under agentDir", () => {
    expect(getSkillsDir("/some/dir")).toBe(join("/some/dir", "skills"));
  });
});
