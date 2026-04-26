import type BetterSqlite3 from "better-sqlite3";
import type { GatewayApiKey } from "@shared/types/gateway";

interface ApiKeyRow {
  id: number;
  name: string;
  key: string;
  enabled: number;
  is_internal: number;
  expires_at: string | null;
  max_cost: number | null;
  allowed_models: string | null;
  created_at: string;
}

function rowToApiKey(row: ApiKeyRow): GatewayApiKey {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    enabled: !!row.enabled,
    isInternal: !!row.is_internal,
    expiresAt: row.expires_at ?? undefined,
    maxCost: row.max_cost ?? undefined,
    allowedModels: row.allowed_models ? JSON.parse(row.allowed_models) : undefined,
    createdAt: row.created_at,
  };
}

export function listApiKeys(db: BetterSqlite3.Database): GatewayApiKey[] {
  const rows = db.prepare("SELECT * FROM api_keys ORDER BY id").all() as ApiKeyRow[];
  return rows.map(rowToApiKey);
}

export function getApiKeyByKey(db: BetterSqlite3.Database, key: string): GatewayApiKey | undefined {
  const row = db.prepare("SELECT * FROM api_keys WHERE key = ?").get(key) as ApiKeyRow | undefined;
  return row ? rowToApiKey(row) : undefined;
}

export function createApiKey(
  db: BetterSqlite3.Database,
  data: Omit<GatewayApiKey, "id" | "createdAt">,
): GatewayApiKey {
  const stmt = db.prepare(`
    INSERT INTO api_keys (name, key, enabled, is_internal, expires_at, max_cost, allowed_models)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.key,
    data.enabled ? 1 : 0,
    data.isInternal ? 1 : 0,
    data.expiresAt ?? null,
    data.maxCost ?? null,
    data.allowedModels ? JSON.stringify(data.allowedModels) : null,
  );
  const row = db
    .prepare("SELECT * FROM api_keys WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ApiKeyRow;
  return rowToApiKey(row);
}

export function updateApiKey(
  db: BetterSqlite3.Database,
  id: number,
  data: Partial<Omit<GatewayApiKey, "id" | "createdAt">>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    values.push(data.name);
  }
  if (data.key !== undefined) {
    sets.push("key = ?");
    values.push(data.key);
  }
  if (data.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(data.enabled ? 1 : 0);
  }
  if (data.isInternal !== undefined) {
    sets.push("is_internal = ?");
    values.push(data.isInternal ? 1 : 0);
  }
  if (data.expiresAt !== undefined) {
    sets.push("expires_at = ?");
    values.push(data.expiresAt);
  }
  if (data.maxCost !== undefined) {
    sets.push("max_cost = ?");
    values.push(data.maxCost);
  }
  if (data.allowedModels !== undefined) {
    sets.push("allowed_models = ?");
    values.push(data.allowedModels ? JSON.stringify(data.allowedModels) : null);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE api_keys SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteApiKey(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
}

export function getInternalKey(db: BetterSqlite3.Database): GatewayApiKey | undefined {
  const row = db.prepare("SELECT * FROM api_keys WHERE is_internal = 1 LIMIT 1").get() as
    | ApiKeyRow
    | undefined;
  return row ? rowToApiKey(row) : undefined;
}
