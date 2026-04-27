import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { paths } from "@/utils";

let db: BetterSqlite3.Database | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai',
  base_urls TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1,
  proxy TEXT,
  timeout INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  models TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_keys_channel ON channel_keys(channel_id);

CREATE TABLE IF NOT EXISTS groups_ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  balance_mode TEXT NOT NULL DEFAULT 'round_robin',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (group_id) REFERENCES groups_(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_group_items_group ON group_items(group_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_internal INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  max_cost REAL,
  allowed_models TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL UNIQUE,
  input_price REAL NOT NULL DEFAULT 0,
  output_price REAL NOT NULL DEFAULT 0,
  cache_read_price REAL NOT NULL DEFAULT 0,
  cache_write_price REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relay_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER,
  group_name TEXT NOT NULL,
  channel_id INTEGER,
  channel_name TEXT,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_relay_logs_created ON relay_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_relay_logs_model ON relay_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_relay_logs_channel ON relay_logs(channel_id);

CREATE TABLE IF NOT EXISTS stats_hourly (
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  channel_id INTEGER NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, hour, model_name, channel_id)
);

CREATE TABLE IF NOT EXISTS stats_daily (
  date TEXT NOT NULL,
  model_name TEXT NOT NULL,
  channel_id INTEGER NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model_name, channel_id)
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, model_name),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_models_channel ON models(channel_id);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  protected INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  avatar_json TEXT,
  config_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_enabled ON agents(enabled);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  session_kind TEXT NOT NULL DEFAULT 'regular',
  parent_session_id TEXT,
  subagent_meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_session_configs (
  id TEXT PRIMARY KEY,
  capability_requirements TEXT NOT NULL DEFAULT '["chat"]',
  system_prompt TEXT,
  temperature REAL,
  context_length INTEGER,
  max_tokens INTEGER,
  thinking_budget INTEGER,
  summary_text TEXT,
  summary_cursor_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  is_context_edge INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, order_seq);

CREATE TABLE IF NOT EXISTS agent_usage_stats (
  message_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_usage_session ON agent_usage_stats(session_id);
`;

function createDb(dbPath: string): BetterSqlite3.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(DDL);
  // Migration: add models column to channels if missing
  try {
    instance.exec("ALTER TABLE channels ADD COLUMN models TEXT NOT NULL DEFAULT '[]'");
  } catch {
    // column already exists
  }
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN request_body TEXT");
  } catch {
    // column already exists
  }
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN response_body TEXT");
  } catch {
    // column already exists
  }
  try {
    instance.exec("ALTER TABLE groups_ ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0");
  } catch {
    // column already exists
  }
  try {
    instance.exec("ALTER TABLE agent_sessions ADD COLUMN metadata_json TEXT");
  } catch {
    // column already exists
  }
  return instance;
}

export function initDb(dbPath?: string): BetterSqlite3.Database {
  if (db) {
    db.close();
    db = null;
  }
  const resolvedPath = dbPath ?? join(paths.slimeDir, "gateway.db");
  db = createDb(resolvedPath);
  return db;
}

export function getDb(): BetterSqlite3.Database {
  if (!db) {
    db = createDb(join(paths.slimeDir, "gateway.db"));
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
