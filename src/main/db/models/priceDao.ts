import type BetterSqlite3 from "better-sqlite3";
import type { ModelPrice } from "@shared/types/gateway";

interface PriceRow {
  id: number;
  model_name: string;
  input_price: number;
  output_price: number;
  cache_read_price: number;
  cache_write_price: number;
  source: string;
  updated_at: string;
}

function rowToPrice(row: PriceRow): ModelPrice {
  return {
    id: row.id,
    modelName: row.model_name,
    inputPrice: row.input_price,
    outputPrice: row.output_price,
    cacheReadPrice: row.cache_read_price,
    cacheWritePrice: row.cache_write_price,
    source: row.source as ModelPrice["source"],
    updatedAt: row.updated_at,
  };
}

export function listPrices(db: BetterSqlite3.Database): ModelPrice[] {
  const rows = db.prepare("SELECT * FROM model_prices ORDER BY model_name").all() as PriceRow[];
  return rows.map(rowToPrice);
}

export function getPrice(db: BetterSqlite3.Database, modelName: string): ModelPrice | undefined {
  const row = db.prepare("SELECT * FROM model_prices WHERE model_name = ?").get(modelName) as
    | PriceRow
    | undefined;
  return row ? rowToPrice(row) : undefined;
}

export function upsertPrice(
  db: BetterSqlite3.Database,
  modelName: string,
  data: {
    inputPrice: number;
    outputPrice: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    source?: ModelPrice["source"];
  },
): void {
  db.prepare(`
    INSERT INTO model_prices (model_name, input_price, output_price, cache_read_price, cache_write_price, source)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_name) DO UPDATE SET
      input_price = excluded.input_price,
      output_price = excluded.output_price,
      cache_read_price = excluded.cache_read_price,
      cache_write_price = excluded.cache_write_price,
      source = excluded.source,
      updated_at = datetime('now')
  `).run(
    modelName,
    data.inputPrice,
    data.outputPrice,
    data.cacheReadPrice ?? 0,
    data.cacheWritePrice ?? 0,
    data.source ?? "manual",
  );
}

const PRESETS: [string, number, number][] = [
  // Claude
  ["claude-sonnet-4-20250514", 3, 15],
  ["claude-opus-4-20250115", 15, 75],
  ["claude-haiku-3-5-20241022", 0.8, 4],
  ["claude-sonnet-3-5-20241022", 3, 15],
  // GPT
  ["gpt-4.1", 2, 8],
  ["gpt-4.1-mini", 0.4, 1.6],
  ["gpt-4.1-nano", 0.1, 0.4],
  ["gpt-4o", 2.5, 10],
  ["gpt-4o-mini", 0.15, 0.6],
  // o-series
  ["o3", 10, 40],
  ["o3-mini", 1.1, 4.4],
  ["o3-pro", 20, 80],
  ["o4-mini", 1.1, 4.4],
  // Gemini
  ["gemini-2.5-pro", 1.25, 10],
  ["gemini-2.5-flash", 0.15, 0.6],
  ["gemini-2.0-flash", 0.1, 0.4],
  // DeepSeek
  ["deepseek-chat", 0.28, 0.42],
  ["deepseek-reasoner", 0.28, 0.42],
];

export function seedPresets(db: BetterSqlite3.Database): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO model_prices
      (model_name, input_price, output_price, cache_read_price, cache_write_price, source)
    VALUES (?, ?, ?, 0, 0, 'preset')
  `);
  const tx = db.transaction(() => {
    for (const [name, input, output] of PRESETS) {
      insert.run(name, input, output);
    }
  });
  tx();
}
