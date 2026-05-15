import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillPresenter } from "@/presenter/skillPresenter";
import * as loader from "@/skills/loader";

vi.mock("@/skills/loader", () => ({
  scanSkills: vi.fn(),
  loadSkillContent: vi.fn(),
}));

vi.mock("@/utils", () => ({
  paths: {
    marketSkillsDir: "/market",
  },
}));

const skillA = {
  name: "guide",
  description: "Guide skill.",
  source: "builtin" as const,
  baseDir: "/market/guide",
  filePath: "/market/guide/SKILL.md",
};

const skillB = {
  name: "debugging",
  description: "Debug skill.",
  source: "builtin" as const,
  baseDir: "/market/debugging",
  filePath: "/market/debugging/SKILL.md",
};

describe("SkillPresenter", () => {
  let sp: SkillPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loader.scanSkills).mockImplementation((dir: string) =>
      dir === "/market" ? [skillA, skillB] : [],
    );
    sp = new SkillPresenter();
  });

  it("filters enabled skills and strips internal paths", () => {
    const list = sp.getSkillList("hal-ai", undefined, ["guide"]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("guide");
    expect(list[0]).not.toHaveProperty("filePath");
    expect(list[0]).not.toHaveProperty("baseDir");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("source");

    const allEnabled = sp.getSkillList("hal-ai", undefined, ["guide", "debugging"]);
    expect(allEnabled.map((s) => s.name).sort()).toEqual(["debugging", "guide"]);
    expect(sp.getSkillList("hal-ai", undefined, [])).toEqual([]);
    expect(sp.getSkillList("unknown-agent")).toEqual([]);
  });

  it("loadSkill returns content for known skill", () => {
    vi.mocked(loader.loadSkillContent).mockReturnValue(
      "---\nname: guide\n---\n# guide\nContent here.",
    );
    sp.getSkillList("hal-ai", undefined, ["guide"]); // populate cache
    const content = sp.loadSkill("guide");
    expect(content).toContain("name: guide");
    expect(content).toContain("# guide");
  });

  it("loadSkill throws for unknown skill", () => {
    expect(() => sp.loadSkill("nonexistent")).toThrow('Skill "nonexistent" not found');
  });

  it("listLocalSkillsForAgent always returns []", () => {
    expect(sp.listLocalSkillsForAgent("agent-1", "/some/local/dir")).toEqual([]);
  });
});
