export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  source: "builtin" | "market";
  baseDir: string;
  filePath: string;
}
