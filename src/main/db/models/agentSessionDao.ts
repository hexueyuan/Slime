import type BetterSqlite3 from "better-sqlite3";
import type { SessionRecord, SubagentMeta } from "@shared/types/agent";

interface SessionRow {
  id: string;
  agent_id: string;
  title: string;
  is_pinned: number;
  session_kind: string;
  parent_session_id: string | null;
  subagent_meta_json: string | null;
  created_at: number;
  updated_at: number;
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    isPinned: !!row.is_pinned,
    sessionKind: row.session_kind as SessionRecord["sessionKind"],
    parentSessionId: row.parent_session_id,
    subagentMeta: row.subagent_meta_json
      ? (JSON.parse(row.subagent_meta_json) as SubagentMeta)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSession(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    agentId: string;
    title: string;
    sessionKind?: "regular" | "subagent";
    parentSessionId?: string | null;
    subagentMeta?: SubagentMeta | null;
  },
): SessionRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_sessions (id, agent_id, title, session_kind, parent_session_id, subagent_meta_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.agentId,
    data.title,
    data.sessionKind ?? "regular",
    data.parentSessionId ?? null,
    data.subagentMeta != null ? JSON.stringify(data.subagentMeta) : null,
    now,
    now,
  );
  return getSessionById(db, data.id)!;
}

export function listSessions(db: BetterSqlite3.Database, agentId?: string): SessionRecord[] {
  if (agentId) {
    const rows = db
      .prepare(
        "SELECT * FROM agent_sessions WHERE agent_id = ? ORDER BY is_pinned DESC, updated_at DESC",
      )
      .all(agentId) as SessionRow[];
    return rows.map(rowToSession);
  }
  const rows = db
    .prepare("SELECT * FROM agent_sessions ORDER BY is_pinned DESC, updated_at DESC")
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function getSessionById(db: BetterSqlite3.Database, id: string): SessionRecord | undefined {
  const row = db.prepare("SELECT * FROM agent_sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return row ? rowToSession(row) : undefined;
}

export function updateTitle(db: BetterSqlite3.Database, id: string, title: string): void {
  db.prepare("UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function togglePin(db: BetterSqlite3.Database, id: string): void {
  db.prepare(
    "UPDATE agent_sessions SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END, updated_at = ? WHERE id = ?",
  ).run(Date.now(), id);
}

export function deleteSession(db: BetterSqlite3.Database, id: string): void {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM agent_session_configs WHERE id = ?").run(id);
    db.prepare("DELETE FROM agent_usage_stats WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM agent_messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM agent_sessions WHERE id = ?").run(id);
  });
  del();
}

export function deleteByAgent(db: BetterSqlite3.Database, agentId: string): void {
  const sessionIds = db
    .prepare("SELECT id FROM agent_sessions WHERE agent_id = ?")
    .all(agentId) as { id: string }[];

  const del = db.transaction(() => {
    for (const { id } of sessionIds) {
      db.prepare("DELETE FROM agent_session_configs WHERE id = ?").run(id);
      db.prepare("DELETE FROM agent_usage_stats WHERE session_id = ?").run(id);
      db.prepare("DELETE FROM agent_messages WHERE session_id = ?").run(id);
    }
    db.prepare("DELETE FROM agent_sessions WHERE agent_id = ?").run(agentId);
  });
  del();
}
