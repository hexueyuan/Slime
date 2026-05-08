import type BetterSqlite3 from "better-sqlite3";
import type { GroupChatMessageRecord } from "@shared/types/groupChat";

interface MessageRow {
  id: string;
  session_id: string;
  order_seq: number;
  sender_agent_id: string | null;
  role: string;
  content: string;
  hidden: number;
  created_at: number;
}

function rowToMessage(row: MessageRow): GroupChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderSeq: row.order_seq,
    senderAgentId: row.sender_agent_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    hidden: !!row.hidden,
    createdAt: row.created_at,
  };
}

export function createMessage(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    sessionId: string;
    senderAgentId?: string | null;
    role: "user" | "assistant";
    content: string;
    hidden?: boolean;
  },
): GroupChatMessageRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO group_chat_messages (id, session_id, order_seq, sender_agent_id, role, content, hidden, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.sessionId,
    now, // order_seq = Date.now() 毫秒时间戳
    data.senderAgentId ?? null,
    data.role,
    data.content,
    data.hidden ? 1 : 0,
    now,
  );
  return getMessageById(db, data.id)!;
}

export function listBySession(
  db: BetterSqlite3.Database,
  sessionId: string,
): GroupChatMessageRecord[] {
  const rows = db
    .prepare("SELECT * FROM group_chat_messages WHERE session_id = ? ORDER BY order_seq ASC")
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function listVisibleBySession(
  db: BetterSqlite3.Database,
  sessionId: string,
): GroupChatMessageRecord[] {
  const rows = db
    .prepare(
      "SELECT * FROM group_chat_messages WHERE session_id = ? AND hidden = 0 ORDER BY order_seq ASC",
    )
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageById(
  db: BetterSqlite3.Database,
  id: string,
): GroupChatMessageRecord | undefined {
  const row = db.prepare("SELECT * FROM group_chat_messages WHERE id = ?").get(id) as
    | MessageRow
    | undefined;
  return row ? rowToMessage(row) : undefined;
}

export function deleteBySession(db: BetterSqlite3.Database, sessionId: string): void {
  db.prepare("DELETE FROM group_chat_messages WHERE session_id = ?").run(sessionId);
}
