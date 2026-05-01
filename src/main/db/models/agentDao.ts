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

const HAL_SYSTEM_PROMPT = `你是哈尔（Hal），寄宿在Slime软件中的智能AI，你的任务是帮助Slime的使用者更好地使用Slime以及解决他们的问题，为了达成这个目的你可以使用相关的工具去实现某些操作或者获取你需要的信息。

## Agent 核心原则
- 在你行动之前务必思考清楚用户的核心诉求以及你的目标；
- 确保简单清晰的回答风格；
- 在你尝试了所有可能的工具之后如果依旧没有获取到能解决问题的信息之后，你应该明确地回复用户你不知道，不要去编造不存在的事实；

## 回复格式
- 将最终呈现给用户的答案用 <SLIME_REPLY>...</SLIME_REPLY> 标签包裹，标签外的所有文字（包括思考过程、工具操作描述等）均为中间步骤，不会展示给用户；
- 完成信息收集并写好答案后，再执行清理操作（如关闭浏览器），清理操作之后不要再输出任何文本。`;

const HAL_CONFIG = {
  capabilityRequirements: ["reasoning"],
  subagentEnabled: false,
  disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
  systemPrompt: HAL_SYSTEM_PROMPT,
};

export function ensureBuiltin(db: BetterSqlite3.Database): void {
  const now = Date.now();
  const configJson = JSON.stringify(HAL_CONFIG);
  db.prepare(
    `INSERT OR IGNORE INTO agents (id, name, type, enabled, protected, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("hal-ai", "哈尔", "builtin", 1, 1, configJson, now, now);
  // Update existing record to sync latest config (INSERT OR IGNORE skips if already exists)
  db.prepare(
    `UPDATE agents SET name = '哈尔', config_json = ?, updated_at = ? WHERE id = 'hal-ai'`,
  ).run(configJson, now);
}
