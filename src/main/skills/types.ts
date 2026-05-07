export interface SkillFrontmatter {
  name: string;
  description: string;
}

export interface Skill {
  name: string;
  description: string;
  source: "builtin" | "local";
  baseDir: string;
  filePath: string;
}
