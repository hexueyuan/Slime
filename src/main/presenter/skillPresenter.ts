import type { SkillInfo } from "@shared/types/skills";
import type { Skill } from "@/skills/types";
import { scanSkills, loadSkillContent } from "@/skills/loader";
import { paths } from "@/utils";

export class SkillPresenter {
  private cache: Skill[] | null = null;

  constructor() {}

  private loadCache(): Skill[] {
    if (!this.cache) {
      const builtin = scanSkills(paths.builtinSkillsDir).map((s) => ({
        ...s,
        source: "builtin" as const,
      }));
      const market = scanSkills(paths.marketSkillsDir).map((s) => ({
        ...s,
        source: "market" as const,
      }));
      this.cache = [...builtin, ...market];
    }
    return this.cache;
  }

  getSkillList(_agentId: string, _agentSkillsDir?: string, enabledSkills?: string[]): SkillInfo[] {
    const enabledSet = new Set(enabledSkills ?? []);
    const skills = this.loadCache().filter((s) => enabledSet.has(s.name));
    return skills.map(({ name, description, source }) => ({ name, description, source }));
  }

  loadSkill(name: string): string {
    const skill = this.loadCache()?.find((s) => s.name === name);
    if (skill) return loadSkillContent(skill.filePath);
    throw new Error(`Skill "${name}" not found`);
  }

  listLocalSkillsForAgent(_agentId: string, _dir: string): SkillInfo[] {
    return [];
  }

  invalidateCache(): void {
    this.cache = null;
  }

  invalidateAgentCache(_agentId: string): void {
    // no-op, agent-specific caches removed
  }
}
