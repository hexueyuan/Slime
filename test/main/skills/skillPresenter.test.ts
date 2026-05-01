import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SkillPresenter } from "@/presenter/skillPresenter";

const testRoot = join(tmpdir(), `slime-skills-pres-${Date.now()}`);
const builtinDir = join(testRoot, "builtin");
const localDir = join(testRoot, "local");

function writeSkill(dir: string, name: string, description: string, agentIds?: string[]) {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  const lines = [`---`, `name: ${name}`, `description: ${description}`];
  if (agentIds) {
    lines.push("agentIds:");
    agentIds.forEach((id) => lines.push(`  - ${id}`));
  }
  lines.push("---", "", `# ${name}`, "", "Content here.");
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
  it("loads builtin skills filtered by agentId", () => {
    writeSkill(builtinDir, "guide", "Guide skill.", ["hal-ai"]);
    writeSkill(builtinDir, "secret", "Secret skill.", ["other-agent"]);

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai");

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("guide");
  });

  it("loads local skills enabled in AgentConfig", () => {
    writeSkill(localDir, "debugging", "Debug.");
    writeSkill(localDir, "review", "Review.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    // pass localDir as agentSkillsDir, disabled = ["review"] so only debugging remains
    const list = sp.getSkillList("agent-1", localDir, ["review"]);

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("debugging");
  });

  it("merges builtin and local skills (builtin first)", () => {
    writeSkill(builtinDir, "guide", "Guide.", ["hal-ai"]);
    writeSkill(localDir, "debugging", "Debug.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", localDir);

    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("guide");
    expect(list[1].name).toBe("debugging");
  });

  it("builtin overrides local with same name", () => {
    writeSkill(builtinDir, "debugging", "Builtin debug.", ["hal-ai"]);
    writeSkill(localDir, "debugging", "Local debug.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai", localDir);

    expect(list).toHaveLength(1);
    expect(list[0].description).toBe("Builtin debug.");
  });

  it("returns empty array when no skills match", () => {
    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("unknown-agent");
    expect(list).toEqual([]);
  });

  it("getSkillList returns SkillInfo array (no filePath exposed)", () => {
    writeSkill(builtinDir, "guide", "Guide.", ["hal-ai"]);

    const sp = new SkillPresenter(builtinDir, testRoot);
    const list = sp.getSkillList("hal-ai");

    expect(list[0]).not.toHaveProperty("filePath");
    expect(list[0]).not.toHaveProperty("baseDir");
    expect(list[0]).not.toHaveProperty("agentIds");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("description");
    expect(list[0]).toHaveProperty("source");
  });

  it("loadSkill returns full SKILL.md content", () => {
    writeSkill(localDir, "debugging", "Debug skill.");

    const sp = new SkillPresenter(builtinDir, testRoot);
    // populate cache via getSkillList with agentSkillsDir
    sp.getSkillList("agent-1", localDir);
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
