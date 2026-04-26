import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import { initDb, closeDb } from "@/db";
import { insertLogs, getRecentLogs, getLogDetail } from "@/db/models/logDao";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

describe("logDao body fields", () => {
  const baseLog = {
    groupName: "test-group",
    channelId: 1,
    channelName: "ch1",
    modelName: "gpt-4o",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.001,
    durationMs: 200,
    status: "success" as const,
  };

  it("insertLogs writes requestBody and responseBody", () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ]);
    const row = db
      .prepare("SELECT request_body, response_body FROM relay_logs WHERE id = 1")
      .get() as {
      request_body: string | null;
      response_body: string | null;
    };
    expect(row.request_body).toBe('{"model":"gpt-4o"}');
    expect(row.response_body).toBe('{"content":"hi"}');
  });

  it("insertLogs handles undefined body as null", () => {
    insertLogs(db, [baseLog]);
    const row = db
      .prepare("SELECT request_body, response_body FROM relay_logs WHERE id = 1")
      .get() as {
      request_body: string | null;
      response_body: string | null;
    };
    expect(row.request_body).toBeNull();
    expect(row.response_body).toBeNull();
  });

  it("getRecentLogs excludes body fields", () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ]);
    const logs = getRecentLogs(db, 10, 0);
    expect(logs).toHaveLength(1);
    expect(logs[0].requestBody).toBeUndefined();
    expect(logs[0].responseBody).toBeUndefined();
    expect(logs[0].modelName).toBe("gpt-4o");
  });

  it("getLogDetail returns full log with body", () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ]);
    const log = getLogDetail(db, 1);
    expect(log).toBeDefined();
    expect(log!.requestBody).toBe('{"model":"gpt-4o"}');
    expect(log!.responseBody).toBe('{"content":"hi"}');
    expect(log!.modelName).toBe("gpt-4o");
  });

  it("getLogDetail returns undefined for non-existent id", () => {
    expect(getLogDetail(db, 999)).toBeUndefined();
  });
});
