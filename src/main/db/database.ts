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
  base_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  timeout INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  ttft_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error TEXT,
  request_body TEXT,
  response_body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

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
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
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
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model_name, channel_id)
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, model_name),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_models_channel ON models(channel_id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  session_kind TEXT NOT NULL DEFAULT 'regular',
  parent_session_id TEXT,
  subagent_meta_json TEXT,
  metadata_json TEXT,
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, order_seq);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  http_headers TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  description TEXT,
  input_schema TEXT NOT NULL,
  UNIQUE(server_id, tool_name)
);

CREATE TABLE IF NOT EXISTS session_mcp_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  disabled INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, tool_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  creator_type TEXT NOT NULL DEFAULT 'user',
  creator_id TEXT,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  assignee_id TEXT,
  scheduled_at INTEGER,
  repeat_interval INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_entries(date);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_chat_sessions (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  participant_agent_ids TEXT NOT NULL,
  moderator_enabled     INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES group_chat_sessions(id) ON DELETE CASCADE,
  order_seq        INTEGER NOT NULL,
  sender_agent_id  TEXT,
  role             TEXT NOT NULL,
  content          TEXT NOT NULL,
  hidden           INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_session ON group_chat_messages(session_id, order_seq);
`;

function migrate(instance: BetterSqlite3.Database): void {
  // Add raw_request_body column if it doesn't exist
  const cols = instance.prepare("PRAGMA table_info(relay_logs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "raw_request_body")) {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN raw_request_body TEXT");
  }
  // Add schedule tables if they don't exist (v0.5 migration)
  const tables = instance
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  if (!tables) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        detail TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE TABLE IF NOT EXISTS task_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_entries(date);
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }
  // Add extended fields to tasks table (creator/assignee/schedule)
  const taskCols = instance.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!taskCols.some((c) => c.name === "creator_type")) {
    instance.exec(`
      ALTER TABLE tasks ADD COLUMN creator_type TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE tasks ADD COLUMN creator_id TEXT;
      ALTER TABLE tasks ADD COLUMN assignee_type TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
      ALTER TABLE tasks ADD COLUMN scheduled_at INTEGER;
      ALTER TABLE tasks ADD COLUMN repeat_interval INTEGER;
    `);
  }
  // Ensure indexes exist (covers both fresh DB and migrated DB)
  instance.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_type, assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_scheduled ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;
  `);
  // Group chat tables migration (v0.9)
  const groupChatTable = instance
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='group_chat_sessions'")
    .get();
  if (!groupChatTable) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS group_chat_sessions (
        id                    TEXT PRIMARY KEY,
        title                 TEXT NOT NULL,
        participant_agent_ids TEXT NOT NULL,
        moderator_enabled     INTEGER NOT NULL DEFAULT 0,
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS group_chat_messages (
        id               TEXT PRIMARY KEY,
        session_id       TEXT NOT NULL REFERENCES group_chat_sessions(id) ON DELETE CASCADE,
        order_seq        INTEGER NOT NULL,
        sender_agent_id  TEXT,
        role             TEXT NOT NULL,
        content          TEXT NOT NULL,
        hidden           INTEGER NOT NULL DEFAULT 0,
        created_at       INTEGER NOT NULL
      );
    `);
    instance.exec(
      `CREATE INDEX IF NOT EXISTS idx_group_chat_messages_session ON group_chat_messages(session_id, order_seq);`,
    );
  }
  // Add log_date column to relay_logs for indexed date filtering
  // Try to add column; ignore if already exists
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN log_date TEXT NOT NULL DEFAULT ''");
    // Column was added, need to backfill and create indexes/trigger
    console.log("[migrate] log_date column added, creating trigger and indexes");
    instance.exec(`
      UPDATE relay_logs SET log_date = date(created_at) WHERE log_date = '';
      CREATE TRIGGER IF NOT EXISTS trg_relay_logs_set_log_date
      AFTER INSERT ON relay_logs WHEN NEW.log_date = ''
      BEGIN
        UPDATE relay_logs SET log_date = date(NEW.created_at) WHERE id = NEW.id;
      END;
      CREATE INDEX IF NOT EXISTS idx_relay_logs_created ON relay_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_relay_logs_model ON relay_logs(model_name);
      CREATE INDEX IF NOT EXISTS idx_relay_logs_channel ON relay_logs(channel_id);
      CREATE INDEX IF NOT EXISTS idx_relay_logs_log_date ON relay_logs(log_date);
      CREATE INDEX IF NOT EXISTS idx_relay_logs_date_channel ON relay_logs(log_date, channel_id);
      CREATE INDEX IF NOT EXISTS idx_relay_logs_date_duration ON relay_logs(log_date, duration_ms);
    `);
  } catch (e) {
    // Column might already exist or table might not have expected structure
    const cols = instance.prepare("PRAGMA table_info(relay_logs)").all() as { name: string }[];
    if (cols.some((c) => c.name === "log_date")) {
      // Column exists but indexes/trigger might be missing
      instance.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_relay_logs_set_log_date
        AFTER INSERT ON relay_logs WHEN NEW.log_date = ''
        BEGIN
          UPDATE relay_logs SET log_date = date(NEW.created_at) WHERE id = NEW.id;
        END;
        CREATE INDEX IF NOT EXISTS idx_relay_logs_created ON relay_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_relay_logs_model ON relay_logs(model_name);
        CREATE INDEX IF NOT EXISTS idx_relay_logs_channel ON relay_logs(channel_id);
        CREATE INDEX IF NOT EXISTS idx_relay_logs_log_date ON relay_logs(log_date);
        CREATE INDEX IF NOT EXISTS idx_relay_logs_date_channel ON relay_logs(log_date, channel_id);
        CREATE INDEX IF NOT EXISTS idx_relay_logs_date_duration ON relay_logs(log_date, duration_ms);
      `);
    } else {
      // Column doesn't exist - this shouldn't happen, but try to add it again
      console.error("[migrate] log_date column missing, table structure unexpected");
    }
  }
}

function createDb(dbPath: string): BetterSqlite3.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  try {
    instance.exec(DDL);
  } catch (e) {
    console.error("[createDb] DDL execution failed:", e);
    throw e;
  }
  try {
    migrate(instance);
  } catch (e) {
    console.error("[createDb] Migration failed:", e);
    throw e;
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
