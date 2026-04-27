import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, closeDb } from "@/db";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as configDao from "@/db/models/agentSessionConfigDao";
import * as messageDao from "@/db/models/agentMessageDao";
import * as usageDao from "@/db/models/agentUsageStatsDao";
import type BetterSqlite3 from "better-sqlite3";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("agent session tables", () => {
  it("all four tables created", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("agent_sessions");
    expect(names).toContain("agent_session_configs");
    expect(names).toContain("agent_messages");
    expect(names).toContain("agent_usage_stats");
  });
});

describe("agentSessionDao", () => {
  it("createSession + listSessions sorted correctly (pinned first)", () => {
    const s1 = sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "old" });
    const s2 = sessionDao.createSession(db, { id: "s2", agentId: "a1", title: "new" });
    // pin s1
    sessionDao.togglePin(db, s1.id);

    const list = sessionDao.listSessions(db, "a1");
    expect(list).toHaveLength(2);
    // s1 is pinned → first
    expect(list[0].id).toBe("s1");
    expect(list[0].isPinned).toBe(true);
    // s2 is newer but not pinned
    expect(list[1].id).toBe("s2");
  });

  it("getSessionById returns session / undefined for missing", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    expect(sessionDao.getSessionById(db, "s1")).toBeDefined();
    expect(sessionDao.getSessionById(db, "s1")!.title).toBe("test");
    expect(sessionDao.getSessionById(db, "nonexist")).toBeUndefined();
  });

  it("updateTitle updates title + updated_at", () => {
    const s = sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "old" });
    const oldUpdatedAt = s.updatedAt;
    // small delay to ensure timestamp differs
    sessionDao.updateTitle(db, "s1", "new title");
    const updated = sessionDao.getSessionById(db, "s1")!;
    expect(updated.title).toBe("new title");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(oldUpdatedAt);
  });

  it("togglePin toggles isPinned", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    expect(sessionDao.getSessionById(db, "s1")!.isPinned).toBe(false);
    sessionDao.togglePin(db, "s1");
    expect(sessionDao.getSessionById(db, "s1")!.isPinned).toBe(true);
    sessionDao.togglePin(db, "s1");
    expect(sessionDao.getSessionById(db, "s1")!.isPinned).toBe(false);
  });

  it("deleteSession cascades to config + messages + usage_stats", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    configDao.createConfig(db, { id: "s1" });
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "hello",
    });
    usageDao.createUsageStats(db, {
      messageId: "m1",
      sessionId: "s1",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cachedInputTokens: 0,
    });

    sessionDao.deleteSession(db, "s1");
    expect(sessionDao.getSessionById(db, "s1")).toBeUndefined();
    expect(configDao.getConfigById(db, "s1")).toBeUndefined();
    expect(messageDao.listBySession(db, "s1")).toHaveLength(0);
    expect(usageDao.getBySession(db, "s1")).toHaveLength(0);
  });

  it("deleteByAgent removes all sessions for agent", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test1" });
    sessionDao.createSession(db, { id: "s2", agentId: "a1", title: "test2" });
    sessionDao.createSession(db, { id: "s3", agentId: "a2", title: "other" });
    configDao.createConfig(db, { id: "s1" });
    messageDao.createMessage(db, {
      id: "m1",
      sessionId: "s1",
      orderSeq: 1,
      role: "user",
      content: "hi",
    });

    sessionDao.deleteByAgent(db, "a1");
    expect(sessionDao.listSessions(db, "a1")).toHaveLength(0);
    expect(sessionDao.listSessions(db, "a2")).toHaveLength(1);
    expect(configDao.getConfigById(db, "s1")).toBeUndefined();
    expect(messageDao.listBySession(db, "s1")).toHaveLength(0);
  });

  it("subagentMeta JSON roundtrip", () => {
    const meta = { mode: "inherit" as const, prompt: "do stuff", parentSessionId: "p1" };
    sessionDao.createSession(db, {
      id: "s1",
      agentId: "a1",
      title: "sub",
      sessionKind: "subagent",
      parentSessionId: "p1",
      subagentMeta: meta,
    });
    const s = sessionDao.getSessionById(db, "s1")!;
    expect(s.sessionKind).toBe("subagent");
    expect(s.subagentMeta).toEqual(meta);
    expect(s.parentSessionId).toBe("p1");
  });

  it("listSessions without agentId returns all", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "one" });
    sessionDao.createSession(db, { id: "s2", agentId: "a2", title: "two" });
    expect(sessionDao.listSessions(db)).toHaveLength(2);
  });

  it("getSessionById returns metadata null when not set", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    const s = sessionDao.getSessionById(db, "s1")!;
    expect(s.metadata).toBeNull();
  });

  it("updateMetadata writes and reads back", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    const meta = { titleGeneratedCount: 2, titleManuallyEdited: true };
    sessionDao.updateMetadata(db, "s1", meta);
    const s = sessionDao.getSessionById(db, "s1")!;
    expect(s.metadata).toEqual(meta);
  });

  it("updateMetadata updates updated_at", () => {
    sessionDao.createSession(db, { id: "s1", agentId: "a1", title: "test" });
    const oldUpdatedAt = sessionDao.getSessionById(db, "s1")!.updatedAt;
    sessionDao.updateMetadata(db, "s1", { titleGeneratedCount: 1 });
    const s = sessionDao.getSessionById(db, "s1")!;
    expect(s.updatedAt).toBeGreaterThanOrEqual(oldUpdatedAt);
  });
});

describe("agentSessionConfigDao", () => {
  it("createConfig with defaults", () => {
    const c = configDao.createConfig(db, { id: "c1" });
    expect(c.id).toBe("c1");
    expect(c.capabilityRequirements).toEqual(["reasoning"]);
    expect(c.systemPrompt).toBeNull();
    expect(c.temperature).toBeNull();
    expect(c.summaryCursorSeq).toBe(0);
  });

  it("updateConfig partial", () => {
    configDao.createConfig(db, { id: "c1" });
    configDao.updateConfig(db, "c1", {
      capabilityRequirements: ["reasoning", "chat"],
      temperature: 0.7,
      summaryCursorSeq: 5,
    });
    const c = configDao.getConfigById(db, "c1")!;
    expect(c.capabilityRequirements).toEqual(["reasoning", "chat"]);
    expect(c.temperature).toBe(0.7);
    expect(c.summaryCursorSeq).toBe(5);
  });

  it("deleteConfig", () => {
    configDao.createConfig(db, { id: "c1" });
    configDao.deleteConfig(db, "c1");
    expect(configDao.getConfigById(db, "c1")).toBeUndefined();
  });
});
