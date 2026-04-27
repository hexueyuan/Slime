# Stats Dashboard 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造 Gateway 统计功能，新增 TTFT 采集、趋势图、排行榜、渠道稳定性指标、日志 TTFT 列。

**Architecture:** DB schema migration 增加 7 个新列，relay.ts 在流式 generator 中采集首字时间，statsDao 扩展聚合查询并新增排行/稳定性/百分位数方法，前端引入 ECharts 渲染趋势图和排行榜，GatewayPanel 顶部 Dashboard 展开，ChannelTab 详情插入稳定性图。

**Tech Stack:** TypeScript, Vue 3, Pinia, better-sqlite3, ECharts + vue-echarts, Tailwind CSS, Vitest

---

## 文件索引

### 新建
- `src/renderer/src/components/gateway/StatsChart.vue` — ECharts 趋势 Area Chart
- `src/renderer/src/components/gateway/RankBoard.vue` — 渠道/模型排行榜
- `src/renderer/src/components/gateway/ChannelStabilityChart.vue` — 渠道可用率+延迟双图

### 修改
- `src/main/db/database.ts` — 新增 7 列 migration
- `src/shared/types/gateway.d.ts` — 新增类型 + RelayLog.ttftMs + DailyStats.avgLatencyMs + TrendPoint
- `src/shared/types/presenters/gateway.presenter.d.ts` — 新增 6 个 IPC 方法签名
- `src/main/db/models/logDao.ts` — 支持 ttft_ms 字段
- `src/main/db/models/statsDao.ts` — 更新聚合 + 新增 5 个查询函数
- `src/main/gateway/relay.ts` — TTFT 采集 + StatsCallback.ttftMs
- `src/main/presenter/gatewayPresenter.ts` — 实现新方法 + 传递 ttftMs
- `src/renderer/src/stores/gateway.ts` — 新增状态 + actions
- `src/renderer/src/views/GatewayPanel.vue` — Dashboard 扩展（6 KPI + StatsChart + RankBoard）
- `src/renderer/src/components/gateway/ChannelTab.vue` — 插入 ChannelStabilityChart
- `src/renderer/src/components/gateway/LogTab.vue` — 新增 TTFT 列
- `package.json` — 新增 echarts + vue-echarts
- `test/main/gateway-stats.test.ts` — 更新现有测试 + 新增测试

---

## Task 1: DB Schema Migration + 类型定义

**Files:**
- Modify: `src/main/db/database.ts`
- Modify: `src/shared/types/gateway.d.ts`
- Modify: `test/main/gateway-stats.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/gateway-stats.test.ts` 末尾追加：

```ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/main/gateway-stats.test.ts
```

预期：3 个 `toContain` 断言失败，列不存在。

- [ ] **Step 3: 在 `database.ts` 的 `createDb` 函数末尾（`return instance` 之前）添加 migration**

```ts
  // Migration: add ttft_ms to relay_logs
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN ttft_ms INTEGER");
  } catch {
    // column already exists
  }
  // Migration: add stability columns to stats_hourly
  try {
    instance.exec(
      "ALTER TABLE stats_hourly ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0",
    );
  } catch {}
  try {
    instance.exec("ALTER TABLE stats_hourly ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0");
  } catch {}
  try {
    instance.exec("ALTER TABLE stats_hourly ADD COLUMN avg_latency_ms REAL NOT NULL DEFAULT 0");
  } catch {}
  // Migration: add stability columns to stats_daily
  try {
    instance.exec(
      "ALTER TABLE stats_daily ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0",
    );
  } catch {}
  try {
    instance.exec("ALTER TABLE stats_daily ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0");
  } catch {}
  try {
    instance.exec("ALTER TABLE stats_daily ADD COLUMN avg_latency_ms REAL NOT NULL DEFAULT 0");
  } catch {}
```

- [ ] **Step 4: 在 `src/shared/types/gateway.d.ts` 添加新类型**

在文件末尾追加：

```ts
export interface TrendPoint {
  date: string;
  hour?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface StabilityPoint {
  hour: string; // "2026-04-27T10"
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
}

export interface ChannelRankItem {
  channelId: number;
  channelName: string;
  requests: number;
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
  cost: number;
}

export interface ModelRankItem {
  modelName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  ttftP50: number | null;
}
```

同时修改 `RelayLog` 和 `DailyStats`：

```ts
// RelayLog 新增（在 createdAt 之前）：
ttftMs?: number | null;

// DailyStats 新增（在 cost 之后）：
avgLatencyMs: number;
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
pnpm test test/main/gateway-stats.test.ts
```

预期：所有测试通过（包括新增的 3 个 schema 测试）。

- [ ] **Step 6: Commit**

```bash
git add src/main/db/database.ts src/shared/types/gateway.d.ts test/main/gateway-stats.test.ts
git commit -m "feat(gateway): add ttft_ms and stability columns migration, new types"
```

---

## Task 2: logDao 支持 ttft_ms

**Files:**
- Modify: `src/main/db/models/logDao.ts`
- Modify: `test/main/gateway-stats.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/gateway-stats.test.ts` 的 `describe("StatsCollector"` 之前添加：

```ts
describe("logDao ttft_ms", () => {
  it("insertLogs 写入 ttft_ms 数值", () => {
    insertLogs(db, [makeLog({ ttftMs: 300 })]);
    const row = db.prepare("SELECT ttft_ms FROM relay_logs").get() as { ttft_ms: number };
    expect(row.ttft_ms).toBe(300);
  });

  it("insertLogs 写入 ttft_ms 为 null（非流式）", () => {
    insertLogs(db, [makeLog({ ttftMs: null })]);
    const row = db.prepare("SELECT ttft_ms FROM relay_logs").get() as { ttft_ms: null };
    expect(row.ttft_ms).toBeNull();
  });

  it("getRecentLogs 返回 ttftMs 字段", () => {
    insertLogs(db, [makeLog({ ttftMs: 250 })]);
    const logs = getRecentLogs(db, 10, 0);
    expect(logs[0].ttftMs).toBe(250);
  });
});
```

同时更新 `makeLog` helper，在 `...overrides` 前加默认值：

```ts
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
    ttftMs: null as number | null,  // 新增
    ...overrides,
  };
}
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/main/gateway-stats.test.ts
```

预期：`ttftMs` 相关断言失败（列不在 INSERT，getter 中不存在）。

- [ ] **Step 3: 修改 `src/main/db/models/logDao.ts`**

更新 `LogRow` 接口（在 `created_at` 之前）：

```ts
ttft_ms: number | null;
```

更新 `rowToLog` 函数（在 `createdAt` 赋值之前）：

```ts
ttftMs: row.ttft_ms,
```

更新 `insertLogs` SQL：

```ts
const insert = db.prepare(`
  INSERT INTO relay_logs
    (api_key_id, group_name, channel_id, channel_name, model_name,
     input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
     cost, duration_ms, status, error, request_body, response_body, ttft_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
```

更新 `insert.run(...)` 调用，在 `log.responseBody ?? null` 之后追加：

```ts
log.ttftMs ?? null,
```

更新 `getRecentLogs` 的 SELECT：

```ts
`SELECT l.id, l.api_key_id, ak.name AS api_key_name, l.group_name, l.channel_id, l.channel_name, l.model_name,
        l.input_tokens, l.output_tokens, l.cache_read_tokens, l.cache_write_tokens,
        l.cost, l.duration_ms, l.ttft_ms, l.status, l.error, l.created_at
 FROM relay_logs l
 LEFT JOIN api_keys ak ON ak.id = l.api_key_id
 ORDER BY l.id DESC LIMIT ? OFFSET ?`
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test test/main/gateway-stats.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/db/models/logDao.ts test/main/gateway-stats.test.ts
git commit -m "feat(gateway): add ttft_ms to relay_logs insert and read"
```

---

## Task 3: relay.ts TTFT 采集 + StatsCallback 扩展

**Files:**
- Modify: `src/main/gateway/relay.ts`
- Modify: `src/main/presenter/gatewayPresenter.ts`

此任务改动的是流式数据管道，没有单元测试直接覆盖（集成行为），通过 typecheck 验证。

- [ ] **Step 1: 修改 `src/main/gateway/relay.ts` 的 `StatsCallback` 类型**

在 `responseBody?: string;` 之后加：

```ts
ttftMs?: number | null;
```

- [ ] **Step 2: 在 `wrappedStream()` generator 内添加 TTFT 采集**

在 `let stopReason = ""` 之后添加：

```ts
let ttftMs: number | null = null;
let firstChunkSeen = false;
```

在 `accumulate` 函数的 `if (evt.type === "content_delta" ...` 块内，`contentText += evt.delta.text` 之前添加：

```ts
if (!firstChunkSeen) {
  ttftMs = Date.now() - startTime;
  firstChunkSeen = true;
}
```

在成功路径的 `statsCallback?.({...})` 中，`durationMs: Date.now() - startTime,` 之后添加：

```ts
ttftMs,
```

- [ ] **Step 3: 修改 `src/main/presenter/gatewayPresenter.ts` 的 `onStats` 回调**

在 `this.statsCollector.record({...})` 内，`responseBody: data.responseBody,` 之后添加：

```ts
ttftMs: data.ttftMs,
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

预期：无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/main/gateway/relay.ts src/main/presenter/gatewayPresenter.ts
git commit -m "feat(gateway): capture TTFT in stream relay, pass to stats callback"
```

---

## Task 4: statsDao 聚合更新 + 新查询函数

**Files:**
- Modify: `src/main/db/models/statsDao.ts`
- Modify: `test/main/gateway-stats.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/gateway-stats.test.ts` 中，`describe("ScheduledTasks"` 之前添加：

```ts
describe("statsDao 稳定性查询", () => {
  function insertLog(date: string, status: "success" | "error", durationMs = 200) {
    db.prepare(`
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, ?, ?, ?)
    `).run(durationMs, status, date);
  }

  it("aggregateToHourly 写入 success_count/fail_count/avg_latency_ms", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));
    insertLog("2026-04-15 10:00:00", "success", 100);
    insertLog("2026-04-15 10:30:00", "error", 300);
    const { aggregateToHourly } = await import("@/db/models/statsDao");
    aggregateToHourly(db, "2026-04-16");
    const row = db.prepare("SELECT * FROM stats_hourly").get() as Record<string, unknown>;
    expect(row.success_count).toBe(1);
    expect(row.fail_count).toBe(1);
    expect(row.avg_latency_ms).toBeCloseTo(200);
    vi.useRealTimers();
  });

  it("getChannelRanking 按请求数排序", () => {
    const { getChannelRanking } = await import("@/db/models/statsDao");
    insertLog("2026-04-26 10:00:00", "success");
    insertLog("2026-04-26 10:01:00", "success");
    insertLog("2026-04-26 10:02:00", "error");
    const rows = getChannelRanking(db, "2026-04-26", "2026-04-27");
    expect(rows).toHaveLength(1);
    expect(rows[0].channelId).toBe(1);
    expect(rows[0].requests).toBe(3);
    expect(rows[0].successCount).toBe(2);
    expect(rows[0].failCount).toBe(1);
  });

  it("getModelRanking 按请求数排序", () => {
    const { getModelRanking } = await import("@/db/models/statsDao");
    insertLog("2026-04-26 10:00:00", "success");
    insertLog("2026-04-26 10:01:00", "success");
    const rows = getModelRanking(db, "2026-04-26", "2026-04-27");
    expect(rows[0].modelName).toBe("gpt-4o");
    expect(rows[0].requests).toBe(2);
  });

  it("getLatencyPercentiles 返回 P50/P95", () => {
    const { getLatencyPercentiles } = await import("@/db/models/statsDao");
    for (let i = 1; i <= 100; i++) {
      db.prepare(
        `INSERT INTO relay_logs (group_name, model_name, channel_id, channel_name,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         cost, duration_ms, status, created_at)
         VALUES ('g', 'gpt-4o', 1, 'ch1', 10, 5, 0, 0, 0, ?, 'success', '2026-04-26 10:00:00')`,
      ).run(i * 10); // 10, 20, ..., 1000 ms
    }
    const result = getLatencyPercentiles(db, "2026-04-26", "2026-04-27");
    expect(result.p50).toBeGreaterThanOrEqual(490);
    expect(result.p50).toBeLessThanOrEqual(510);
    expect(result.p95).toBeGreaterThanOrEqual(940);
    expect(result.p95).toBeLessThanOrEqual(960);
  });

  it("getChannelStabilityHourly 返回按小时的稳定性数据", () => {
    const { getChannelStabilityHourly } = await import("@/db/models/statsDao");
    // 需要先 aggregateToHourly
    insertLog("2026-04-15 10:00:00", "success");
    insertLog("2026-04-15 10:30:00", "error");
    const { aggregateToHourly } = await import("@/db/models/statsDao");
    aggregateToHourly(db, "2026-04-16");
    const rows = getChannelStabilityHourly(db, 1, "2026-04-15", "2026-04-16");
    expect(rows).toHaveLength(1);
    expect(rows[0].successCount).toBe(1);
    expect(rows[0].failCount).toBe(1);
    expect(rows[0].hour).toBe("2026-04-15T10");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test test/main/gateway-stats.test.ts
```

预期：新增的 5 个测试失败（函数不存在或缺少列）。

- [ ] **Step 3: 更新 `src/main/db/models/statsDao.ts` — 修改 aggregateToHourly**

将整个 `aggregateToHourly` 函数替换为：

```ts
export function aggregateToHourly(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(
      `INSERT OR REPLACE INTO stats_hourly
        (date, hour, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, success_count, fail_count, avg_latency_ms)
      SELECT
        date(created_at) AS date,
        CAST(strftime('%H', created_at) AS INTEGER) AS hour,
        model_name,
        COALESCE(channel_id, 0),
        COUNT(*),
        SUM(input_tokens),
        SUM(output_tokens),
        SUM(cache_read_tokens),
        SUM(cache_write_tokens),
        SUM(cost),
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),
        AVG(duration_ms)
      FROM relay_logs
      WHERE created_at < ?
      GROUP BY date, hour, model_name, COALESCE(channel_id, 0)`,
    )
    .run(beforeDate);
  return result.changes;
}
```

- [ ] **Step 4: 更新 `aggregateToDaily`**

将整个 `aggregateToDaily` 函数替换为：

```ts
export function aggregateToDaily(db: BetterSqlite3.Database, beforeDate: string): number {
  const result = db
    .prepare(
      `INSERT OR REPLACE INTO stats_daily
        (date, model_name, channel_id, requests, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, success_count, fail_count, avg_latency_ms)
      SELECT
        date,
        model_name,
        channel_id,
        SUM(requests),
        SUM(input_tokens),
        SUM(output_tokens),
        SUM(cache_read_tokens),
        SUM(cache_write_tokens),
        SUM(cost),
        SUM(success_count),
        SUM(fail_count),
        SUM(avg_latency_ms * (success_count + fail_count)) /
          NULLIF(SUM(success_count + fail_count), 0)
      FROM stats_hourly
      WHERE date < ?
      GROUP BY date, model_name, channel_id`,
    )
    .run(beforeDate);
  return result.changes;
}
```

- [ ] **Step 5: 更新 `getStatsRange`，新增 avgLatencyMs**

将 `getStatsRange` 的 SQL 替换为：

```ts
export function getStatsRange(db: BetterSqlite3.Database, from: string, to: string): DailyStats {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(requests), 0) AS requests,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(cost), 0) AS cost,
        COALESCE(SUM(weighted) / NULLIF(SUM(cnt), 0), 0) AS avg_latency_ms
      FROM (
        SELECT requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost,
               avg_latency_ms * requests AS weighted, requests AS cnt
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT 1, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost,
               duration_ms AS weighted, 1 AS cnt
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
      )`,
    )
    .get(from, to, from, to) as Record<string, number>;

  return {
    requests: row.requests,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    cost: row.cost,
    avgLatencyMs: row.avg_latency_ms,
  };
}
```

- [ ] **Step 6: 新增 5 个查询函数**

在 `getStatsByChannel` 之后追加：

```ts
export function getChannelRanking(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): ChannelRankItem[] {
  const rows = db
    .prepare(
      `SELECT
        channel_id,
        MAX(channel_name) AS channel_name,
        SUM(requests) AS requests,
        SUM(success_count) AS success_count,
        SUM(fail_count) AS fail_count,
        SUM(weighted_latency) / NULLIF(SUM(requests), 0) AS avg_latency_ms,
        SUM(cost) AS cost
      FROM (
        SELECT d.channel_id, COALESCE(c.name, 'unknown') AS channel_name,
               d.requests, d.success_count, d.fail_count,
               d.avg_latency_ms * d.requests AS weighted_latency, d.cost
        FROM stats_daily d LEFT JOIN channels c ON c.id = d.channel_id
        WHERE d.date >= ? AND d.date < ?
        UNION ALL
        SELECT COALESCE(l.channel_id, 0), COALESCE(c.name, 'unknown'),
               1,
               CASE WHEN l.status = 'success' THEN 1 ELSE 0 END,
               CASE WHEN l.status = 'error' THEN 1 ELSE 0 END,
               l.duration_ms, l.cost
        FROM relay_logs l LEFT JOIN channels c ON c.id = l.channel_id
        WHERE date(l.created_at) >= ? AND date(l.created_at) < ?
      )
      GROUP BY channel_id
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    channelId: r.channel_id as number,
    channelName: r.channel_name as string,
    requests: r.requests as number,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
    cost: r.cost as number,
  }));
}

export function getModelRanking(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): ModelRankItem[] {
  const rows = db
    .prepare(
      `SELECT
        model_name,
        SUM(requests) AS requests,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cost) AS cost
      FROM (
        SELECT model_name, requests, input_tokens, output_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT model_name, 1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
      )
      GROUP BY model_name
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    modelName: r.model_name as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}

export function getLatencyPercentiles(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
  channelId?: number,
): LatencyPercentiles {
  const extra = channelId !== undefined ? " AND channel_id = ?" : "";
  const params: (string | number)[] = [from, to];
  if (channelId !== undefined) params.push(channelId);

  const { cnt } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra}`)
    .get(...params) as { cnt: number };

  if (cnt === 0) return { p50: 0, p95: 0, ttftP50: null };

  const p50Offset = Math.max(0, Math.floor(cnt * 0.5) - 1);
  const p95Offset = Math.max(0, Math.floor(cnt * 0.95) - 1);
  const durationSql = `SELECT duration_ms FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} ORDER BY duration_ms LIMIT 1 OFFSET ?`;

  const p50Row = db.prepare(durationSql).get(...params, p50Offset) as { duration_ms: number };
  const p95Row = db.prepare(durationSql).get(...params, p95Offset) as { duration_ms: number };

  const { cnt: ttftCnt } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} AND ttft_ms IS NOT NULL`)
    .get(...params) as { cnt: number };

  let ttftP50: number | null = null;
  if (ttftCnt > 0) {
    const ttftOffset = Math.max(0, Math.floor(ttftCnt * 0.5) - 1);
    const ttftRow = db
      .prepare(`SELECT ttft_ms FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?${extra} AND ttft_ms IS NOT NULL ORDER BY ttft_ms LIMIT 1 OFFSET ?`)
      .get(...params, ttftOffset) as { ttft_ms: number };
    ttftP50 = ttftRow.ttft_ms;
  }

  return { p50: p50Row.duration_ms, p95: p95Row.duration_ms, ttftP50 };
}

export function getChannelStabilityHourly(
  db: BetterSqlite3.Database,
  channelId: number,
  from: string,
  to: string,
): StabilityPoint[] {
  const rows = db
    .prepare(
      `SELECT
        date || 'T' || printf('%02d', hour) AS hour,
        SUM(success_count) AS success_count,
        SUM(fail_count) AS fail_count,
        SUM(avg_latency_ms * (success_count + fail_count)) /
          NULLIF(SUM(success_count + fail_count), 0) AS avg_latency_ms
      FROM stats_hourly
      WHERE channel_id = ? AND date >= ? AND date < ?
        AND (success_count + fail_count) > 0
      GROUP BY date, hour
      ORDER BY date, hour`,
    )
    .all(channelId, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    hour: r.hour as string,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
  }));
}

export function getStatsDailyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost
      FROM (
        SELECT date, requests, input_tokens, output_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at) AS date, 1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
      )
      GROUP BY date ORDER BY date`,
    )
    .all(from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}

export function getStatsHourlyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, hour, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost
      FROM (
        SELECT date, hour, requests, input_tokens, output_tokens, cost
        FROM stats_hourly WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at), CAST(strftime('%H', created_at) AS INTEGER),
               1, input_tokens, output_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
      )
      GROUP BY date, hour ORDER BY date, hour`,
    )
    .all(from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    hour: r.hour as number,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cost: r.cost as number,
  }));
}
```

更新 statsDao.ts 顶部 import，加入新类型：

```ts
import type {
  DailyStats,
  ModelStats,
  ChannelStats,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "@shared/types/gateway";
```

- [ ] **Step 7: 运行测试，确认通过**

```bash
pnpm test test/main/gateway-stats.test.ts
```

预期：全部测试通过。

- [ ] **Step 8: Commit**

```bash
git add src/main/db/models/statsDao.ts test/main/gateway-stats.test.ts
git commit -m "feat(gateway): update aggregation queries, add ranking/percentiles/stability/trend queries"
```

---

## Task 5: GatewayPresenter + IGatewayPresenter 新增方法

**Files:**
- Modify: `src/shared/types/presenters/gateway.presenter.d.ts`
- Modify: `src/main/presenter/gatewayPresenter.ts`

- [ ] **Step 1: 更新 `src/shared/types/presenters/gateway.presenter.d.ts`**

在 import 中追加新类型：

```ts
import type {
  // ...existing...
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "../gateway";
```

在 `// Stats` 注释的方法列表末尾追加：

```ts
getChannelRanking(from: string, to: string): ChannelRankItem[];
getModelRanking(from: string, to: string): ModelRankItem[];
getLatencyPercentiles(from: string, to: string, channelId?: number): LatencyPercentiles;
getChannelStability(channelId: number, from: string, to: string): StabilityPoint[];
getStatsDailyTrend(from: string, to: string): TrendPoint[];
getStatsHourlyTrend(from: string, to: string): TrendPoint[];
```

- [ ] **Step 2: 在 `src/main/presenter/gatewayPresenter.ts` 中实现新方法**

在 `getLogDetail` 方法之后追加（位于 `// --- Prices ---` 之前）：

```ts
getChannelRanking(from: string, to: string): ChannelRankItem[] {
  return statsDao.getChannelRanking(getDb(), from, to);
}

getModelRanking(from: string, to: string): ModelRankItem[] {
  return statsDao.getModelRanking(getDb(), from, to);
}

getLatencyPercentiles(from: string, to: string, channelId?: number): LatencyPercentiles {
  return statsDao.getLatencyPercentiles(getDb(), from, to, channelId);
}

getChannelStability(channelId: number, from: string, to: string): StabilityPoint[] {
  return statsDao.getChannelStabilityHourly(getDb(), channelId, from, to);
}

getStatsDailyTrend(from: string, to: string): TrendPoint[] {
  return statsDao.getStatsDailyTrend(getDb(), from, to);
}

getStatsHourlyTrend(from: string, to: string): TrendPoint[] {
  return statsDao.getStatsHourlyTrend(getDb(), from, to);
}
```

同时更新顶部 import 引入新类型：

```ts
import type {
  // ...existing...
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "@shared/types/gateway";
```

- [ ] **Step 3: 运行类型检查**

```bash
pnpm run typecheck
```

预期：无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/presenters/gateway.presenter.d.ts src/main/presenter/gatewayPresenter.ts
git commit -m "feat(gateway): expose ranking, percentiles, stability, trend via presenter"
```

---

## Task 6: 安装 ECharts + 扩展 gateway store

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/src/stores/gateway.ts`

- [ ] **Step 1: 安装依赖**

```bash
pnpm add echarts vue-echarts
```

- [ ] **Step 2: 运行测试确保无回归**

```bash
pnpm test
```

- [ ] **Step 3: 扩展 `src/renderer/src/stores/gateway.ts`**

在 import 区末尾追加：

```ts
import type {
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  TrendPoint,
} from "@shared/types/gateway";
```

在 `useGatewayStore` 内，`statsRange` 之后添加新 ref：

```ts
const channelRanking = ref<ChannelRankItem[]>([]);
const modelRanking = ref<ModelRankItem[]>([]);
const latencyPercentiles = ref<LatencyPercentiles>({ p50: 0, p95: 0, ttftP50: null });
const channelStability = ref<Map<number, StabilityPoint[]>>(new Map());
const statsTrend = ref<TrendPoint[]>([]);
```

在 `loadStats` 函数之后追加：

```ts
async function loadRanking() {
  const { from, to } = getDateRange(statsRange.value);
  const [ch, mo] = await Promise.all([
    gw.getChannelRanking(from, to),
    gw.getModelRanking(from, to),
  ]);
  channelRanking.value = ch;
  modelRanking.value = mo;
}

async function loadLatencyPercentiles() {
  // 只对 today 和 7d 调用（relay_logs 保留 7 天）
  if (statsRange.value === "30d") {
    latencyPercentiles.value = { p50: 0, p95: 0, ttftP50: null };
    return;
  }
  const { from, to } = getDateRange(statsRange.value);
  latencyPercentiles.value = await gw.getLatencyPercentiles(from, to);
}

async function loadChannelStability(channelId: number) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  // 24小时窗口：yesterday to tomorrow
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const points = await gw.getChannelStability(channelId, from, to);
  channelStability.value = new Map(channelStability.value).set(channelId, points);
}

async function loadStatsTrend() {
  const { from, to } = getDateRange(statsRange.value);
  if (statsRange.value === "today") {
    statsTrend.value = await gw.getStatsHourlyTrend(from, to);
  } else {
    statsTrend.value = await gw.getStatsDailyTrend(from, to);
  }
}
```

在 `return` 语句中导出新的 ref 和 function：

```ts
return {
  // ...existing...
  channelRanking,
  modelRanking,
  latencyPercentiles,
  channelStability,
  statsTrend,
  loadRanking,
  loadLatencyPercentiles,
  loadChannelStability,
  loadStatsTrend,
};
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/src/stores/gateway.ts
git commit -m "feat(gateway): install echarts, extend store with ranking/stability/trend state"
```

---

## Task 7: StatsChart.vue 趋势图

**Files:**
- Create: `src/renderer/src/components/gateway/StatsChart.vue`

- [ ] **Step 1: 创建 `src/renderer/src/components/gateway/StatsChart.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import VChart from "vue-echarts";
import type { TrendPoint } from "@shared/types/gateway";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent]);

const props = defineProps<{
  points: TrendPoint[];
  metric: "requests" | "cost" | "tokens";
  granularity: "hourly" | "daily";
}>();

const xLabels = computed(() =>
  props.points.map((p) =>
    props.granularity === "hourly"
      ? `${String(p.hour ?? 0).padStart(2, "0")}:00`
      : p.date.slice(5),
  ),
);

const series = computed(() => {
  if (props.metric === "requests") {
    return [{ name: "请求数", data: props.points.map((p) => p.requests) }];
  }
  if (props.metric === "cost") {
    return [{ name: "费用($)", data: props.points.map((p) => Number(p.cost.toFixed(4))) }];
  }
  return [
    { name: "Input Token", data: props.points.map((p) => p.inputTokens) },
    { name: "Output Token", data: props.points.map((p) => p.outputTokens) },
  ];
});

const option = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 8, right: 8, bottom: 20, left: 50 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLine: { lineStyle: { color: "#333" } },
    axisLabel: { color: "#555", fontSize: 10 },
  },
  yAxis: {
    type: "value",
    axisLine: { show: false },
    axisLabel: { color: "#555", fontSize: 10 },
    splitLine: { lineStyle: { color: "#1e1e2e" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 12 },
  },
  series: series.value.map((s, i) => ({
    name: s.name,
    type: "line",
    data: s.data,
    smooth: true,
    symbol: "none",
    areaStyle: { opacity: 0.15 },
    lineStyle: { width: 1.5, color: i === 0 ? "#7c3aed" : "#3b82f6" },
    itemStyle: { color: i === 0 ? "#7c3aed" : "#3b82f6" },
  })),
}));
</script>

<template>
  <v-chart :option="option" :autoresize="true" style="height: 90px; width: 100%" />
</template>
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm run typecheck
```

预期：无错误。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/gateway/StatsChart.vue
git commit -m "feat(gateway): add StatsChart ECharts area chart component"
```

---

## Task 8: RankBoard.vue 排行榜

**Files:**
- Create: `src/renderer/src/components/gateway/RankBoard.vue`

- [ ] **Step 1: 创建 `src/renderer/src/components/gateway/RankBoard.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChannelRankItem, ModelRankItem } from "@shared/types/gateway";

const props = defineProps<{
  channelRanking: ChannelRankItem[];
  modelRanking: ModelRankItem[];
}>();

type Tab = "channels" | "models";
type SortKey = "requests" | "cost" | "tokens";

const activeTab = ref<Tab>("channels");
const sortKey = ref<SortKey>("requests");

function successRateClass(item: ChannelRankItem): string {
  const total = item.successCount + item.failCount;
  if (total === 0) return "text-muted-foreground";
  const rate = item.successCount / total;
  if (rate >= 0.95) return "text-emerald-400";
  if (rate >= 0.8) return "text-amber-400";
  return "text-red-400";
}

function successRateText(item: ChannelRankItem): string {
  const total = item.successCount + item.failCount;
  if (total === 0) return "-";
  return `${((item.successCount / total) * 100).toFixed(1)}%`;
}

const maxChannelVal = computed(() => {
  if (props.channelRanking.length === 0) return 1;
  return Math.max(...props.channelRanking.map((r) => r.requests));
});

const sortedChannels = computed(() => {
  return [...props.channelRanking].sort((a, b) => {
    if (sortKey.value === "cost") return b.cost - a.cost;
    if (sortKey.value === "tokens") return 0; // channels don't have direct token field
    return b.requests - a.requests;
  });
});

const maxModelVal = computed(() => {
  if (props.modelRanking.length === 0) return 1;
  if (sortKey.value === "cost") return Math.max(...props.modelRanking.map((r) => r.cost));
  if (sortKey.value === "tokens")
    return Math.max(...props.modelRanking.map((r) => r.inputTokens + r.outputTokens));
  return Math.max(...props.modelRanking.map((r) => r.requests));
});

const sortedModels = computed(() => {
  return [...props.modelRanking].sort((a, b) => {
    if (sortKey.value === "cost") return b.cost - a.cost;
    if (sortKey.value === "tokens")
      return b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
    return b.requests - a.requests;
  });
});

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <div class="flex gap-1">
        <button
          v-for="tab in (['channels', 'models'] as Tab[])"
          :key="tab"
          :class="[
            'rounded border px-2 py-0.5 text-xs',
            activeTab === tab
              ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
              : 'border-border text-muted-foreground',
          ]"
          @click="activeTab = tab"
        >
          {{ tab === 'channels' ? '渠道' : '模型' }}
        </button>
      </div>
      <div class="flex gap-1">
        <button
          v-for="key in (['requests', 'cost', 'tokens'] as SortKey[])"
          :key="key"
          :class="[
            'rounded px-2 py-0.5 text-xs',
            sortKey === key ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground/60',
          ]"
          @click="sortKey = key"
        >
          {{ key === 'requests' ? '请求' : key === 'cost' ? '费用' : 'Token' }}
        </button>
      </div>
    </div>

    <!-- Channel ranking -->
    <template v-if="activeTab === 'channels'">
      <div
        v-for="(item, idx) in sortedChannels.slice(0, 5)"
        :key="item.channelId"
        class="mb-1.5 flex items-center gap-2"
      >
        <span :class="['w-4 text-xs', idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50']">
          {{ idx + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 flex items-center justify-between gap-1">
            <span class="truncate text-xs text-foreground/80">{{ item.channelName }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">{{ formatNum(item.requests) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="h-1 flex-1 rounded-full bg-muted/50">
              <div
                class="h-1 rounded-full bg-violet-500/60"
                :style="{ width: `${(item.requests / maxChannelVal) * 100}%` }"
              />
            </div>
            <span :class="['text-xs', successRateClass(item)]">{{ successRateText(item) }}</span>
          </div>
        </div>
      </div>
      <div v-if="sortedChannels.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无数据
      </div>
    </template>

    <!-- Model ranking -->
    <template v-else>
      <div
        v-for="(item, idx) in sortedModels.slice(0, 5)"
        :key="item.modelName"
        class="mb-1.5 flex items-center gap-2"
      >
        <span :class="['w-4 text-xs', idx === 0 ? 'font-bold text-amber-400' : 'text-muted-foreground/50']">
          {{ idx + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 flex items-center justify-between gap-1">
            <span class="truncate text-xs text-foreground/80">{{ item.modelName }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ sortKey === 'cost' ? `$${item.cost.toFixed(3)}` : formatNum(sortKey === 'tokens' ? item.inputTokens + item.outputTokens : item.requests) }}
            </span>
          </div>
          <div class="h-1 flex-1 rounded-full bg-muted/50">
            <div
              class="h-1 rounded-full bg-blue-500/60"
              :style="{ width: `${((sortKey === 'cost' ? item.cost : sortKey === 'tokens' ? item.inputTokens + item.outputTokens : item.requests) / maxModelVal) * 100}%` }"
            />
          </div>
        </div>
      </div>
      <div v-if="sortedModels.length === 0" class="py-4 text-center text-xs text-muted-foreground">
        暂无数据
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/gateway/RankBoard.vue
git commit -m "feat(gateway): add RankBoard channel/model leaderboard component"
```

---

## Task 9: GatewayPanel.vue Dashboard 扩展

**Files:**
- Modify: `src/renderer/src/views/GatewayPanel.vue`

- [ ] **Step 1: 修改 `src/renderer/src/views/GatewayPanel.vue`**

在 `<script setup>` 顶部新增 import：

```ts
import StatsChart from "@/components/gateway/StatsChart.vue";
import RankBoard from "@/components/gateway/RankBoard.vue";
```

在 `watch(statsRange)` 之后，添加 trend/ranking 联动加载：

```ts
watch(
  () => store.statsRange,
  () => {
    store.loadStats();
    store.loadRanking();
    store.loadLatencyPercentiles();
    store.loadStatsTrend();
  },
);
```

`onMounted` 改为：

```ts
onMounted(() => {
  store.loadAll();
  store.loadRanking();
  store.loadLatencyPercentiles();
  store.loadStatsTrend();
});
```

新增 stat 指标切换 ref（在现有 `rangeOptions` 之后）：

```ts
type MetricKey = "requests" | "cost" | "tokens";
const activeMetric = ref<MetricKey>("requests");
const trendGranularity = computed(() =>
  store.statsRange === "today" ? ("hourly" as const) : ("daily" as const),
);
```

新增辅助格式化：

```ts
function formatLatency(ms: number): string {
  if (ms === 0) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}
```

- [ ] **Step 2: 修改模板 — 扩展 KPI 卡片为 6 个**

将现有 `<div class="grid grid-cols-4 gap-3">` 块替换为：

```html
<div class="grid grid-cols-6 gap-2">
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">请求</div>
    <div class="text-lg font-semibold">{{ formatNumber(store.stats.requests) }}</div>
  </div>
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">费用</div>
    <div class="text-lg font-semibold">{{ formatCost(store.stats.cost) }}</div>
  </div>
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">Input Token</div>
    <div class="text-lg font-semibold">{{ formatNumber(store.stats.inputTokens) }}</div>
    <div class="text-xs text-muted-foreground/60">缓存读 {{ formatNumber(store.stats.cacheReadTokens) }}</div>
  </div>
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">Output Token</div>
    <div class="text-lg font-semibold">{{ formatNumber(store.stats.outputTokens) }}</div>
    <div class="text-xs text-muted-foreground/60">缓存写 {{ formatNumber(store.stats.cacheWriteTokens) }}</div>
  </div>
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">缓存率</div>
    <div class="text-lg font-semibold">{{ formatPercent(store.cacheRate) }}</div>
  </div>
  <div class="rounded-lg bg-muted/50 p-3">
    <div class="text-xs text-muted-foreground">平均延迟</div>
    <div class="text-lg font-semibold">{{ formatLatency(store.stats.avgLatencyMs) }}</div>
    <div v-if="store.latencyPercentiles.ttftP50 !== null" class="text-xs text-muted-foreground/60">
      TTFT P50 {{ formatLatency(store.latencyPercentiles.ttftP50 ?? 0) }}
    </div>
  </div>
</div>
```

- [ ] **Step 3: 在 KPI 卡片下方新增趋势图区域**

在 `</div><!-- /kpi-grid -->` 之后、Tab Bar 之前添加：

```html
<!-- Trend chart -->
<div class="mb-2 mt-3">
  <div class="mb-1 flex items-center justify-between">
    <span class="text-xs text-muted-foreground">趋势</span>
    <div class="flex gap-1">
      <button
        v-for="m in ([
          { key: 'requests', label: '请求' },
          { key: 'cost', label: '费用' },
          { key: 'tokens', label: 'Token' },
        ] as { key: MetricKey; label: string }[])"
        :key="m.key"
        :class="[
          'rounded border px-2 py-0.5 text-xs',
          activeMetric === m.key
            ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
            : 'border-border text-muted-foreground',
        ]"
        @click="activeMetric = m.key"
      >
        {{ m.label }}
      </button>
    </div>
  </div>
  <StatsChart
    :points="store.statsTrend"
    :metric="activeMetric"
    :granularity="trendGranularity"
  />
</div>

<!-- Rank board -->
<div class="mb-2">
  <RankBoard
    :channel-ranking="store.channelRanking"
    :model-ranking="store.modelRanking"
  />
</div>
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/GatewayPanel.vue
git commit -m "feat(gateway): expand dashboard with 6 KPIs, trend chart, rank board"
```

---

## Task 10: ChannelStabilityChart.vue

**Files:**
- Create: `src/renderer/src/components/gateway/ChannelStabilityChart.vue`

- [ ] **Step 1: 创建 `src/renderer/src/components/gateway/ChannelStabilityChart.vue`**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { StabilityPoint } from "@shared/types/gateway";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const props = defineProps<{
  points: StabilityPoint[];
}>();

const xLabels = computed(() => props.points.map((p) => p.hour.slice(11)));

const availabilityData = computed(() =>
  props.points.map((p) => {
    const total = p.successCount + p.failCount;
    if (total === 0) return null;
    return Number(((p.successCount / total) * 100).toFixed(1));
  }),
);

const latencyData = computed(() => props.points.map((p) => Math.round(p.avgLatencyMs)));

const summaryAvailability = computed(() => {
  const valid = props.points.filter((p) => p.successCount + p.failCount > 0);
  if (valid.length === 0) return null;
  const totalSuccess = valid.reduce((s, p) => s + p.successCount, 0);
  const totalAll = valid.reduce((s, p) => s + p.successCount + p.failCount, 0);
  return ((totalSuccess / totalAll) * 100).toFixed(1);
});

const summaryAvgLatency = computed(() => {
  const valid = props.points.filter((p) => p.avgLatencyMs > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((s, p) => s + p.avgLatencyMs, 0) / valid.length);
});

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

const availOption = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 4, right: 4, bottom: 16, left: 36 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLabel: { color: "#555", fontSize: 9 },
    axisLine: { lineStyle: { color: "#222" } },
  },
  yAxis: {
    type: "value",
    min: 0,
    max: 100,
    axisLabel: { color: "#555", fontSize: 9, formatter: "{value}%" },
    splitLine: { lineStyle: { color: "#1a1a2a" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 11 },
    formatter: (params: Array<{ value: number | null }>) =>
      params[0].value !== null ? `${params[0].value}%` : "无流量",
  },
  series: [
    {
      type: "line",
      data: availabilityData.value,
      smooth: true,
      symbol: "circle",
      symbolSize: 4,
      lineStyle: { color: "#4ade80", width: 1.5 },
      itemStyle: {
        color: (p: { value: number | null }) =>
          p.value !== null && p.value < 80 ? "#f87171" : "#4ade80",
      },
      connectNulls: false,
    },
  ],
}));

const latencyOption = computed(() => ({
  backgroundColor: "transparent",
  grid: { top: 4, right: 4, bottom: 16, left: 44 },
  xAxis: {
    type: "category",
    data: xLabels.value,
    axisLabel: { color: "#555", fontSize: 9 },
    axisLine: { lineStyle: { color: "#222" } },
  },
  yAxis: {
    type: "value",
    axisLabel: { color: "#555", fontSize: 9 },
    splitLine: { lineStyle: { color: "#1a1a2a" } },
  },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    textStyle: { color: "#ccc", fontSize: 11 },
  },
  series: [
    {
      name: "avg",
      type: "line",
      data: latencyData.value,
      smooth: true,
      symbol: "none",
      lineStyle: { color: "#60a5fa", width: 1.5 },
    },
  ],
}));
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/20 p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-muted-foreground">稳定性 · 24h</span>
      <div class="flex gap-4">
        <div class="text-center">
          <div :class="['text-sm font-semibold', summaryAvailability !== null && Number(summaryAvailability) >= 95 ? 'text-emerald-400' : summaryAvailability !== null && Number(summaryAvailability) >= 80 ? 'text-amber-400' : 'text-red-400']">
            {{ summaryAvailability !== null ? `${summaryAvailability}%` : '-' }}
          </div>
          <div class="text-xs text-muted-foreground/60">可用率</div>
        </div>
        <div class="text-center">
          <div class="text-sm font-semibold text-blue-400">
            {{ summaryAvgLatency > 0 ? formatLatency(summaryAvgLatency) : '-' }}
          </div>
          <div class="text-xs text-muted-foreground/60">平均延迟</div>
        </div>
      </div>
    </div>
    <div v-if="points.length === 0" class="py-4 text-center text-xs text-muted-foreground">
      暂无流量数据
    </div>
    <div v-else class="grid grid-cols-2 gap-2">
      <div>
        <div class="mb-1 text-xs text-muted-foreground/60">可用率</div>
        <v-chart :option="availOption" :autoresize="true" style="height: 60px" />
      </div>
      <div>
        <div class="mb-1 text-xs text-muted-foreground/60">延迟 (avg)</div>
        <v-chart :option="latencyOption" :autoresize="true" style="height: 60px" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelStabilityChart.vue
git commit -m "feat(gateway): add ChannelStabilityChart availability and latency dual chart"
```

---

## Task 11: ChannelTab.vue 插入稳定性图

**Files:**
- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`

- [ ] **Step 1: 在 `ChannelTab.vue` 的 `<script setup>` 中添加 import 和数据加载**

在顶部 import 末尾追加：

```ts
import ChannelStabilityChart from "@/components/gateway/ChannelStabilityChart.vue";
import { computed } from "vue";
```

在 `selectChannel` 函数末尾追加加载稳定性数据：

```ts
async function selectChannel(ch: Channel) {
  showAddModel.value = false;
  selectedChannelId.value = ch.id;
  await store.loadModelsByChannel(ch.id);
  store.loadChannelStability(ch.id);  // 新增
}
```

新增 computed：

```ts
const selectedStabilityPoints = computed(() => {
  if (!selectedChannelId.value) return [];
  return store.channelStability.get(selectedChannelId.value) ?? [];
});
```

- [ ] **Step 2: 在模板中 channel detail header 之后、模型列表之前插入稳定性图**

找到 `<!-- Channel detail header -->` 对应的 div 块结束之后，找到模型列表开始之前，插入：

```html
<!-- Stability chart -->
<ChannelStabilityChart
  v-if="selectedChannel"
  :points="selectedStabilityPoints"
  class="mb-4"
/>
```

- [ ] **Step 3: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "feat(gateway): add ChannelStabilityChart to channel detail panel"
```

---

## Task 12: LogTab.vue 新增 TTFT 列

**Files:**
- Modify: `src/renderer/src/components/gateway/LogTab.vue`

- [ ] **Step 1: 在 `LogTab.vue` 列表中找到 TTFT 列的插入位置**

找到耗时列（`durationMs`）所在的 `<td>` 或表头之前，插入 TTFT 列。

在表头行（含"耗时"的 `<th>` 之前）插入：

```html
<th class="...">TTFT</th>
```

在表体行（含 `log.durationMs` 的 `<td>` 之前）插入：

```html
<td class="...">
  {{ log.ttftMs != null ? formatDuration(log.ttftMs) : '-' }}
</td>
```

其中 `formatDuration` 是已有的格式化函数（复用现有 durationMs 格式化逻辑）。如无此函数，新增：

```ts
function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
```

- [ ] **Step 2: 运行类型检查**

```bash
pnpm run typecheck
```

- [ ] **Step 3: 运行 lint 和 format**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 4: 运行全量测试**

```bash
pnpm test
```

预期：全部通过（包含 gateway-stats.test.ts 中所有新增测试）。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/gateway/LogTab.vue
git commit -m "feat(gateway): add TTFT column to log list"
```

---

## 自查说明

**Spec 覆盖检查：**
- ✅ 缓存 token 分项（Input Token 卡片含缓存读/写）
- ✅ Input/Output token 分离（6 卡片中独立展示）
- ✅ TTFT 采集（Task 3 relay.ts）
- ✅ 趋势图（Task 7 StatsChart）
- ✅ 排行榜渠道+模型（Task 8 RankBoard）
- ✅ 日志 TTFT 列（Task 12）
- ✅ 可用率指标（Task 4 getChannelStabilityHourly）
- ✅ 延迟指标 P50/P95（Task 4 getLatencyPercentiles）
- ✅ 渠道详情稳定性图（Task 10-11）
- ✅ Dashboard 整体布局（Task 9 GatewayPanel）

**类型一致性：**
- `StabilityPoint.hour` 格式为 `"2026-04-27T10"`（`date || 'T' || printf('%02d', hour)`），ChannelStabilityChart 取 `p.hour.slice(11)` 得到 `"10"`
- `ChannelRankItem.successCount/failCount` 与 `RankBoard` 中 `successRateText` 计算一致
- `TrendPoint` 在 statsDao、gateway.d.ts、StatsChart.vue props 中字段名一致
