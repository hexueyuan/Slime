import type BetterSqlite3 from "better-sqlite3";
import type { Agent, AgentAvatar, AgentConfig, AgentType } from "@shared/types/agent";

interface AgentRow {
  id: string;
  name: string;
  type: string;
  enabled: number;
  protected: number;
  description: string | null;
  avatar_json: string | null;
  config_json: string | null;
  created_at: number;
  updated_at: number;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AgentType,
    enabled: !!row.enabled,
    protected: !!row.protected,
    description: row.description ?? undefined,
    avatar: row.avatar_json ? (JSON.parse(row.avatar_json) as AgentAvatar) : undefined,
    config: row.config_json ? (JSON.parse(row.config_json) as AgentConfig) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listAgents(db: BetterSqlite3.Database): Agent[] {
  const rows = db
    .prepare("SELECT * FROM agents WHERE enabled = 1 ORDER BY protected DESC, updated_at DESC")
    .all() as AgentRow[];
  return rows.map(rowToAgent);
}

export function getAgentById(db: BetterSqlite3.Database, id: string): Agent | undefined {
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  return row ? rowToAgent(row) : undefined;
}

export function createAgent(
  db: BetterSqlite3.Database,
  data: Omit<Agent, "createdAt" | "updatedAt">,
): Agent {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agents (id, name, type, enabled, protected, description, avatar_json, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.name,
    data.type,
    data.enabled ? 1 : 0,
    data.protected ? 1 : 0,
    data.description ?? null,
    data.avatar != null ? JSON.stringify(data.avatar) : null,
    data.config != null ? JSON.stringify(data.config) : null,
    now,
    now,
  );
  return getAgentById(db, data.id)!;
}

export function updateAgent(
  db: BetterSqlite3.Database,
  id: string,
  data: Partial<Omit<Agent, "id" | "createdAt" | "updatedAt">>,
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
  if (data.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(data.enabled ? 1 : 0);
  }
  if (data.protected !== undefined) {
    sets.push("protected = ?");
    values.push(data.protected ? 1 : 0);
  }
  if (data.description !== undefined) {
    sets.push("description = ?");
    values.push(data.description ?? null);
  }
  if (data.avatar !== undefined) {
    sets.push("avatar_json = ?");
    values.push(data.avatar != null ? JSON.stringify(data.avatar) : null);
  }
  if (data.config !== undefined) {
    sets.push("config_json = ?");
    values.push(data.config != null ? JSON.stringify(data.config) : null);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  db.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function removeAgent(db: BetterSqlite3.Database, id: string): void {
  const row = db.prepare("SELECT protected FROM agents WHERE id = ?").get(id) as
    | { protected: number }
    | undefined;
  if (row && row.protected) {
    throw new Error("Cannot delete protected agent");
  }
  db.prepare("DELETE FROM agents WHERE id = ?").run(id);
}

export function ensureBuiltin(db: BetterSqlite3.Database): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO agents (id, name, type, enabled, protected, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "hal-ai",
    "HalAI",
    "builtin",
    1,
    1,
    JSON.stringify({ capabilityRequirements: ["reasoning"], subagentEnabled: false }),
    now,
    now,
  );
  // Migrate existing hal-ai from ["chat"] to ["reasoning"]
  db.prepare(
    `UPDATE agents SET config_json = json_set(config_json, '$.capabilityRequirements', json('["reasoning"]'))
     WHERE id = 'hal-ai' AND json_extract(config_json, '$.capabilityRequirements[0]') = 'chat'`,
  ).run();
}
