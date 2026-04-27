import type BetterSqlite3 from "better-sqlite3";
import * as messageDao from "@/db/models/agentMessageDao";
import * as configDao from "@/db/models/agentSessionConfigDao";

export async function compactHistory(
  sessionId: string,
  db: BetterSqlite3.Database,
  _gateway?: { baseUrl: string; apiKey: string },
): Promise<void> {
  const config = configDao.getConfigById(db, sessionId);
  if (!config) return;

  const allMessages = messageDao.listBySession(db, sessionId);
  const cursor = config.summaryCursorSeq;
  const toCompress = allMessages.filter((m) => m.status === "sent" && m.orderSeq > cursor);
  if (toCompress.length < 10) return;

  const keepCount = 8;
  const compressable = toCompress.slice(0, -keepCount);
  if (compressable.length === 0) return;

  // TODO: 通过 Gateway 调用 LLM 生成摘要（TASK-204）
  const previousSummary = config.summaryText ? `Previous summary: ${config.summaryText}\n\n` : "";
  const summaryText = `${previousSummary}Conversation covered: ${compressable.length} messages about various topics.`;

  const newCursor = compressable[compressable.length - 1].orderSeq;

  configDao.updateConfig(db, sessionId, {
    summaryText,
    summaryCursorSeq: newCursor,
  });
}
