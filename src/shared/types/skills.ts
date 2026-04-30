/** Skill info exposed to renderer (for UI) */
export interface SkillInfo {
  name: string;
  description: string;
  source: "builtin" | "local";
}
