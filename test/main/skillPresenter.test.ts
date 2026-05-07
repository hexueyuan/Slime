import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillPresenter } from "../../src/main/presenter/skillPresenter";
import * as loader from "../../src/main/skills/loader";

vi.mock("../../src/main/skills/loader", () => ({
  scanSkills: vi.fn(),
  loadSkillContent: vi.fn(),
}));

vi.mock("../../src/main/utils", () => ({
  paths: {
    marketSkillsDir: "/market",
  },
}));

const mockMarketSkill = {
  name: "hal-skill",
  description: "market skill",
  source: "builtin" as const,
  baseDir: "/market/hal-skill",
  filePath: "/market/hal-skill/SKILL.md",
};

describe("SkillPresenter", () => {
  let presenter: SkillPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loader.scanSkills).mockReturnValue([mockMarketSkill]);
    presenter = new SkillPresenter();
  });

  it("getSkillList returns market skill when in enabledSkills", () => {
    const result = presenter.getSkillList("hal-ai", undefined, ["hal-skill"]);
    expect(result.map((s) => s.name)).toContain("hal-skill");
  });

  it("getSkillList excludes skills not in enabledSkills", () => {
    const result = presenter.getSkillList("hal-ai", undefined, ["other-skill"]);
    expect(result.map((s) => s.name)).not.toContain("hal-skill");
  });

  it("getSkillList returns empty when enabledSkills is empty", () => {
    const result = presenter.getSkillList("hal-ai", undefined, []);
    expect(result).toEqual([]);
  });

  it("getSkillList returns empty when no enabledSkills provided", () => {
    const result = presenter.getSkillList("hal-ai");
    expect(result).toEqual([]);
  });

  it("agentSkillsDir param is ignored (no-op)", () => {
    const result = presenter.getSkillList("hal-ai", "/some/local/dir", ["hal-skill"]);
    expect(result.map((s) => s.name)).toContain("hal-skill");
  });

  it("listLocalSkillsForAgent always returns []", () => {
    expect(presenter.listLocalSkillsForAgent("agent-1", "/some/dir")).toEqual([]);
  });

  it("loadSkill returns content for known skill", () => {
    vi.mocked(loader.loadSkillContent).mockReturnValue("# hal-skill\nContent.");
    const content = presenter.loadSkill("hal-skill");
    expect(content).toContain("hal-skill");
  });

  it("loadSkill throws for unknown skill", () => {
    expect(() => presenter.loadSkill("nonexistent")).toThrow('Skill "nonexistent" not found');
  });

  it("returned SkillInfo has name, description, source but no filePath/baseDir", () => {
    const list = presenter.getSkillList("hal-ai", undefined, ["hal-skill"]);
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("source");
    expect(list[0]).not.toHaveProperty("filePath");
    expect(list[0]).not.toHaveProperty("baseDir");
  });
});
