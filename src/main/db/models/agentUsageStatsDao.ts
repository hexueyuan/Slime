import type BetterSqlite3 from "better-sqlite3";
import type { UsageStatsRecord } from "@shared/types/agent";

interface UsageStatsRow {
  message_id: string;
  session_id: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  estimated_cost_usd: number | null;
  created_at: number;
}

function rowToUsageStats(row: UsageStatsRow): UsageStatsRecord {
  return {
    messageId: row.message_id,
    sessionId: row.session_id,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    cachedInputTokens: row.cached_input_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    createdAt: row.created_at,
  };
}

export function createUsageStats(
  db: BetterSqlite3.Database,
  data: {
    messageId: string;
    sessionId: string;
    model?: string | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    estimatedCostUsd?: number | null;
    createdAt?: number;
  },
): UsageStatsRecord {
  const now = data.createdAt ?? Date.now();
  db.prepare(
    `INSERT INTO agent_usage_stats (message_id, session_id, model, input_tokens, output_tokens, total_tokens, cached_input_tokens, estimated_cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.messageId,
    data.sessionId,
    data.model ?? null,
    data.inputTokens,
    data.outputTokens,
    data.totalTokens,
    data.cachedInputTokens,
    data.estimatedCostUsd ?? null,
    now,
  );
  const row = db
    .prepare("SELECT * FROM agent_usage_stats WHERE message_id = ?")
    .get(data.messageId) as UsageStatsRow;
  return rowToUsageStats(row);
}

export function getBySession(db: BetterSqlite3.Database, sessionId: string): UsageStatsRecord[] {
  const rows = db
    .prepare("SELECT * FROM agent_usage_stats WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as UsageStatsRow[];
  return rows.map(rowToUsageStats);
}
