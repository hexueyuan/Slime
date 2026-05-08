import type BetterSqlite3 from "better-sqlite3";
import type { GroupChatSession } from "@shared/types/groupChat";

interface SessionRow {
  id: string;
  title: string;
  participant_agent_ids: string;
  moderator_enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToSession(row: SessionRow): GroupChatSession {
  return {
    id: row.id,
    title: row.title,
    participantAgentIds: JSON.parse(row.participant_agent_ids) as string[],
    moderatorEnabled: !!row.moderator_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSession(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    title: string;
    participantAgentIds: string[];
    moderatorEnabled?: boolean;
  },
): GroupChatSession {
  const now = Date.now();
  db.prepare(
    `INSERT INTO group_chat_sessions (id, title, participant_agent_ids, moderator_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.title,
    JSON.stringify(data.participantAgentIds),
    data.moderatorEnabled ? 1 : 0,
    now,
    now,
  );
  return getSessionById(db, data.id)!;
}

export function listSessions(db: BetterSqlite3.Database): GroupChatSession[] {
  const rows = db
    .prepare("SELECT * FROM group_chat_sessions ORDER BY updated_at DESC")
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function getSessionById(
  db: BetterSqlite3.Database,
  id: string,
): GroupChatSession | undefined {
  const row = db.prepare("SELECT * FROM group_chat_sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return row ? rowToSession(row) : undefined;
}

export function updateTitle(db: BetterSqlite3.Database, id: string, title: string): void {
  db.prepare("UPDATE group_chat_sessions SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    id,
  );
}

export function touchUpdatedAt(db: BetterSqlite3.Database, id: string): void {
  db.prepare("UPDATE group_chat_sessions SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}

export function deleteSession(db: BetterSqlite3.Database, id: string): void {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM group_chat_messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM group_chat_sessions WHERE id = ?").run(id);
  });
  del();
}
