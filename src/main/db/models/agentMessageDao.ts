import type BetterSqlite3 from "better-sqlite3";
import type { ChatMessageRecord } from "@shared/types/agent";

interface MessageRow {
  id: string;
  session_id: string;
  order_seq: number;
  role: string;
  content: string;
  status: string;
  is_context_edge: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

function rowToMessage(row: MessageRow): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    orderSeq: row.order_seq,
    role: row.role as ChatMessageRecord["role"],
    content: row.content,
    status: row.status as ChatMessageRecord["status"],
    isContextEdge: !!row.is_context_edge,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMessage(
  db: BetterSqlite3.Database,
  data: {
    id: string;
    sessionId: string;
    orderSeq: number;
    role: "user" | "assistant";
    content: string;
    status?: "pending" | "sent" | "error";
    metadata?: string;
  },
): ChatMessageRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_messages (id, session_id, order_seq, role, content, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.sessionId,
    data.orderSeq,
    data.role,
    data.content,
    data.status ?? "pending",
    data.metadata ?? "{}",
    now,
    now,
  );
  return getMessageById(db, data.id)!;
}

export function listBySession(
  db: BetterSqlite3.Database,
  sessionId: string,
  offset?: number,
  limit?: number,
): ChatMessageRecord[] {
  if (offset != null && limit != null) {
    const rows = db
      .prepare(
        "SELECT * FROM agent_messages WHERE session_id = ? ORDER BY order_seq ASC LIMIT ? OFFSET ?",
      )
      .all(sessionId, limit, offset) as MessageRow[];
    return rows.map(rowToMessage);
  }
  const rows = db
    .prepare("SELECT * FROM agent_messages WHERE session_id = ? ORDER BY order_seq ASC")
    .all(sessionId) as MessageRow[];
  return rows.map(rowToMessage);
}

export function getMessageById(
  db: BetterSqlite3.Database,
  id: string,
): ChatMessageRecord | undefined {
  const row = db.prepare("SELECT * FROM agent_messages WHERE id = ?").get(id) as
    | MessageRow
    | undefined;
  return row ? rowToMessage(row) : undefined;
}

export function updateMessage(
  db: BetterSqlite3.Database,
  id: string,
  partial: { content?: string; status?: string; metadata?: string; isContextEdge?: boolean },
): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (partial.content !== undefined) {
    sets.push("content = ?");
    values.push(partial.content);
  }
  if (partial.status !== undefined) {
    sets.push("status = ?");
    values.push(partial.status);
  }
  if (partial.metadata !== undefined) {
    sets.push("metadata = ?");
    values.push(partial.metadata);
  }
  if (partial.isContextEdge !== undefined) {
    sets.push("is_context_edge = ?");
    values.push(partial.isContextEdge ? 1 : 0);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  db.prepare(`UPDATE agent_messages SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteBySession(db: BetterSqlite3.Database, sessionId: string): void {
  db.prepare("DELETE FROM agent_messages WHERE session_id = ?").run(sessionId);
}

export function getNextOrderSeq(db: BetterSqlite3.Database, sessionId: string): number {
  const row = db
    .prepare("SELECT MAX(order_seq) as max_seq FROM agent_messages WHERE session_id = ?")
    .get(sessionId) as { max_seq: number | null };
  return (row.max_seq ?? 0) + 1;
}

export function getLastMessage(
  db: BetterSqlite3.Database,
  sessionId: string,
): ChatMessageRecord | undefined {
  const row = db
    .prepare("SELECT * FROM agent_messages WHERE session_id = ? ORDER BY order_seq DESC LIMIT 1")
    .get(sessionId) as MessageRow | undefined;
  return row ? rowToMessage(row) : undefined;
}
