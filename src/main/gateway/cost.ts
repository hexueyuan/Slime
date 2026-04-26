import type BetterSqlite3 from "better-sqlite3";
import { getPrice } from "@/db/models/priceDao";

export function calculateCost(
  db: BetterSqlite3.Database,
  modelName: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): number {
  const price = getPrice(db, modelName);
  if (!price) return 0;

  return (
    (usage.inputTokens * price.inputPrice +
      usage.outputTokens * price.outputPrice +
      (usage.cacheReadTokens ?? 0) * price.cacheReadPrice +
      (usage.cacheWriteTokens ?? 0) * price.cacheWritePrice) /
    1_000_000
  );
}
