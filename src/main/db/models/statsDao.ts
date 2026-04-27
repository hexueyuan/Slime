import type BetterSqlite3 from "better-sqlite3";
import type {
  DailyStats,
  ModelStats,
  ChannelStats,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "@shared/types/gateway";

export function aggregateToHourly(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(
      `INSERT OR REPLACE INTO stats_hourly
        (date, hour, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, success_count, fail_count, avg_latency_ms)
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
        SUM(cost),
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),
        AVG(duration_ms)
      FROM relay_logs
      WHERE created_at < ?
      GROUP BY date, hour, model_name, COALESCE(channel_id, 0)`,
    )
    .run(beforeDate);
  return result.changes;
}

export function aggregateToDaily(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(
      `INSERT OR REPLACE INTO stats_daily
        (date, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, success_count, fail_count, avg_latency_ms)
      SELECT
        date,
        model_name,
        channel_id,
        SUM(requests),
        SUM(input_tokens),
        SUM(output_tokens),
        SUM(cache_read_tokens),
        SUM(cache_write_tokens),
        SUM(cost),
        SUM(success_count),
        SUM(fail_count),
        SUM(avg_latency_ms * (success_count + fail_count)) /
          NULLIF(SUM(success_count + fail_count), 0)
      FROM stats_hourly
      WHERE date < ?
      GROUP BY date, model_name, channel_id`,
    )
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
    .prepare(
      `SELECT
        COALESCE(SUM(requests), 0) AS requests,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(weighted) / NULLIF(SUM(cnt), 0), 0) AS avg_latency_ms
      FROM (
        SELECT requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost,
               avg_latency_ms * requests AS weighted, requests AS cnt
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT 1, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost,
               duration_ms AS weighted, 1 AS cnt
        FROM relay_logs
        WHERE date(created_at) >= ? AND date(created_at) < ?
          AND date(created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )`,
    )
    .get(from, to, from, to, from, to) as Record<string, number>;

  return {
    requests: row.requests,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cost: row.cost,
    avgLatencyMs: row.avg_latency_ms,
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

export function getChannelRanking(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): ChannelRankItem[] {
  const rows = db
    .prepare(
      `SELECT
        channel_id,
        MAX(channel_name) AS channel_name,
        SUM(requests) AS requests,
        SUM(success_count) AS success_count,
        SUM(fail_count) AS fail_count,
        SUM(weighted_latency) / NULLIF(SUM(requests), 0) AS avg_latency_ms,
        SUM(cost) AS cost
      FROM (
        SELECT d.channel_id, COALESCE(c.name, 'unknown') AS channel_name,
               d.requests, d.success_count, d.fail_count,
               d.avg_latency_ms * d.requests AS weighted_latency, d.cost
        FROM stats_daily d LEFT JOIN channels c ON c.id = d.channel_id
        WHERE d.date >= ? AND d.date < ?
        UNION ALL
        SELECT COALESCE(l.channel_id, 0), COALESCE(c.name, 'unknown'),
               1,
               CASE WHEN l.status = 'success' THEN 1 ELSE 0 END,
               CASE WHEN l.status = 'error' THEN 1 ELSE 0 END,
               l.duration_ms, l.cost
        FROM relay_logs l LEFT JOIN channels c ON c.id = l.channel_id
        WHERE date(l.created_at) >= ? AND date(l.created_at) < ?
          AND date(l.created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY channel_id
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    channelId: r.channel_id as number,
    channelName: r.channel_name as string,
    requests: r.requests as number,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
    cost: r.cost as number,
  }));
}

export function getModelRanking(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): ModelRankItem[] {
  const rows = db
    .prepare(
      `SELECT
        model_name,
        SUM(requests) AS requests,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cost) AS cost
      FROM (
        SELECT model_name, requests, input_tokens, output_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT model_name, 1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND date(created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY model_name
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    modelName: r.model_name as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}

export function getLatencyPercentiles(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
  channelId?: number,
): LatencyPercentiles {
  const extra = channelId !== undefined ? " AND channel_id = ?" : "";
  const params: (string | number)[] = [from, to];
  if (channelId !== undefined) params.push(channelId);

  const { cnt } = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra}`,
    )
    .get(...params) as { cnt: number };

  if (cnt === 0) return { p50: 0, p95: 0, ttftP50: null };

  const p50Offset = Math.max(0, Math.floor(cnt * 0.5) - 1);
  const p95Offset = Math.max(0, Math.floor(cnt * 0.95) - 1);
  const durationSql = `SELECT duration_ms FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} ORDER BY duration_ms LIMIT 1 OFFSET ?`;

  const p50Row = db.prepare(durationSql).get(...params, p50Offset) as { duration_ms: number };
  const p95Row = db.prepare(durationSql).get(...params, p95Offset) as { duration_ms: number };

  const { cnt: ttftCnt } = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} AND ttft_ms IS NOT NULL`,
    )
    .get(...params) as { cnt: number };

  let ttftP50: number | null = null;
  if (ttftCnt > 0) {
    const ttftOffset = Math.max(0, Math.floor(ttftCnt * 0.5) - 1);
    const ttftRow = db
      .prepare(
        `SELECT ttft_ms FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} AND ttft_ms IS NOT NULL ORDER BY ttft_ms LIMIT 1 OFFSET ?`,
      )
      .get(...params, ttftOffset) as { ttft_ms: number };
    ttftP50 = ttftRow.ttft_ms;
  }

  return { p50: p50Row.duration_ms, p95: p95Row.duration_ms, ttftP50 };
}

export function getChannelStabilityHourly(
  db: BetterSqlite3.Database,
  channelId: number,
  from: string,
  to: string,
): StabilityPoint[] {
  const rows = db
    .prepare(
      `SELECT
        date || 'T' || printf('%02d', hour) AS hour,
        SUM(success_count) AS success_count,
        SUM(fail_count) AS fail_count,
        SUM(avg_latency_ms * (success_count + fail_count)) /
          NULLIF(SUM(success_count + fail_count), 0) AS avg_latency_ms
      FROM stats_hourly
      WHERE channel_id = ? AND date >= ? AND date < ?
        AND (success_count + fail_count) > 0
      GROUP BY date, hour
      ORDER BY date, hour`,
    )
    .all(channelId, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    hour: r.hour as string,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
  }));
}

export function getStatsDailyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost
      FROM (
        SELECT date, requests, input_tokens, output_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at) AS date, 1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND date(created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY date ORDER BY date`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}

export function getStatsHourlyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, hour, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost
      FROM (
        SELECT date, hour, requests, input_tokens, output_tokens, cost
        FROM stats_hourly WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at), CAST(strftime('%H', created_at) AS INTEGER),
               1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND (date(created_at) || '_' || CAST(strftime('%H', created_at) AS INTEGER))
            NOT IN (SELECT date || '_' || hour FROM stats_hourly WHERE date >= ? AND date < ?)
      )
      GROUP BY date, hour ORDER BY date, hour`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    hour: r.hour as number,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}
