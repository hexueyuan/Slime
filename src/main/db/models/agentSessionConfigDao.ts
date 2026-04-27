import type BetterSqlite3 from "better-sqlite3";
import type { SessionConfig } from "@shared/types/agent";

interface SessionConfigRow {
  id: string;
  capability_requirements: string;
  system_prompt: string | null;
  temperature: number | null;
  context_length: number | null;
  max_tokens: number | null;
  thinking_budget: number | null;
  summary_text: string | null;
  summary_cursor_seq: number;
}

function rowToConfig(row: SessionConfigRow): SessionConfig {
  return {
    id: row.id,
    capabilityRequirements: JSON.parse(row.capability_requirements) as string[],
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    contextLength: row.context_length,
    maxTokens: row.max_tokens,
    thinkingBudget: row.thinking_budget,
    summaryText: row.summary_text,
    summaryCursorSeq: row.summary_cursor_seq,
  };
}

export function createConfig(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    capabilityRequirements?: string[];
    systemPrompt?: string | null;
    temperature?: number | null;
    contextLength?: number | null;
    maxTokens?: number | null;
    thinkingBudget?: number | null;
  },
): SessionConfig {
  db.prepare(
    `INSERT INTO agent_session_configs (id, capability_requirements, system_prompt, temperature, context_length, max_tokens, thinking_budget)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    JSON.stringify(data.capabilityRequirements ?? ["reasoning"]),
    data.systemPrompt ?? null,
    data.temperature ?? null,
    data.contextLength ?? null,
    data.maxTokens ?? null,
    data.thinkingBudget ?? null,
  );
  return getConfigById(db, data.id)!;
}

export function getConfigById(db: BetterSqlite3.Database, id: string): SessionConfig | undefined {
  const row = db.prepare("SELECT * FROM agent_session_configs WHERE id = ?").get(id) as
    | SessionConfigRow
    | undefined;
  return row ? rowToConfig(row) : undefined;
}

export function updateConfig(
  db: BetterSqlite3.Database,
  id: string,
  partial: Partial<Omit<SessionConfig, "id">>,
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (partial.capabilityRequirements !== undefined) {
    sets.push("capability_requirements = ?");
    values.push(JSON.stringify(partial.capabilityRequirements));
  }
  if (partial.systemPrompt !== undefined) {
    sets.push("system_prompt = ?");
    values.push(partial.systemPrompt);
  }
  if (partial.temperature !== undefined) {
    sets.push("temperature = ?");
    values.push(partial.temperature);
  }
  if (partial.contextLength !== undefined) {
    sets.push("context_length = ?");
    values.push(partial.contextLength);
  }
  if (partial.maxTokens !== undefined) {
    sets.push("max_tokens = ?");
    values.push(partial.maxTokens);
  }
  if (partial.thinkingBudget !== undefined) {
    sets.push("thinking_budget = ?");
    values.push(partial.thinkingBudget);
  }
  if (partial.summaryText !== undefined) {
    sets.push("summary_text = ?");
    values.push(partial.summaryText);
  }
  if (partial.summaryCursorSeq !== undefined) {
    sets.push("summary_cursor_seq = ?");
    values.push(partial.summaryCursorSeq);
  }

  if (sets.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE agent_session_configs SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteConfig(db: BetterSqlite3.Database, id: string): void {
  db.prepare("DELETE FROM agent_session_configs WHERE id = ?").run(id);
}
