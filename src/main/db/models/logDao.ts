import type BetterSqlite3 from "better-sqlite3";
import type { RelayLog } from "@shared/types/gateway";

interface LogRow {
  id: number;
  api_key_id: number | null;
  group_name: string;
  channel_id: number | null;
  channel_name: string | null;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
  duration_ms: number;
  status: string;
  error: string | null;
  created_at: string;
}

function rowToLog(row: LogRow): RelayLog {
  return {
    id: row.id,
    apiKeyId: row.api_key_id ?? undefined,
    groupName: row.group_name,
    channelId: row.channel_id ?? undefined,
    channelName: row.channel_name ?? undefined,
    modelName: row.model_name,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cost: row.cost,
    durationMs: row.duration_ms,
    status: row.status as RelayLog["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

export function insertLogs(
  db: BetterSqlite3.Database,
  logs: Omit<RelayLog, "id" | "createdAt">[],
): void {
  const insert = db.prepare(`
    INSERT INTO relay_logs
      (api_key_id, group_name, channel_id, channel_name, model_name,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost, duration_ms, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const log of logs) {
      insert.run(
        log.apiKeyId ?? null,
        log.groupName,
        log.channelId ?? null,
        log.channelName ?? null,
        log.modelName,
        log.inputTokens,
        log.outputTokens,
        log.cacheReadTokens,
        log.cacheWriteTokens,
        log.cost,
        log.durationMs,
        log.status,
        log.error ?? null,
      );
    }
  });
  tx();
}

export function getRecentLogs(
  db: BetterSqlite3.Database,
  limit: number,
  offset: number,
): RelayLog[] {
  const rows = db
    .prepare("SELECT * FROM relay_logs ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as LogRow[];
  return rows.map(rowToLog);
}

export function getLogsByDateRange(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): RelayLog[] {
  const rows = db
    .prepare("SELECT * FROM relay_logs WHERE created_at >= ? AND created_at < ? ORDER BY id DESC")
    .all(from, to) as LogRow[];
  return rows.map(rowToLog);
}

export function deleteLogsBefore(db: BetterSqlite3.Database, date: string): number {
  const result = db.prepare("DELETE FROM relay_logs WHERE created_at < ?").run(date);
  return result.changes;
}
