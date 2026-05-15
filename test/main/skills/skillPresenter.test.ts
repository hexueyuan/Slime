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

  it("loads skills filtered by enabledSkills", () => {
    const list = sp.getSkillList("hal-ai", undefined, ["guide"]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("guide");
  });

  it("returns empty when enabledSkills is empty", () => {
    const list = sp.getSkillList("hal-ai", undefined, []);
    expect(list).toEqual([]);
  });

  it("returns empty array when no enabledSkills provided", () => {
    const list = sp.getSkillList("unknown-agent");
    expect(list).toEqual([]);
  });

  it("returns multiple skills when all are enabled", () => {
    const list = sp.getSkillList("hal-ai", undefined, ["guide", "debugging"]);
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name)).toContain("guide");
    expect(list.map((s) => s.name)).toContain("debugging");
  });

  it("getSkillList returns SkillInfo array (no filePath/baseDir exposed)", () => {
    const list = sp.getSkillList("hal-ai", undefined, ["guide"]);
    expect(list[0]).not.toHaveProperty("filePath");
    expect(list[0]).not.toHaveProperty("baseDir");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("source");
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
