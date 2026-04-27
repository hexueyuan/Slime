import type BetterSqlite3 from "better-sqlite3";
import type { Model, Capability, ModelType } from "@shared/types/gateway";

interface ModelRow {
  id: number;
  channel_id: number;
  model_name: string;
  model_type: string;
  capabilities: string;
  priority: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function rowToModel(row: ModelRow): Model {
  return {
    id: row.id,
    channelId: row.channel_id,
    modelName: row.model_name,
    type: (row.model_type as ModelType) ?? "chat",
    capabilities: JSON.parse(row.capabilities) as Capability[],
    priority: row.priority,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listModels(db: BetterSqlite3.Database): Model[] {
  const rows = db.prepare("SELECT * FROM models ORDER BY priority DESC, id").all() as ModelRow[];
  return rows.map(rowToModel);
}

export function listModelsByChannel(db: BetterSqlite3.Database, channelId: number): Model[] {
  const rows = db
    .prepare("SELECT * FROM models WHERE channel_id = ? ORDER BY priority DESC, id")
    .all(channelId) as ModelRow[];
  return rows.map(rowToModel);
}

export function getModel(db: BetterSqlite3.Database, id: number): Model | undefined {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as ModelRow | undefined;
  return row ? rowToModel(row) : undefined;
}

export function createModel(
  db: BetterSqlite3.Database,
  data: Omit<Model, "id" | "type" | "createdAt" | "updatedAt"> & { type?: ModelType },
): Model {
  const result = db
    .prepare(
      "INSERT INTO models (channel_id, model_name, model_type, capabilities, priority, enabled) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      data.channelId,
      data.modelName,
      data.type ?? "chat",
      JSON.stringify(data.capabilities),
      data.priority,
      data.enabled ? 1 : 0,
    );
  return getModel(db, Number(result.lastInsertRowid))!;
}

export function updateModel(
  db: BetterSqlite3.Database,
  id: number,
  data: Partial<Omit<Model, "id" | "channelId" | "createdAt" | "updatedAt">>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.modelName !== undefined) {
    sets.push("model_name = ?");
    values.push(data.modelName);
  }
  if (data.type !== undefined) {
    sets.push("model_type = ?");
    values.push(data.type);
  }
  if (data.capabilities !== undefined) {
    sets.push("capabilities = ?");
    values.push(JSON.stringify(data.capabilities));
  }
  if (data.priority !== undefined) {
    sets.push("priority = ?");
    values.push(data.priority);
  }
  if (data.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(data.enabled ? 1 : 0);
  }

  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE models SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteModel(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM models WHERE id = ?").run(id);
}
