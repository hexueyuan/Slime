import type { SkillInfo } from "@shared/types/skills";
import type { Skill } from "@/skills/types";
import { scanSkills, loadSkillContent } from "@/skills/loader";
import { paths } from "@/utils";

export class SkillPresenter {
  private marketCache: Skill[] | null = null;

  constructor() {}

  private loadMarketCache(): Skill[] {
    if (!this.marketCache) {
      this.marketCache = scanSkills(paths.marketSkillsDir).map((s) => ({
        ...s,
        source: "local" as const,
      }));
    }
    return this.marketCache;
  }

  getSkillList(_agentId: string, _agentSkillsDir?: string, enabledSkills?: string[]): SkillInfo[] {
    const enabledSet = new Set(enabledSkills ?? []);
    const skills = this.loadMarketCache().filter((s) => enabledSet.has(s.name));
    return skills.map(({ name, description, source }) => ({ name, description, source }));
  }

  loadSkill(name: string): string {
    const skill = this.loadMarketCache()?.find((s) => s.name === name);
    if (skill) return loadSkillContent(skill.filePath);
    throw new Error(`Skill "${name}" not found`);
  }

  listLocalSkillsForAgent(_agentId: string, _dir: string): SkillInfo[] {
    return [];
  }

  invalidateCache(): void {
    this.marketCache = null;
  }

  invalidateAgentCache(_agentId: string): void {
    // no-op, agent-specific caches removed
  }
}
