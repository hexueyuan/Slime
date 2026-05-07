/**
 * 趋势图本地时间单测
 *
 * 确保 relay_logs 的 created_at/log_date 存储本地时间，
 * getStatsHourlyTrend 返回的 hour 与本地小时一致，
 * 防止 x 轴时间再次回退到 UTC。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type BetterSqlite3 from "better-sqlite3";
import { initDb, closeDb } from "@/db";
import { insertLogs } from "@/db/models/logDao";
import { getStatsHourlyTrend, getStatsDailyTrend } from "@/db/models/statsDao";

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
    ttftMs: null as number | null,
    ...overrides,
  };
}

describe("insertLogs created_at 存储本地时间", () => {
  it("created_at 应该是本地时间而非 UTC", () => {
    // 用 fake timer 设定一个已知时刻
    vi.useFakeTimers();
    try {
      // 设置为 UTC 2026-05-07 02:00:00 (北京时间 10:00:00)
      vi.setSystemTime(new Date("2026-05-07T02:00:00Z"));

      insertLogs(db, [makeLog()]);

      const row = db.prepare("SELECT created_at FROM relay_logs").get() as {
        created_at: string;
      };

      // created_at 应该是本地时间格式 "YYYY-MM-DD HH:MM:SS"
      // 关键断言：小时部分应该是本地时间的小时，不是 UTC 的 02
      const localHour = new Date().getHours(); // fake timer 下，本地时间小时
      const storedHour = parseInt(row.created_at.split(" ")[1].split(":")[0], 10);
      expect(storedHour).toBe(localHour);
    } finally {
      vi.useRealTimers();
    }
  });

  it("log_date 触发器填充本地日期", () => {
    vi.useFakeTimers();
    try {
      // UTC 23:30 → 如果是 UTC+8 则本地日期是次日
      vi.setSystemTime(new Date("2026-05-06T23:30:00Z"));

      insertLogs(db, [makeLog()]);

      const row = db.prepare("SELECT log_date, created_at FROM relay_logs").get() as {
        log_date: string;
        created_at: string;
      };

      // log_date 应该等于 created_at 的日期部分
      const createdDate = row.created_at.split(" ")[0];
      expect(row.log_date).toBe(createdDate);

      // 本地日期应该基于本地时间
      const now = new Date();
      const expectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      expect(row.log_date).toBe(expectedDate);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getStatsHourlyTrend 返回本地小时", () => {
  it("hour 字段与 created_at 的本地小时一致", () => {
    // 直接插入已知本地时间的日志
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', '2026-05-07 10:30:00', '2026-05-07')
    `).run();
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', '2026-05-07 22:15:00', '2026-05-07')
    `).run();

    const points = getStatsHourlyTrend(db, "2026-05-07", "2026-05-08");

    // 应该有两个点，分别在 hour 10 和 hour 22
    expect(points).toHaveLength(2);
    const hours = points.map((p) => p.hour);
    expect(hours).toContain(10);
    expect(hours).toContain(22);
  });

  it("跨午夜 UTC 场景：本地时间 23:xx 的数据归属当日", () => {
    // 模拟本地时间 23:45 的数据（如果按 UTC 存储，UTC+8 的 23:45 对应 UTC 15:45，小时会变成 15）
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', '2026-05-07 23:45:00', '2026-05-07')
    `).run();

    const points = getStatsHourlyTrend(db, "2026-05-07", "2026-05-08");
    expect(points).toHaveLength(1);
    expect(points[0].hour).toBe(23);
    expect(points[0].date).toBe("2026-05-07");
  });
});

describe("getStatsDailyTrend 返回本地日期", () => {
  it("多天数据按本地日期正确分组", () => {
    const dates = ["2026-05-05", "2026-05-06", "2026-05-07"];
    for (const date of dates) {
      db.prepare(`
        INSERT INTO relay_logs
          (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
        VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', ?, ?)
      `).run(`${date} 10:00:00`, date);
    }

    const points = getStatsDailyTrend(db, "2026-05-05", "2026-05-08");
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.date)).toEqual(dates);
  });
});

describe("aggregateToHourly 保持本地时间小时", () => {
  it("聚合后 hour 字段等于 created_at 的本地小时", async () => {
    const { aggregateToHourly } = await import("@/db/models/statsDao");

    // 插入本地时间 14:xx 和 22:xx 的数据
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', '2026-05-01 14:30:00', '2026-05-01')
    `).run();
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at, log_date)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, 'success', '2026-05-01 22:15:00', '2026-05-01')
    `).run();

    aggregateToHourly(db, "2026-05-02");

    const rows = db.prepare("SELECT hour FROM stats_hourly ORDER BY hour").all() as Array<{
      hour: number;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].hour).toBe(14);
    expect(rows[1].hour).toBe(22);
  });
});
