import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import { initDb, closeDb } from "@/db";
import { insertLogs } from "@/db/models/logDao";
import { upsertPrice } from "@/db/models/priceDao";
import { createStatsCollector } from "@/gateway/stats";
import { createScheduledTasks } from "@/gateway/tasks";
import { calculateCost } from "@/gateway/cost";

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  closeDb();
});

function makeLog(overrides?: Partial<Record<string, unknown>>) {
  return {
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
    ...overrides,
  };
}

describe("StatsCollector", () => {
  it("record 推入 buffer，flush 写入数据库", () => {
    const collector = createStatsCollector(db);
    collector.record(makeLog());
    collector.record(makeLog({ modelName: "gpt-4o-mini" }));

    // flush 前数据库为空
    const countBefore = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number })
      .c;
    expect(countBefore).toBe(0);

    collector.flush();

    const countAfter = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number })
      .c;
    expect(countAfter).toBe(2);

    collector.destroy();
  });

  it("destroy 强制 flush 剩余数据", () => {
    const collector = createStatsCollector(db);
    collector.record(makeLog());
    collector.destroy();

    const count = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it("自动 flush 定时器", () => {
    vi.useFakeTimers();
    try {
      const collector = createStatsCollector(db);
      collector.record(makeLog());

      vi.advanceTimersByTime(30_000);

      const count = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number }).c;
      expect(count).toBe(1);

      collector.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush 空 buffer 不报错", () => {
    const collector = createStatsCollector(db);
    expect(() => collector.flush()).not.toThrow();
    collector.destroy();
  });
});

describe("calculateCost", () => {
  it("有价格数据时正确计算", () => {
    upsertPrice(db, "gpt-4o", { inputPrice: 2.5, outputPrice: 10 });
    const cost = calculateCost(db, "gpt-4o", { inputTokens: 1000, outputTokens: 500 });
    // (1000 * 2.5 + 500 * 10) / 1_000_000 = (2500 + 5000) / 1_000_000 = 0.0075
    expect(cost).toBeCloseTo(0.0075);
  });

  it("无价格数据时返回 0", () => {
    const cost = calculateCost(db, "unknown-model", { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toBe(0);
  });

  it("cache tokens 参与计算", () => {
    upsertPrice(db, "claude-sonnet", {
      inputPrice: 3,
      outputPrice: 15,
      cacheReadPrice: 0.3,
      cacheWritePrice: 3.75,
    });
    const cost = calculateCost(db, "claude-sonnet", {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 100,
    });
    // (1000*3 + 500*15 + 2000*0.3 + 100*3.75) / 1_000_000
    // = (3000 + 7500 + 600 + 375) / 1_000_000 = 11475 / 1_000_000 = 0.011475
    expect(cost).toBeCloseTo(0.011475);
  });
});

describe("ScheduledTasks", () => {
  function insertTestLog(date: string) {
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("test-group", "gpt-4o", 1, "ch1", 100, 50, 0, 0, 0.001, 200, "success", date);
  }

  function insertHourlyRow(date: string, hour: number) {
    db.prepare(`
      INSERT INTO stats_hourly
        (date, hour, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, hour, "gpt-4o", 1, 10, 1000, 500, 0, 0, 0.01);
  }

  function insertDailyRow(date: string) {
    db.prepare(`
      INSERT INTO stats_daily
        (date, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, "gpt-4o", 1, 100, 10000, 5000, 0, 0, 0.1);
  }

  it("runNow 聚合 relay_logs 到 stats_hourly", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));

      // 插入 10 天前的日志（应被聚合，>7天）
      insertTestLog("2026-04-15 10:00:00");
      insertTestLog("2026-04-15 10:30:00");

      const tasks = createScheduledTasks(db);
      tasks.runNow();

      // relay_logs 中旧数据被删除
      const logCount = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number })
        .c;
      expect(logCount).toBe(0);

      // stats_hourly 中有聚合数据
      const hourlyCount = (
        db.prepare("SELECT COUNT(*) AS c FROM stats_hourly").get() as { c: number }
      ).c;
      expect(hourlyCount).toBe(1);

      const row = db.prepare("SELECT * FROM stats_hourly").get() as Record<string, unknown>;
      expect(row.date).toBe("2026-04-15");
      expect(row.hour).toBe(10);
      expect(row.requests).toBe(2);
      expect(row.input_tokens).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runNow 聚合 stats_hourly 到 stats_daily", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));

      // 插入 35 天前的小时数据（>30天，应被聚合到 daily）
      insertHourlyRow("2026-03-20", 10);
      insertHourlyRow("2026-03-20", 14);

      const tasks = createScheduledTasks(db);
      tasks.runNow();

      // stats_hourly 旧数据被删除
      const hourlyCount = (
        db.prepare("SELECT COUNT(*) AS c FROM stats_hourly").get() as { c: number }
      ).c;
      expect(hourlyCount).toBe(0);

      // stats_daily 有聚合数据
      const dailyCount = (
        db.prepare("SELECT COUNT(*) AS c FROM stats_daily").get() as { c: number }
      ).c;
      expect(dailyCount).toBe(1);

      const row = db.prepare("SELECT * FROM stats_daily").get() as Record<string, unknown>;
      expect(row.date).toBe("2026-03-20");
      expect(row.requests).toBe(20);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runNow 清理 90 天前的 daily 数据", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));

      // 插入 100 天前的 daily 数据（>90天，应被清理）
      insertDailyRow("2026-01-15");
      // 插入 60 天前的 daily 数据（<90天，应保留）
      insertDailyRow("2026-02-25");

      const tasks = createScheduledTasks(db);
      tasks.runNow();

      const rows = db.prepare("SELECT date FROM stats_daily ORDER BY date").all() as Array<{
        date: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].date).toBe("2026-02-25");
    } finally {
      vi.useRealTimers();
    }
  });

  it("7 天内的 relay_logs 不被清理", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));

      // 插入 3 天前的日志（<7天，应保留）
      insertTestLog("2026-04-23 10:00:00");

      const tasks = createScheduledTasks(db);
      tasks.runNow();

      const logCount = (db.prepare("SELECT COUNT(*) AS c FROM relay_logs").get() as { c: number })
        .c;
      expect(logCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop 清除定时器", () => {
    const tasks = createScheduledTasks(db);
    tasks.start();
    expect(() => tasks.stop()).not.toThrow();
  });
});

describe("DB Schema Migrations", () => {
  it("relay_logs 包含 ttft_ms 列", () => {
    const info = db.prepare("PRAGMA table_info(relay_logs)").all() as Array<{ name: string }>;
    expect(info.map((c) => c.name)).toContain("ttft_ms");
  });

  it("stats_hourly 包含稳定性列", () => {
    const info = db.prepare("PRAGMA table_info(stats_hourly)").all() as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain("success_count");
    expect(cols).toContain("fail_count");
    expect(cols).toContain("avg_latency_ms");
  });

  it("stats_daily 包含稳定性列", () => {
    const info = db.prepare("PRAGMA table_info(stats_daily)").all() as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    expect(cols).toContain("success_count");
    expect(cols).toContain("fail_count");
    expect(cols).toContain("avg_latency_ms");
  });
});
