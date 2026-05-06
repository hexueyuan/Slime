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
  MinutePoint,
} from "@shared/types/gateway";

export function aggregateToHourly(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(
      `INSERT OR REPLACE INTO stats_hourly
        (date, hour, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, success_count, fail_count, avg_latency_ms)
      SELECT
        log_date AS date,
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
        WHERE log_date >= ? AND log_date < ?
          AND log_date NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
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
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(weighted_latency) / NULLIF(SUM(requests), 0) AS avg_latency_ms,
        SUM(cost) AS cost
      FROM (
        SELECT d.channel_id, COALESCE(c.name, 'unknown') AS channel_name,
               d.requests, d.success_count, d.fail_count,
               d.cache_read_tokens, d.cache_write_tokens,
               d.avg_latency_ms * d.requests AS weighted_latency, d.cost
        FROM stats_daily d LEFT JOIN channels c ON c.id = d.channel_id
        WHERE d.date >= ? AND d.date < ?
        UNION ALL
        SELECT COALESCE(l.channel_id, 0), COALESCE(c.name, 'unknown'),
               1,
               CASE WHEN l.status = 'success' THEN 1 ELSE 0 END,
               CASE WHEN l.status = 'error' THEN 1 ELSE 0 END,
               l.cache_read_tokens, l.cache_write_tokens,
               CASE WHEN l.status = 'success' THEN l.duration_ms END, l.cost
        FROM relay_logs l LEFT JOIN channels c ON c.id = l.channel_id
        WHERE l.log_date >= ? AND l.log_date < ?
          AND l.log_date NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
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
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
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
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(cost) AS cost
      FROM (
        SELECT model_name, requests, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT model_name, 1, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, cost
        FROM relay_logs WHERE log_date >= ? AND log_date < ?
          AND log_date NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
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
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
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

  // Single query to get count + p50 + p95 via window function
  const row = db
    .prepare(
      `WITH ordered AS (
        SELECT duration_ms, ttft_ms,
               ROW_NUMBER() OVER (ORDER BY duration_ms) AS rn,
               COUNT(*) OVER () AS cnt
        FROM relay_logs
        WHERE log_date >= ? AND log_date < ?${extra}
      )
      SELECT
        cnt,
        MAX(CASE WHEN rn = MAX(1, cnt * 50 / 100) THEN duration_ms END) AS p50,
        MAX(CASE WHEN rn = MAX(1, cnt * 95 / 100) THEN duration_ms END) AS p95
      FROM ordered`,
    )
    .get(...params) as { cnt: number; p50: number | null; p95: number | null } | undefined;

  if (!row || row.cnt === 0) return { p50: 0, p95: 0, ttftP50: null };

  // TTFT p50 separately (only rows with ttft_ms)
  let ttftP50: number | null = null;
  const ttftRow = db
    .prepare(
      `WITH ordered AS (
        SELECT ttft_ms,
               ROW_NUMBER() OVER (ORDER BY ttft_ms) AS rn,
               COUNT(*) OVER () AS cnt
        FROM relay_logs
        WHERE log_date >= ? AND log_date < ?${extra} AND ttft_ms IS NOT NULL
      )
      SELECT MAX(CASE WHEN rn = MAX(1, cnt * 50 / 100) THEN ttft_ms END) AS p50
      FROM ordered`,
    )
    .get(...params) as { p50: number | null } | undefined;
  if (ttftRow?.p50 != null) ttftP50 = ttftRow.p50;

  return { p50: row.p50 ?? 0, p95: row.p95 ?? 0, ttftP50 };
}

export function getChannelStabilityHourly(
  db: BetterSqlite3.Database,
  channelId: number,
  from: string,
  to: string,
): StabilityPoint[] {
  const rows = db
    .prepare(
      `SELECT hour,
              SUM(success_count) AS success_count,
              SUM(fail_count) AS fail_count,
              SUM(avg_latency_ms * (success_count + fail_count)) /
                NULLIF(SUM(success_count + fail_count), 0) AS avg_latency_ms
       FROM (
         SELECT date || 'T' || printf('%02d', hour) AS hour,
                success_count,
                fail_count,
                avg_latency_ms
         FROM stats_hourly
         WHERE channel_id = ? AND date >= ? AND date < ?
           AND (success_count + fail_count) > 0
         UNION ALL
         SELECT log_date || 'T' || printf('%02d', CAST(strftime('%H', created_at) AS INTEGER)),
                CASE WHEN status = 'success' THEN 1 ELSE 0 END,
                CASE WHEN status = 'error' THEN 1 ELSE 0 END,
                CASE WHEN status = 'success' THEN duration_ms END
         FROM relay_logs
         WHERE channel_id = ? AND log_date >= ? AND log_date < ?
           AND (log_date || '_' || CAST(strftime('%H', created_at) AS INTEGER))
             NOT IN (SELECT date || '_' || hour FROM stats_hourly WHERE channel_id = ? AND date >= ? AND date < ?)
       )
       GROUP BY hour
       HAVING SUM(success_count) + SUM(fail_count) > 0
       ORDER BY hour`,
    )
    .all(channelId, from, to, channelId, from, to, channelId, from, to) as Array<
    Record<string, unknown>
  >;

  return rows.map((r) => ({
    hour: r.hour as string,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
  }));
}

export function getChannelStabilityMinute(
  db: BetterSqlite3.Database,
  channelId: number,
): MinutePoint[] {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%dT%H:%M', created_at) AS minute,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS fail_count,
        AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_latency_ms
      FROM relay_logs
      WHERE channel_id = ?
        AND created_at >= ?
      GROUP BY minute
      ORDER BY minute`,
    )
    .all(channelId, since) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    minute: r.minute as string,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: r.avg_latency_ms !== null ? (r.avg_latency_ms as number) : null,
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
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(cache_write_tokens) AS cache_write_tokens
      FROM (
        SELECT date, requests, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT log_date AS date, 1, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM relay_logs WHERE log_date >= ? AND log_date < ?
          AND log_date NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY date ORDER BY date`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
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
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(cache_write_tokens) AS cache_write_tokens
      FROM (
        SELECT date, hour, requests, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM stats_hourly WHERE date >= ? AND date < ?
        UNION ALL
        SELECT log_date, CAST(strftime('%H', created_at) AS INTEGER),
               1, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM relay_logs WHERE log_date >= ? AND log_date < ?
          AND (log_date || '_' || CAST(strftime('%H', created_at) AS INTEGER))
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
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}
