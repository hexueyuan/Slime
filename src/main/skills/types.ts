export interface SkillFrontmatter {
  name: string;
  description: string;
  agentIds?: string[];
}

export interface Skill {
  name: string;
  description: string;
  source: "builtin" | "local";
  baseDir: string;
  filePath: string;
  agentIds?: string[];
}
