import type BetterSqlite3 from "better-sqlite3";
import type { Group, GroupItem } from "@shared/types/gateway";
import { listGroups, listGroupItems } from "@/db/models/groupDao";

export interface Router {
  reload(db: BetterSqlite3.Database): void;
  resolve(model: string): { group: Group; items: GroupItem[] } | undefined;
  listGroupNames(): string[];
}

export function createRouter(): Router {
  const cache = new Map<string, { group: Group; items: GroupItem[] }>();

  return {
    reload(db) {
      cache.clear();
      const groups = listGroups(db);
      for (const group of groups) {
        const items = listGroupItems(db, group.id);
        cache.set(group.name, { group, items });
      }
    },

    resolve(model) {
      return cache.get(model);
    },

    listGroupNames() {
      return [...cache.keys()];
    },
  };
}
