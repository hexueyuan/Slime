import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scanSkills, loadSkillContent } from "@/skills/loader";

const testRoot = join(tmpdir(), `slime-skills-loader-${Date.now()}`);
const skillsDir = join(testRoot, "skills");

beforeEach(() => {
  mkdirSync(skillsDir, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe("scanSkills", () => {
  it("returns empty array for empty/nonexistent dir", () => {
    const result = scanSkills("/nonexistent/dir");
    expect(result).toEqual([]);
  });

  it("scans valid skill directories", () => {
    mkdirSync(join(skillsDir, "debugging"), { recursive: true });
    writeFileSync(
      join(skillsDir, "debugging", "SKILL.md"),
      `---\nname: debugging\ndescription: Debug errors.\n---\n\n# Debugging\n`,
    );

    const result = scanSkills(skillsDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("debugging");
    expect(result[0].description).toBe("Debug errors.");
    expect(result[0].filePath).toBe(join(skillsDir, "debugging", "SKILL.md"));
    expect(result[0].baseDir).toBe(join(skillsDir, "debugging"));

    mkdirSync(join(skillsDir, "a"), { recursive: true });
    writeFileSync(
      join(skillsDir, "a", "SKILL.md"),
      `---\nname: a\ndescription: Skill A.\n---\n\n# A\n`,
    );
    mkdirSync(join(skillsDir, "b"), { recursive: true });
    writeFileSync(
      join(skillsDir, "b", "SKILL.md"),
      `---\nname: b\ndescription: Skill B.\n---\n\n# B\n`,
    );

    const withMultiple = scanSkills(skillsDir);
    expect(withMultiple.map((skill) => skill.name).sort()).toEqual(["a", "b", "debugging"]);
  });

  it("skips invalid or incomplete skill directories", () => {
    mkdirSync(join(skillsDir, "no-skill"), { recursive: true });
    writeFileSync(join(skillsDir, "no-skill", "README.md"), "not a skill");

    mkdirSync(join(skillsDir, "bad"), { recursive: true });
    writeFileSync(join(skillsDir, "bad", "SKILL.md"), `not frontmatter\n\n# Bad\n`);

    mkdirSync(join(skillsDir, "no-name"), { recursive: true });
    writeFileSync(
      join(skillsDir, "no-name", "SKILL.md"),
      `---\ndescription: Missing name.\n---\n\n# No Name\n`,
    );

    const result = scanSkills(skillsDir);
    expect(result).toHaveLength(0);
  });

  it("ignores unknown frontmatter fields gracefully", () => {
    mkdirSync(join(skillsDir, "guide"), { recursive: true });
    writeFileSync(
      join(skillsDir, "guide", "SKILL.md"),
      `---\nname: guide\ndescription: Guide.\nagentIds:\n  - hal-ai\n  - another-agent\n---\n\n# Guide\n`,
    );

    const result = scanSkills(skillsDir);
    expect(result[0].name).toBe("guide");
    expect(result[0]).not.toHaveProperty("agentIds");
  });
});

describe("loadSkillContent", () => {
  it("reads SKILL.md content and throws for missing files", () => {
    const content = `---\nname: test\ndescription: Test skill.\n---\n\n# Test Skill\n\nInstructions here.`;
    mkdirSync(join(skillsDir, "test"), { recursive: true });
    writeFileSync(join(skillsDir, "test", "SKILL.md"), content);

    const result = loadSkillContent(join(skillsDir, "test", "SKILL.md"));
    expect(result).toBe(content);
    expect(() => loadSkillContent("/nonexistent/skill/SKILL.md")).toThrow();
  });
});
