import type { SkillInfo } from "@shared/types/skills";
import type { Skill } from "@/skills/types";
import { scanSkills, loadSkillContent } from "@/skills/loader";

export class SkillPresenter {
  private cache: Skill[] | null = null;

  constructor(
    private builtinDir: string,
    private localDir: string,
  ) {}

  private loadCache(): Skill[] {
    if (this.cache) return this.cache;

    const builtin = scanSkills(this.builtinDir).map((s) => ({ ...s, source: "builtin" as const }));
    const local = scanSkills(this.localDir).map((s) => ({ ...s, source: "local" as const }));

    // builtin overrides local with same name
    const builtinNames = new Set(builtin.map((s) => s.name));
    const filteredLocal = local.filter((s) => !builtinNames.has(s.name));

    this.cache = [...builtin, ...filteredLocal];
    return this.cache;
  }

  getSkillList(agentId: string, enabledSkills?: string[]): SkillInfo[] {
    const all = this.loadCache();
    const enabledSet = enabledSkills ? new Set(enabledSkills) : null;

    const filtered = all.filter((s) => {
      if (s.source === "builtin") {
        return s.agentIds?.includes(agentId);
      }
      // local: must be explicitly enabled
      if (enabledSet) {
        return enabledSet.has(s.name);
      }
      return false;
    });

    return filtered.map((s) => ({
      name: s.name,
      description: s.description,
      source: s.source,
    }));
  }

  loadSkill(name: string): string {
    const all = this.loadCache();
    const skill = all.find((s) => s.name === name);
    if (!skill) throw new Error(`Skill "${name}" not found`);
    return loadSkillContent(skill.filePath);
  }

  listLocalSkills(): SkillInfo[] {
    const all = this.loadCache();
    return all
      .filter((s) => s.source === "local")
      .map((s) => ({ name: s.name, description: s.description, source: s.source }));
  }
}
