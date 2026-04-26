import type BetterSqlite3 from "better-sqlite3";
import type { DailyStats, ModelStats, ChannelStats } from "@shared/types/gateway";

export function aggregateToHourly(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(`
    INSERT OR REPLACE INTO stats_hourly
      (date, hour, model_name, channel_id, requests, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, cost)
    SELECT
      date(created_at) AS date,
      CAST(strftime('%H', created_at) AS INTEGER) AS hour,
      model_name,
      COALESCE(channel_id, 0),
      COUNT(*),
      SUM(input_tokens),
      SUM(output_tokens),
      SUM(cache_read_tokens),
      SUM(cache_write_tokens),
      SUM(cost)
    FROM relay_logs
    WHERE created_at < ?
    GROUP BY date, hour, model_name, COALESCE(channel_id, 0)
  `)
    .run(beforeDate);
  return result.changes;
}

export function aggregateToDaily(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(`
    INSERT OR REPLACE INTO stats_daily
      (date, model_name, channel_id, requests, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, cost)
    SELECT
      date,
      model_name,
      channel_id,
      SUM(requests),
      SUM(input_tokens),
      SUM(output_tokens),
      SUM(cache_read_tokens),
      SUM(cache_write_tokens),
      SUM(cost)
    FROM stats_hourly
    WHERE date < ?
    GROUP BY date, model_name, channel_id
  `)
    .run(beforeDate);
  return result.changes;
}

export function deleteHourlyBefore(db: BetterSqlite3.Database, date: string): number {
  return db.prepare("DELETE FROM stats_hourly WHERE date < ?").run(date).changes;
}

export function deleteDailyBefore(db: BetterSqlite3.Database, date: string): number {
  return db.prepare("DELETE FROM stats_daily WHERE date < ?").run(date).changes;
}

export function getStatsRange(db: BetterSqlite3.Database, from: string, to: string): DailyStats {
  const row = db
    .prepare(`
    SELECT
      COALESCE(SUM(requests), 0) AS requests,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
      COALESCE(SUM(cost), 0) AS cost
    FROM (
      SELECT requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost
      FROM stats_daily WHERE date >= ? AND date < ?
      UNION ALL
      SELECT 1, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost
      FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
    )
  `)
    .get(from, to, from, to) as Record<string, number>;

  return {
    requests: row.requests,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cost: row.cost,
  };
}

export function getStatsByModel(
  db: BetterSqlite3.Database,
  from?: string,
  to?: string,
): ModelStats[] {
  let sql = `
    SELECT
      model_name,
      COALESCE(SUM(requests), 0) AS requests,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
      COALESCE(SUM(cost), 0) AS cost
    FROM stats_daily
  `;
  const params: string[] = [];
  if (from && to) {
    sql += " WHERE date >= ? AND date < ?";
    params.push(from, to);
  }
  sql += " GROUP BY model_name ORDER BY cost DESC";

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    modelName: r.model_name as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}

export function getStatsByChannel(
  db: BetterSqlite3.Database,
  from?: string,
  to?: string,
): ChannelStats[] {
  let sql = `
    SELECT
      d.channel_id,
      COALESCE(c.name, 'unknown') AS channel_name,
      COALESCE(SUM(d.requests), 0) AS requests,
      COALESCE(SUM(d.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(d.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(d.cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(d.cache_write_tokens), 0) AS cache_write_tokens,
      COALESCE(SUM(d.cost), 0) AS cost
    FROM stats_daily d
    LEFT JOIN channels c ON c.id = d.channel_id
  `;
  const params: string[] = [];
  if (from && to) {
    sql += " WHERE d.date >= ? AND d.date < ?";
    params.push(from, to);
  }
  sql += " GROUP BY d.channel_id ORDER BY cost DESC";

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    channelId: r.channel_id as number,
    channelName: r.channel_name as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}
