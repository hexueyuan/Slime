import type BetterSqlite3 from "better-sqlite3";
import type {
  Capability,
  CapabilityRequirement,
  ModelMatch,
  SelectResult,
  Model,
} from "@shared/types/gateway";
import type { CircuitBreaker } from "./circuit";
import * as modelDao from "@/db/models/modelDao";
import { syncCompositeGroupItems } from "@/db/models/groupDao";

export interface CapabilitySelector {
  select(requirements: CapabilityRequirement): SelectResult;
  hasCapability(cap: Capability): boolean;
  availableCapabilities(): Capability[];
  modelsWithCapability(cap: Capability): ModelMatch[];
}

export function createCapabilitySelector(
  db: BetterSqlite3.Database,
  _circuit: CircuitBreaker,
): CapabilitySelector {
  function getEnabledModels(): Model[] {
    return modelDao.listModels(db).filter((m) => m.enabled);
  }

  function toMatch(model: Model, groupName: string): ModelMatch {
    return {
      modelId: model.id,
      modelName: model.modelName,
      channelId: model.channelId,
      groupName,
      capabilities: model.capabilities,
    };
  }

  function modelsWithAllCaps(models: Model[], caps: Capability[]): Model[] {
    return models.filter((m) => caps.every((c) => m.capabilities.includes(c)));
  }

  function ensureCompositeGroup(groupName: string): void {
    const existing = db
      .prepare("SELECT id FROM groups_ WHERE name = ? AND is_builtin = 1")
      .get(groupName) as { id: number } | undefined;
    if (!existing) {
      db.prepare(
        `INSERT OR IGNORE INTO groups_ (name, balance_mode, is_builtin) VALUES (?, 'failover', 1)`,
      ).run(groupName);
    }
    syncCompositeGroupItems(db, groupName);
  }

  return {
    select(requirements) {
      const models = getEnabledModels();
      const matched: Record<string, ModelMatch> = {};
      const missing: string[] = [];

      for (const req of requirements) {
        if (typeof req === "string") {
          const groupName = req;
          const candidates = modelsWithAllCaps(models, [req as Capability]);
          if (candidates.length > 0) {
            matched[groupName] = toMatch(candidates[0], groupName);
          } else {
            missing.push(groupName);
          }
        } else {
          const groupName = req.join("+");
          const candidates = modelsWithAllCaps(models, req);
          if (candidates.length > 0) {
            ensureCompositeGroup(groupName);
            matched[groupName] = toMatch(candidates[0], groupName);
          } else {
            missing.push(groupName);
          }
        }
      }

      return { matched, missing };
    },

    hasCapability(cap) {
      return getEnabledModels().some((m) => m.capabilities.includes(cap));
    },

    availableCapabilities() {
      const caps = new Set<Capability>();
      for (const m of getEnabledModels()) {
        for (const c of m.capabilities) caps.add(c);
      }
      return [...caps];
    },

    modelsWithCapability(cap) {
      const groupName = cap;
      return getEnabledModels()
        .filter((m) => m.capabilities.includes(cap))
        .map((m) => toMatch(m, groupName));
    },
  };
}
