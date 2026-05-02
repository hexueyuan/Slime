# Channel 实时指标看板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将供应商详情看板从 24h 小时粒度稳定性图表改为最近 30 分钟、每分钟一个数据点、LOG_ADDED 事件驱动实时更新的图表。

**Architecture:** 新增 `MinutePoint` 类型 + `getChannelStabilityMinute` DAO（直查 relay_logs 按分钟聚合）+ Presenter 方法 + Store action + 新 `ChannelRealtimeChart` 组件；`ChannelTab` 监听 `LOG_ADDED` + debounce 1s 触发刷新。

**Tech Stack:** TypeScript, Vue 3 Composition API, Pinia, ECharts (vue-echarts), better-sqlite3, Electron IPC

---

## 文件变更清单

| 文件                                                           | 类型                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `src/shared/types/gateway.d.ts`                                | 修改——新增 `MinutePoint` 接口                   |
| `src/shared/types/presenters/gateway.presenter.d.ts`           | 修改——新增 `getChannelMinuteStability` 方法签名 |
| `src/main/db/models/statsDao.ts`                               | 修改——新增 `getChannelStabilityMinute` 函数     |
| `src/main/presenter/gatewayPresenter.ts`                       | 修改——新增 `getChannelMinuteStability` 方法     |
| `src/renderer/src/stores/gateway.ts`                           | 修改——新增 state + action                       |
| `src/renderer/src/components/gateway/ChannelRealtimeChart.vue` | 新建——30分钟实时图表组件                        |
| `src/renderer/src/components/gateway/ChannelTab.vue`           | 修改——替换图表组件，监听 LOG_ADDED              |
| `test/main/gateway-stats.test.ts`                              | 修改——新增 `getChannelStabilityMinute` 测试     |

---

## Task 1: 新增 MinutePoint 类型和 Presenter 接口

**Files:**

- Modify: `src/shared/types/gateway.d.ts`
- Modify: `src/shared/types/presenters/gateway.presenter.d.ts`

- [ ] **Step 1: 在 gateway.d.ts 末尾新增 MinutePoint 接口**

在 `src/shared/types/gateway.d.ts` 中，找到 `StabilityPoint` 接口定义后面，添加：

```typescript
export interface MinutePoint {
  minute: string; // "2026-05-03T14:32"
  successCount: number;
  failCount: number;
  avgLatencyMs: number | null;
}
```

- [ ] **Step 2: 在 Presenter 接口中新增方法签名**

在 `src/shared/types/presenters/gateway.presenter.d.ts` 中：

1. 在顶部 import 语句中加入 `MinutePoint`：

```typescript
import type {
  // ...现有 imports...
  StabilityPoint,
  MinutePoint,
  TrendPoint,
} from "../gateway";
```

2. 在 `getChannelStability` 方法后面添加：

```typescript
  getChannelMinuteStability(channelId: number): MinutePoint[];
```

- [ ] **Step 3: 运行类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

预期：无新增错误。

- [ ] **Step 4: 提交**

```bash
git add src/shared/types/gateway.d.ts src/shared/types/presenters/gateway.presenter.d.ts
git commit -m "feat(gateway): add MinutePoint type and presenter interface"
```

---

## Task 2: 新增 DAO 函数 getChannelStabilityMinute

**Files:**

- Modify: `src/main/db/models/statsDao.ts`
- Test: `test/main/gateway-stats.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/main/gateway-stats.test.ts` 的 `describe("statsDao 稳定性查询", ...)` 块末尾（第 221 行 `});` 之前）新增：

```typescript
it("getChannelStabilityMinute 返回最近30分钟按分钟聚合数据", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-03T14:35:00Z"));
  const { getChannelStabilityMinute } = await import("@/db/models/statsDao");

  // 插入 14:32 两条（1 success, 1 error）
  db.prepare(
    `
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 200, ?, ?)
    `,
  ).run("success", "2026-05-03 14:32:00");
  db.prepare(
    `
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 400, ?, ?)
    `,
  ).run("error", "2026-05-03 14:32:30");

  // 插入 14:05（超出30分钟范围，不应出现）
  db.prepare(
    `
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES ('g', 'gpt-4o', 1, 'ch1', 100, 50, 0, 0, 0.001, 100, ?, ?)
    `,
  ).run("success", "2026-05-03 14:04:00");

  const rows = getChannelStabilityMinute(db, 1);
  expect(rows).toHaveLength(1);
  expect(rows[0].minute).toBe("2026-05-03T14:32");
  expect(rows[0].successCount).toBe(1);
  expect(rows[0].failCount).toBe(1);
  expect(rows[0].avgLatencyMs).toBeCloseTo(200); // avg 只取 success 的 duration_ms
  vi.useRealTimers();
});

it("getChannelStabilityMinute channel_id 隔离", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-03T14:35:00Z"));
  const { getChannelStabilityMinute } = await import("@/db/models/statsDao");

  // channel_id=2 的日志
  db.prepare(
    `
      INSERT INTO relay_logs
        (group_name, model_name, channel_id, channel_name, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, duration_ms, status, created_at)
      VALUES ('g', 'gpt-4o', 2, 'ch2', 100, 50, 0, 0, 0.001, 100, 'success', '2026-05-03 14:32:00')
    `,
  ).run();

  const rows = getChannelStabilityMinute(db, 1);
  expect(rows).toHaveLength(0); // channel 1 无数据
  vi.useRealTimers();
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm test test/main/gateway-stats.test.ts 2>&1 | tail -20
```

预期：`getChannelStabilityMinute is not a function` 或类似错误。

- [ ] **Step 3: 实现 getChannelStabilityMinute**

在 `src/main/db/models/statsDao.ts` 中，在顶部 import 的类型列表里加入 `MinutePoint`：

```typescript
import type {
  DailyStats,
  ModelStats,
  ChannelStats,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  MinutePoint,
  TrendPoint,
} from "@shared/types/gateway";
```

然后在 `getChannelStabilityHourly` 函数之后（约第 370 行）添加：

```typescript
export function getChannelStabilityMinute(
  db: BetterSqlite3.Database,
  channelId: number,
): MinutePoint[] {
  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%dT%H:%M', created_at) AS minute,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS fail_count,
        AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_latency_ms
      FROM relay_logs
      WHERE channel_id = ?
        AND created_at >= datetime('now', '-30 minutes')
      GROUP BY minute
      ORDER BY minute`,
    )
    .all(channelId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    minute: r.minute as string,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    avgLatencyMs: r.avg_latency_ms !== null ? (r.avg_latency_ms as number) : null,
  }));
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm test test/main/gateway-stats.test.ts 2>&1 | tail -20
```

预期：所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/db/models/statsDao.ts test/main/gateway-stats.test.ts
git commit -m "feat(gateway): add getChannelStabilityMinute DAO"
```

---

## Task 3: GatewayPresenter 新增 getChannelMinuteStability 方法

**Files:**

- Modify: `src/main/presenter/gatewayPresenter.ts`

- [ ] **Step 1: 在 gatewayPresenter.ts 中新增 import 和方法**

1. 在顶部 import 语句中加入 `MinutePoint`：

```typescript
import type {
  // ...现有 imports...
  StabilityPoint,
  MinutePoint,
  TrendPoint,
} from "@shared/types/gateway";
```

2. 在 `getChannelStability` 方法（约第 396 行）之后添加：

```typescript
  getChannelMinuteStability(channelId: number): MinutePoint[] {
    return statsDao.getChannelStabilityMinute(getDb(), channelId)
  }
```

- [ ] **Step 2: 运行类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

预期：无错误（`IGatewayPresenter` 接口要求该方法存在，现在已实现）。

- [ ] **Step 3: 提交**

```bash
git add src/main/presenter/gatewayPresenter.ts
git commit -m "feat(gateway): expose getChannelMinuteStability in presenter"
```

---

## Task 4: Gateway Store 新增 channelMinuteStability state 和 action

**Files:**

- Modify: `src/renderer/src/stores/gateway.ts`

- [ ] **Step 1: 更新 gateway store**

在 `src/renderer/src/stores/gateway.ts` 中做以下修改：

1. 在 import 类型列表中加入 `MinutePoint`：

```typescript
import type {
  Channel,
  ChannelKey,
  Group,
  GatewayApiKey,
  DailyStats,
  RelayLog,
  Model,
  ChannelRankItem,
  ModelRankItem,
  LatencyPercentiles,
  StabilityPoint,
  MinutePoint,
  TrendPoint,
} from "@shared/types/gateway";
```

2. 在 `channelStability` state 后添加新 state（约第 41 行）：

```typescript
const channelMinuteStability = ref<Map<number, MinutePoint[]>>(new Map());
```

3. 在 `loadChannelStability` 函数后添加新 action（约第 114 行）：

```typescript
async function loadChannelMinuteStability(channelId: number) {
  const points = await gw.getChannelMinuteStability(channelId);
  channelMinuteStability.value = new Map(channelMinuteStability.value).set(channelId, points);
}
```

4. 在 `return` 对象中加入新增的 state 和 action：

```typescript
return {
  // ...现有 return 字段...
  channelMinuteStability,
  loadChannelMinuteStability,
};
```

- [ ] **Step 2: 运行类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/stores/gateway.ts
git commit -m "feat(gateway): add channelMinuteStability state and action to store"
```

---

## Task 5: 新建 ChannelRealtimeChart.vue 组件

**Files:**

- Create: `src/renderer/src/components/gateway/ChannelRealtimeChart.vue`

- [ ] **Step 1: 创建组件文件**

新建 `src/renderer/src/components/gateway/ChannelRealtimeChart.vue`，内容如下：

```vue
<script setup lang="ts">
import { computed } from "vue";
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import VChart from "vue-echarts";
import type { MinutePoint } from "@shared/types/gateway";

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent]);

const props = defineProps<{
  points: MinutePoint[];
}>();

// 生成最近 30 个整分钟的时间串 ["2026-05-03T14:06", ..., "2026-05-03T14:35"]
function getLast30Minutes(): string[] {
  const result: string[] = [];
  const now = new Date();
  // 从当前整分钟往前推 29 分钟
  const base = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0,
  );
  for (let i = 29; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 60 * 1000);
    const mm = String(t.getMinutes()).padStart(2, "0");
    const hh = String(t.getHours()).padStart(2, "0");
    const yyyy = t.getFullYear();
    const mo = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    result.push(`${yyyy}-${mo}-${dd}T${hh}:${mm}`);
  }
  return result;
}

const filledPoints = computed(() => {
  const byMinute = new Map<string, MinutePoint>();
  for (const p of props.points) {
    byMinute.set(p.minute, p);
  }
  const slots = getLast30Minutes();
  return slots.map(
    (m) => byMinute.get(m) ?? { minute: m, successCount: 0, failCount: 0, avgLatencyMs: null },
  );
});

const hasData = computed(() => props.points.some((p) => p.successCount + p.failCount > 0));

const xLabels = computed(() => filledPoints.value.map((p) => p.minute.slice(11))); // "HH:MM"

const availabilityData = computed(() =>
  filledPoints.value.map((p) => {
    const total = p.successCount + p.failCount;
    if (total === 0) return null;
    return Number(((p.successCount / total) * 100).toFixed(1));
  }),
);

const latencyData = computed(() =>
  filledPoints.value.map((p) =>
    p.successCount + p.failCount > 0 && p.avgLatencyMs !== null ? Math.round(p.avgLatencyMs) : null,
  ),
);

const summaryAvailability = computed(() => {
  const valid = props.points.filter((p) => p.successCount + p.failCount > 0);
  if (valid.length === 0) return null;
  const totalSuccess = valid.reduce((s, p) => s + p.successCount, 0);
  const totalAll = valid.reduce((s, p) => s + p.successCount + p.failCount, 0);
  return ((totalSuccess / totalAll) * 100).toFixed(1);
});

const summaryAvgLatency = computed(() => {
  const valid = props.points.filter(
    (p) => p.avgLatencyMs !== null && p.successCount + p.failCount > 0,
  );
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((s, p) => s + (p.avgLatencyMs as number), 0) / valid.length);
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
    axisLabel: {
      color: "#555",
      fontSize: 9,
      interval: 4, // 每 5 个显示一个标签，避免拥挤
    },
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
    formatter: (params: Array<{ value: number | null; axisValue: string }>) =>
      params[0].value !== null
        ? `${params[0].axisValue}  ${params[0].value}%`
        : `${params[0].axisValue}  无流量`,
  },
  series: [
    {
      type: "line",
      data: availabilityData.value,
      smooth: false,
      symbol: "circle",
      symbolSize: 3,
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
    axisLabel: {
      color: "#555",
      fontSize: 9,
      interval: 4,
    },
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
      smooth: false,
      symbol: "circle",
      symbolSize: 3,
      lineStyle: { color: "#60a5fa", width: 1.5 },
      connectNulls: false,
    },
  ],
}));
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/20 p-3">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-muted-foreground">稳定性 · 近30分钟</span>
      <div class="flex gap-4">
        <div class="text-center">
          <div
            :class="[
              'text-sm font-semibold',
              summaryAvailability !== null && Number(summaryAvailability) >= 95
                ? 'text-emerald-400'
                : summaryAvailability !== null && Number(summaryAvailability) >= 80
                  ? 'text-amber-400'
                  : 'text-red-400',
            ]"
          >
            {{ summaryAvailability !== null ? `${summaryAvailability}%` : "-" }}
          </div>
          <div class="text-xs text-muted-foreground/60">可用率</div>
        </div>
        <div class="text-center">
          <div class="text-sm font-semibold text-blue-400">
            {{ summaryAvgLatency > 0 ? formatLatency(summaryAvgLatency) : "-" }}
          </div>
          <div class="text-xs text-muted-foreground/60">平均延迟</div>
        </div>
      </div>
    </div>
    <div v-if="!hasData" class="py-4 text-center text-xs text-muted-foreground">暂无流量数据</div>
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
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/gateway/ChannelRealtimeChart.vue
git commit -m "feat(gateway): add ChannelRealtimeChart component"
```

---

## Task 6: 改造 ChannelTab.vue

**Files:**

- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`

- [ ] **Step 1: 更新 ChannelTab.vue 的 script 部分**

在 `src/renderer/src/components/gateway/ChannelTab.vue` 中做以下修改：

1. 替换 import（第 2 行）：将 `import { ref, computed, watch, onMounted } from "vue"` 改为：

```typescript
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
```

2. 替换图表组件 import（第 8 行）：将

```typescript
import ChannelStabilityChart from "@/components/gateway/ChannelStabilityChart.vue";
```

改为：

```typescript
import ChannelRealtimeChart from "@/components/gateway/ChannelRealtimeChart.vue";
```

3. 在 script setup 顶部添加 IPC 事件监听相关 import：

```typescript
import { GATEWAY_EVENTS } from "@shared/events";
```

4. 将 `selectedStabilityPoints` computed（约第 199 行）替换为 `selectedMinutePoints`：

```typescript
const selectedMinutePoints = computed(() => {
  if (!selectedChannelId.value) return [];
  return store.channelMinuteStability.get(selectedChannelId.value) ?? [];
});
```

5. 将 `selectChannel` 函数中的 `store.loadChannelStability(ch.id)` 替换为 `store.loadChannelMinuteStability(ch.id)`（约第 178 行）：

```typescript
async function selectChannel(ch: Channel) {
  showAddModel.value = false;
  newCapModelName.value = "";
  selectedChannelId.value = ch.id;
  await store.loadModelsByChannel(ch.id);
  store.loadChannelMinuteStability(ch.id);
}
```

6. 在 `onMounted(() => autoSelectFirst(store.channels))` 之后添加 LOG_ADDED 监听（带 debounce）：

```typescript
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const cleanupLogAdded = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  if (!selectedChannelId.value) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    store.loadChannelMinuteStability(selectedChannelId.value!);
  }, 1000);
});

onUnmounted(() => {
  cleanupLogAdded?.();
  if (debounceTimer) clearTimeout(debounceTimer);
});
```

- [ ] **Step 2: 更新 template 部分**

在 template 中（约第 385 行），将：

```html
<ChannelStabilityChart v-if="selectedChannel" :points="selectedStabilityPoints" class="mb-4" />
```

替换为：

```html
<ChannelRealtimeChart v-if="selectedChannel" :points="selectedMinutePoints" class="mb-4" />
```

- [ ] **Step 3: 运行类型检查和 lint**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck && pnpm run lint
```

预期：无错误。

- [ ] **Step 4: 运行格式化**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run format
```

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "feat(gateway): replace stability chart with realtime 30min chart"
```

---

## Task 7: 验收

- [ ] **Step 1: 运行全量测试**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm test
```

预期：所有测试 PASS，无新增失败。

- [ ] **Step 2: 最终类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck
```

预期：无错误。

- [ ] **Step 3: 提交 format 结果（若有改动）**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && git diff --stat
# 若有 format 改动：
git add -u && git commit -m "style: format"
```
