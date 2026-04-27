import type BetterSqlite3 from "better-sqlite3";
import type { RelayLog } from "@shared/types/gateway";

interface LogRow {
  id: number;
  api_key_id: number | null;
  api_key_name: string | null;
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
  ttft_ms: number | null;
  status: string;
  error: string | null;
  request_body: string | null;
  response_body: string | null;
  created_at: string;
}

function rowToLog(row: LogRow): RelayLog {
  return {
    id: row.id,
    apiKeyId: row.api_key_id ?? undefined,
    apiKeyName: row.api_key_name ?? undefined,
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
    ttftMs: row.ttft_ms,
    status: row.status as RelayLog["status"],
    error: row.error ?? undefined,
    requestBody: row.request_body ?? undefined,
    responseBody: row.response_body ?? undefined,
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
       cost, duration_ms, status, error, request_body, response_body, ttft_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        log.requestBody ?? null,
        log.responseBody ?? null,
        log.ttftMs ?? null,
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
    .prepare(
      `SELECT l.id, l.api_key_id, ak.name AS api_key_name, l.group_name, l.channel_id, l.channel_name, l.model_name,
              l.input_tokens, l.output_tokens, l.cache_read_tokens, l.cache_write_tokens,
              l.cost, l.duration_ms, l.ttft_ms, l.status, l.error, l.created_at
       FROM relay_logs l
       LEFT JOIN api_keys ak ON ak.id = l.api_key_id
       ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as LogRow[];
  return rows.map(rowToLog);
}

export function getLogDetail(db: BetterSqlite3.Database, id: number): RelayLog | undefined {
  const row = db
    .prepare(
      `SELECT l.*, ak.name AS api_key_name
       FROM relay_logs l
       LEFT JOIN api_keys ak ON ak.id = l.api_key_id
       WHERE l.id = ?`,
    )
    .get(id) as LogRow | undefined;
  return row ? rowToLog(row) : undefined;
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
