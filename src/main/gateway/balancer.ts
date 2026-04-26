import type { GroupItem } from "@shared/types/gateway";

export type BalanceMode = "round_robin" | "random" | "failover" | "weighted";

export interface Balancer {
  sort(items: GroupItem[], mode: BalanceMode): GroupItem[];
}

export function createBalancer(): Balancer {
  const counters = new Map<number, number>();

  return {
    sort(items, mode) {
      const n = items.length;
      if (n === 0) return [];

      switch (mode) {
        case "round_robin": {
          const groupId = items[0].groupId;
          const prev = counters.get(groupId) ?? -1;
          const next = (prev + 1) % n;
          counters.set(groupId, next);
          const result: GroupItem[] = [];
          for (let i = 0; i < n; i++) {
            result.push(items[(next + i) % n]);
          }
          return result;
        }

        case "random": {
          const result = [...items];
          for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
          }
          return result;
        }

        case "failover": {
          return [...items].sort((a, b) => b.priority - a.priority);
        }

        case "weighted": {
          return [...items]
            .map((item) => ({ item, score: Math.random() * (item.weight || 1) }))
            .sort((a, b) => b.score - a.score)
            .map((s) => s.item);
        }
      }
    },
  };
}
