# 供应商详情实时指标看板设计

**日期**: 2026-05-03
**状态**: 已确认

## 背景

当前供应商详情看板（ChannelTab）展示的是 24 小时、小时粒度的稳定性图表（ChannelStabilityChart）。
需求：改为默认展示最近 30 分钟、每分钟一个数据点、实时更新的指标看板。

## 设计决策

- **数据来源**：直接查 `relay_logs` 表，按分钟 GROUP BY，不引入新聚合表（30 分钟内数据不会被 flush 到 `stats_hourly`，全表扫描代价低）
- **实时更新**：复用现有 `GATEWAY_EVENTS.LOG_ADDED` IPC 事件驱动，前端 debounce 1s 防抖，不轮询

## 数据层

### 新增类型（`src/shared/types/gateway.d.ts`）

```typescript
interface MinutePoint {
  minute: string; // "2026-05-03T14:32"
  successCount: number;
  failCount: number;
  avgLatencyMs: number | null;
}
```

### 新增 DAO 函数（`src/main/db/models/statsDao.ts`）

`getChannelStabilityMinute(db, channelId): MinutePoint[]`

```sql
SELECT
  strftime('%Y-%m-%dT%H:%M', created_at) AS minute,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
  SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS fail_count,
  AVG(CASE WHEN status = 'success' THEN duration_ms END) AS avg_latency_ms
FROM relay_logs
WHERE channel_id = ?
  AND created_at >= datetime('now', '-30 minutes')
GROUP BY minute
ORDER BY minute
```

时间范围由 SQL 内部计算，不由调用方传入。

## Presenter 层

**`src/main/presenter/gatewayPresenter.ts`** 新增方法：

```typescript
async getChannelMinuteStability(channelId: number): Promise<MinutePoint[]>
```

## Store 层

**`src/renderer/src/stores/gateway.ts`** 新增：

```typescript
// state
channelMinuteStability: Map<number, MinutePoint[]>

// action
async loadChannelMinuteStability(channelId: number): Promise<void>
```

## 前端组件

### 新增 ChannelRealtimeChart.vue

**路径**: `src/renderer/src/components/gateway/ChannelRealtimeChart.vue`

- **Props**: `points: MinutePoint[]`
- **filledPoints computed**: 补齐最近 30 个整分钟点，缺失点填 `null`，X 轴固定 30 个点
- **图表布局**: 与 ChannelStabilityChart 一致——上图可用率折线，下图延迟折线
- **X 轴标签**: `HH:MM` 格式
- **空数据点**: `connectNulls: false`，无数据时不连线

### 改造 ChannelTab.vue

- 将 `<ChannelStabilityChart>` 替换为 `<ChannelRealtimeChart>`
- `selectChannel` 时调用 `store.loadChannelMinuteStability(channelId)`
- 监听 `GATEWAY_EVENTS.LOG_ADDED`，收到事件后 debounce 1s 触发 `loadChannelMinuteStability`
- `onUnmounted` 清理 IPC 监听器（`let cleanup = ipcRenderer.on(...); onUnmounted(() => cleanup?.())`）

## 改动文件清单

| 文件                                                           | 变更类型                           |
| -------------------------------------------------------------- | ---------------------------------- |
| `src/shared/types/gateway.d.ts`                                | 新增 `MinutePoint` 类型            |
| `src/main/db/models/statsDao.ts`                               | 新增 `getChannelStabilityMinute()` |
| `src/main/presenter/gatewayPresenter.ts`                       | 新增 `getChannelMinuteStability()` |
| `src/renderer/src/stores/gateway.ts`                           | 新增 state + action                |
| `src/renderer/src/components/gateway/ChannelRealtimeChart.vue` | 新增组件                           |
| `src/renderer/src/components/gateway/ChannelTab.vue`           | 替换图表组件 + 监听逻辑            |

## 不涉及的改动

- `stats_hourly` / `stats_daily` 聚合逻辑不变
- `ChannelStabilityChart.vue` 保留不动（未来可并列展示）
- 主看板（GatewayPanel）不受影响
