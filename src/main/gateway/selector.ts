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

  function toMatch(model: Model): ModelMatch {
    return {
      modelId: model.id,
      modelName: model.modelName,
      channelId: model.channelId,
      groupName: model.modelName,
      capabilities: model.capabilities,
    };
  }

  function modelsWithAllCaps(models: Model[], caps: Capability[]): Model[] {
    return models.filter((m) => caps.every((c) => m.capabilities.includes(c)));
  }

  return {
    select(requirements) {
      const models = getEnabledModels();
      const matched: Record<string, ModelMatch> = {};
      const missing: string[] = [];

      for (const req of requirements) {
        if (typeof req === "string") {
          const candidates = modelsWithAllCaps(models, [req]);
          if (candidates.length > 0) {
            matched[req] = toMatch(candidates[0]);
          } else {
            missing.push(req);
          }
        } else {
          const key = req.join("+");
          const candidates = modelsWithAllCaps(models, req);
          if (candidates.length > 0) {
            matched[key] = toMatch(candidates[0]);
          } else {
            missing.push(key);
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
      return getEnabledModels()
        .filter((m) => m.capabilities.includes(cap))
        .map(toMatch);
    },
  };
}
