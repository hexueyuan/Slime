import type { SkillInfo } from "@shared/types/skills";
import type { Skill } from "@/skills/types";
import { scanSkills, loadSkillContent } from "@/skills/loader";

export class SkillPresenter {
  private builtinCache: Skill[] | null = null;
  private agentSkillCache = new Map<string, Skill[]>();

  constructor(
    private builtinDir: string,
    _agentsBaseDir: string,
  ) {}

  private loadBuiltinCache(): Skill[] {
    if (!this.builtinCache) {
      this.builtinCache = scanSkills(this.builtinDir).map((s) => ({
        ...s,
        source: "builtin" as const,
      }));
    }
    return this.builtinCache;
  }

  private loadAgentSkillCache(agentId: string, agentSkillsDir: string): Skill[] {
    if (!this.agentSkillCache.has(agentId)) {
      const skills = scanSkills(agentSkillsDir).map((s) => ({ ...s, source: "local" as const }));
      this.agentSkillCache.set(agentId, skills);
    }
    return this.agentSkillCache.get(agentId)!;
  }

  getSkillList(agentId: string, agentSkillsDir?: string, disabledSkills?: string[]): SkillInfo[] {
    const builtins = this.loadBuiltinCache().filter((s) => s.agentIds?.includes(agentId));

    const locals: Skill[] = agentSkillsDir ? this.loadAgentSkillCache(agentId, agentSkillsDir) : [];

    const disabledSet = new Set(disabledSkills ?? []);
    const filteredLocals = locals.filter((s) => !disabledSet.has(s.name));

    // builtin overrides local with same name
    const builtinNames = new Set(builtins.map((s) => s.name));
    const merged = [...builtins, ...filteredLocals.filter((s) => !builtinNames.has(s.name))];

    return merged.map(({ name, description, source }) => ({ name, description, source }));
  }

  loadSkill(name: string): string {
    const builtin = this.builtinCache?.find((s) => s.name === name);
    if (builtin) return loadSkillContent(builtin.filePath);

    for (const skills of this.agentSkillCache.values()) {
      const found = skills.find((s) => s.name === name);
      if (found) return loadSkillContent(found.filePath);
    }
    throw new Error(`Skill "${name}" not found`);
  }

  listLocalSkillsForAgent(agentId: string, agentSkillsDir: string): SkillInfo[] {
    const skills = this.loadAgentSkillCache(agentId, agentSkillsDir);
    return skills.map(({ name, description, source }) => ({ name, description, source }));
  }

  invalidateAgentCache(agentId: string): void {
    this.agentSkillCache.delete(agentId);
  }
}
