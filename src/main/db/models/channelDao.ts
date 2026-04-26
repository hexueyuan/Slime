import type BetterSqlite3 from "better-sqlite3";
import type { Channel, ChannelKey } from "@shared/types/gateway";

interface ChannelRow {
  id: number;
  name: string;
  type: string;
  base_urls: string;
  models: string;
  enabled: number;
  priority: number;
  weight: number;
  proxy: string | null;
  timeout: number | null;
  created_at: string;
  updated_at: string;
}

interface ChannelKeyRow {
  id: number;
  channel_id: number;
  key: string;
  enabled: number;
  created_at: string;
}

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Channel["type"],
    baseUrls: JSON.parse(row.base_urls),
    models: JSON.parse(row.models),
    enabled: !!row.enabled,
    priority: row.priority,
    weight: row.weight,
    proxy: row.proxy ?? undefined,
    timeout: row.timeout ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChannelKey(row: ChannelKeyRow): ChannelKey {
  return {
    id: row.id,
    channelId: row.channel_id,
    key: row.key,
    enabled: !!row.enabled,
    createdAt: row.created_at,
  };
}

export function listChannels(db: BetterSqlite3.Database): Channel[] {
  const rows = db
    .prepare("SELECT * FROM channels ORDER BY priority DESC, id")
    .all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export function getChannel(db: BetterSqlite3.Database, id: number): Channel | undefined {
  const row = db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | undefined;
  return row ? rowToChannel(row) : undefined;
}

export function createChannel(
  db: BetterSqlite3.Database,
  data: Omit<Channel, "id" | "createdAt" | "updatedAt">,
): Channel {
  const stmt = db.prepare(`
    INSERT INTO channels (name, type, base_urls, models, enabled, priority, weight, proxy, timeout)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.type,
    JSON.stringify(data.baseUrls),
    JSON.stringify(data.models),
    data.enabled ? 1 : 0,
    data.priority,
    data.weight,
    data.proxy ?? null,
    data.timeout ?? null,
  );
  return getChannel(db, Number(result.lastInsertRowid))!;
}

export function updateChannel(
  db: BetterSqlite3.Database,
  id: number,
  data: Partial<Omit<Channel, "id" | "createdAt" | "updatedAt">>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    sets.push("name = ?");
    values.push(data.name);
  }
  if (data.type !== undefined) {
    sets.push("type = ?");
    values.push(data.type);
  }
  if (data.baseUrls !== undefined) {
    sets.push("base_urls = ?");
    values.push(JSON.stringify(data.baseUrls));
  }
  if (data.models !== undefined) {
    sets.push("models = ?");
    values.push(JSON.stringify(data.models));
  }
  if (data.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(data.enabled ? 1 : 0);
  }
  if (data.priority !== undefined) {
    sets.push("priority = ?");
    values.push(data.priority);
  }
  if (data.weight !== undefined) {
    sets.push("weight = ?");
    values.push(data.weight);
  }
  if (data.proxy !== undefined) {
    sets.push("proxy = ?");
    values.push(data.proxy);
  }
  if (data.timeout !== undefined) {
    sets.push("timeout = ?");
    values.push(data.timeout);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteChannel(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM channels WHERE id = ?").run(id);
}

export function listChannelKeys(db: BetterSqlite3.Database, channelId: number): ChannelKey[] {
  const rows = db
    .prepare("SELECT * FROM channel_keys WHERE channel_id = ? ORDER BY id")
    .all(channelId) as ChannelKeyRow[];
  return rows.map(rowToChannelKey);
}

export function addChannelKey(
  db: BetterSqlite3.Database,
  channelId: number,
  key: string,
): ChannelKey {
  const result = db
    .prepare("INSERT INTO channel_keys (channel_id, key) VALUES (?, ?)")
    .run(channelId, key);
  const row = db
    .prepare("SELECT * FROM channel_keys WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ChannelKeyRow;
  return rowToChannelKey(row);
}

export function removeChannelKey(db: BetterSqlite3.Database, id: number): void {
  db.prepare("DELETE FROM channel_keys WHERE id = ?").run(id);
}
