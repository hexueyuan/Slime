import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillPresenter } from "../../src/main/presenter/skillPresenter";
import * as loader from "../../src/main/skills/loader";

vi.mock("../../src/main/skills/loader", () => ({
  scanSkills: vi.fn(),
  loadSkillContent: vi.fn(),
}));

const mockBuiltinSkill = {
  name: "hal-skill",
  description: "builtin",
  source: "builtin" as const,
  baseDir: "/builtin/hal-skill",
  filePath: "/builtin/hal-skill/SKILL.md",
};

const mockLocalSkill = {
  name: "my-skill",
  description: "local",
  source: "local" as const,
  baseDir: "/agents/abc123/skills/my-skill",
  filePath: "/agents/abc123/skills/my-skill/SKILL.md",
};

describe("SkillPresenter", () => {
  let presenter: SkillPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    presenter = new SkillPresenter("/builtin", "/agents");
    vi.mocked(loader.scanSkills).mockImplementation((dir: string) => {
      if (dir.includes("builtin")) return [mockBuiltinSkill];
      if (dir.includes("abc123")) return [mockLocalSkill];
      return [];
    });
  });

  it("getSkillList returns builtin skills when in enabledSkills", () => {
    const result = presenter.getSkillList("hal-ai", undefined, ["hal-skill"]);
    expect(result.map((s) => s.name)).toContain("hal-skill");
  });

  it("getSkillList excludes builtin skills not in enabledSkills", () => {
    const result = presenter.getSkillList("hal-ai", undefined, ["other-skill"]);
    expect(result.map((s) => s.name)).not.toContain("hal-skill");
  });

  it("getSkillList returns local skills when in enabledSkills", () => {
    const result = presenter.getSkillList("abc123", "/agents/abc123/skills", ["my-skill"]);
    expect(result.map((s) => s.name)).toContain("my-skill");
  });

  it("getSkillList excludes local skills not in enabledSkills", () => {
    const result = presenter.getSkillList("abc123", "/agents/abc123/skills", ["other-skill"]);
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });

  it("getSkillList returns empty when enabledSkills is empty", () => {
    const result = presenter.getSkillList("abc123", "/agents/abc123/skills", []);
    expect(result).toEqual([]);
  });

  it("getSkillList does NOT return local skills when agentSkillsDir not provided", () => {
    const result = presenter.getSkillList("abc123", undefined, ["my-skill"]);
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });
});
