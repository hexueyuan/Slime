import { readFileSync, readdirSync, existsSync } from "fs";
import type { Dirent } from "fs";
import { join } from "path";
import type { Skill, SkillFrontmatter } from "./types";

function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of raw.split("\n")) {
    const arrayMatch = line.match(/^\s*-\s+(.+)/);
    if (currentKey && currentArray && arrayMatch) {
      currentArray.push(arrayMatch[1].trim());
      continue;
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === "") {
        currentArray = [];
      } else {
        result[currentKey] = value;
        currentKey = null;
      }
    }
  }

  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  const frontmatter = result as unknown as SkillFrontmatter;
  if (!frontmatter.name || !frontmatter.description) return null;
  return frontmatter;
}

export function scanSkills(dir: string): Skill[] {
  if (!existsSync(dir)) return [];

  const skills: Skill[] = [];
  let dirents: Dirent[];
  try {
    dirents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(dir, entry.name);
    const mdPath = join(skillDir, "SKILL.md");
    if (!existsSync(mdPath)) continue;

    let content: string;
    try {
      content = readFileSync(mdPath, "utf-8");
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    if (!fm) continue;

    skills.push({
      name: fm.name,
      description: fm.description,
      source: "local",
      baseDir: skillDir,
      filePath: mdPath,
    });
  }

  return skills;
}

export function loadSkillContent(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}
