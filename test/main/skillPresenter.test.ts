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
  agentIds: ["hal-ai"],
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

  it("getSkillList returns builtin skills for matching agentId", () => {
    const result = presenter.getSkillList("hal-ai");
    expect(result.map((s) => s.name)).toContain("hal-skill");
  });

  it("getSkillList returns local skills from agent dir, excluding disabled", () => {
    const result = presenter.getSkillList("abc123", "/agents/abc123/skills", []);
    expect(result.map((s) => s.name)).toContain("my-skill");
  });

  it("getSkillList excludes disabled skills", () => {
    const result = presenter.getSkillList("abc123", "/agents/abc123/skills", ["my-skill"]);
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });

  it("getSkillList does NOT return local skills when agentSkillsDir not provided", () => {
    const result = presenter.getSkillList("abc123");
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });
});
