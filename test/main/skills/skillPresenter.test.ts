import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SkillPresenter } from "@/presenter/skillPresenter";

const testRoot = join(tmpdir(), `slime-skills-pres-${Date.now()}`);
const builtinDir = join(testRoot, "builtin");
const localDir = join(testRoot, "local");

function writeSkill(dir: string, name: string, description: string) {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const lines = [
    `---`,
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
    "Content here.",
  ];
  writeFileSync(join(skillDir, "SKILL.md"), lines.join("\n"));
}

beforeEach(() => {
  mkdirSync(builtinDir, { recursive: true });
  mkdirSync(localDir, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe("SkillPresenter", () => {
  it("loads builtin skills filtered by enabledSkills", () => {
    writeSkill(builtinDir, "guide", "Guide skill.");
    writeSkill(builtinDir, "secret", "Secret skill.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", undefined, ["guide"]);

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("guide");
  });

  it("loads local skills filtered by enabledSkills", () => {
    writeSkill(localDir, "debugging", "Debug.");
    writeSkill(localDir, "review", "Review.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("agent-1", localDir, ["debugging"]);

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("debugging");
  });

  it("returns empty when enabledSkills is empty", () => {
    writeSkill(builtinDir, "guide", "Guide.");
    writeSkill(localDir, "debugging", "Debug.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", localDir, []);

    expect(list).toEqual([]);
  });

  it("merges builtin and local skills (builtin first)", () => {
    writeSkill(builtinDir, "guide", "Guide.");
    writeSkill(localDir, "debugging", "Debug.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", localDir, ["guide", "debugging"]);

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("guide");
    expect(list[1].name).toBe("debugging");
  });

  it("builtin overrides local with same name", () => {
    writeSkill(builtinDir, "debugging", "Builtin debug.");
    writeSkill(localDir, "debugging", "Local debug.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", localDir, ["debugging"]);

    expect(list).toHaveLength(1);
    expect(list[0].description).toBe("Builtin debug.");
  });

  it("returns empty array when no enabledSkills provided", () => {
    writeSkill(builtinDir, "guide", "Guide.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("unknown-agent");
    expect(list).toEqual([]);
  });

  it("getSkillList returns SkillInfo array (no filePath exposed)", () => {
    writeSkill(builtinDir, "guide", "Guide.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", undefined, ["guide"]);

    expect(list[0]).not.toHaveProperty("filePath");
    expect(list[0]).not.toHaveProperty("baseDir");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("source");
  });

  it("loadSkill returns full SKILL.md content", () => {
    writeSkill(localDir, "debugging", "Debug skill.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    // populate cache via getSkillList with agentSkillsDir
    sp.getSkillList("agent-1", localDir, ["debugging"]);
    const content = sp.loadSkill("debugging");

    expect(content).toContain("---");
    expect(content).toContain("name: debugging");
    expect(content).toContain("# debugging");
  });

  it("loadSkill throws for unknown skill", () => {
    const sp = new SkillPresenter(builtinDir, testRoot);
    expect(() => sp.loadSkill("nonexistent")).toThrow('Skill "nonexistent" not found');
  });

  it("listLocalSkillsForAgent returns all local skills for an agent", () => {
    writeSkill(localDir, "a", "A.");
    writeSkill(localDir, "b", "B.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.listLocalSkillsForAgent("agent-1", localDir);

    expect(list).toHaveLength(2);
    expect(list.map((s) => s.name).sort()).toEqual(["a", "b"]);
  });
});
