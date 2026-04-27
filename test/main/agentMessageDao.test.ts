import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as messageDao from "@/db/models/agentMessageDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
  // create a session to satisfy FK-like usage
  sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
});

afterEach(() => {
  closeDb();
});

describe("agentMessageDao", () => {
  it("createMessage + listBySession sorted by order_seq ASC", () => {
    messageDao.createMessage(db, {
      id: "m2",
      sessionId: "s1",
      orderSeq: 2,
      role: "assistant",
      content: "world",
    });
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "hello",
    });
    const list = messageDao.listBySession(db, "s1");
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("m1");
    expect(list[0].orderSeq).toBe(1);
    expect(list[1].id).toBe("m2");
    expect(list[1].orderSeq).toBe(2);
  });

  it("pagination with offset and limit", () => {
    for (let i = 1; i <= 5; i++) {
      messageDao.createMessage(db, {
        id: `m${i}`,
        sessionId: "s1",
        orderSeq: i,
        role: "user",
        content: `msg ${i}`,
      });
    }
    const page = messageDao.listBySession(db, "s1", 2, 2);
    expect(page).toHaveLength(2);
    expect(page[0].orderSeq).toBe(3);
    expect(page[1].orderSeq).toBe(4);
  });

  it("getNextOrderSeq increments correctly", () => {
    expect(messageDao.getNextOrderSeq(db, "s1")).toBe(1);
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "a",
    });
    expect(messageDao.getNextOrderSeq(db, "s1")).toBe(2);
    messageDao.createMessage(db, {
      id: "m2",
      sessionId: "s1",
      orderSeq: 5,
      role: "user",
      content: "b",
    });
    expect(messageDao.getNextOrderSeq(db, "s1")).toBe(6);
  });

  it("updateMessage partial update", () => {
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "old",
    });
    messageDao.updateMessage(db, "m1", { content: "new", status: "sent" });
    const m = messageDao.getMessageById(db, "m1")!;
    expect(m.content).toBe("new");
    expect(m.status).toBe("sent");
    expect(m.isContextEdge).toBe(false); // unchanged
  });

  it("updateMessage isContextEdge", () => {
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "x",
    });
    messageDao.updateMessage(db, "m1", { isContextEdge: true });
    expect(messageDao.getMessageById(db, "m1")!.isContextEdge).toBe(true);
  });

  it("deleteBySession clears all messages", () => {
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "a",
    });
    messageDao.createMessage(db, {
      id: "m2",
      sessionId: "s1",
      orderSeq: 2,
      role: "assistant",
      content: "b",
    });
    messageDao.deleteBySession(db, "s1");
    expect(messageDao.listBySession(db, "s1")).toHaveLength(0);
  });

  it("getLastMessage returns last by order_seq", () => {
    expect(messageDao.getLastMessage(db, "s1")).toBeUndefined();
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "first",
    });
    messageDao.createMessage(db, {
      id: "m2",
      sessionId: "s1",
      orderSeq: 2,
      role: "assistant",
      content: "second",
    });
    const last = messageDao.getLastMessage(db, "s1")!;
    expect(last.id).toBe("m2");
    expect(last.content).toBe("second");
  });

  it("content JSON serialization roundtrip", () => {
    const blocks = JSON.stringify([
      { type: "content", content: "hello", status: "success", timestamp: 123 },
      {
        type: "tool_call",
        status: "success",
        timestamp: 456,
        tool_call: { id: "t1", name: "read", input: { path: "/a" } },
      },
    ]);
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "assistant",
      content: blocks,
    });
    const m = messageDao.getMessageById(db, "m1")!;
    const parsed = JSON.parse(m.content);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe("content");
    expect(parsed[1].tool_call.name).toBe("read");
  });

  it("metadata JSON serialization", () => {
    const meta = JSON.stringify({ totalTokens: 100, model: "gpt-4o" });
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "assistant",
      content: "hi",
      metadata: meta,
    });
    const m = messageDao.getMessageById(db, "m1")!;
    const parsed = JSON.parse(m.metadata);
    expect(parsed.totalTokens).toBe(100);
    expect(parsed.model).toBe("gpt-4o");
  });
});
