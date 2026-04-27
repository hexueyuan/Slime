# Stats Dashboard 改造设计文档

**日期**: 2026-04-27
**分支**: brave
**状态**: 待实现

## 目标

改造 Gateway 统计功能，参考 octopus 实现，新增：
- 缓存 token 分项展示、input/output token 分离统计
- 请求级别首字时间（TTFT）采集
- 趋势图（请求/费用/Token）
- 排行榜（渠道 + 模型）
- 渠道稳定性指标（可用率 + 延迟趋势）
- 日志列表新增 TTFT 列

## 一、数据层变更

### 1.1 relay_logs 新增字段

```sql
ALTER TABLE relay_logs ADD COLUMN ttft_ms INTEGER;  -- 首字时间，非流式为 NULL
```

### 1.2 stats_hourly / stats_daily 新增字段

```sql
ALTER TABLE stats_hourly ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_hourly ADD COLUMN fail_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_hourly ADD COLUMN avg_latency_ms REAL   NOT NULL DEFAULT 0;

ALTER TABLE stats_daily  ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_daily  ADD COLUMN fail_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_daily  ADD COLUMN avg_latency_ms REAL   NOT NULL DEFAULT 0;
```

### 1.3 数据保留策略（现有，不变）

| 表 | 保留时长 |
|---|---|
| relay_logs | 7 天 |
| stats_hourly | 30 天 |
| stats_daily | 90 天 |

## 二、可用率指标定义

- **计算单位**: 每小时窗口（复用 stats_hourly）
- **可用率公式**: `sum(success_count) / sum(success_count + fail_count)`，按请求量加权
- **无流量窗口处理**: 排除法——分母只计有请求的小时格，趋势图中无流量时段显示空白
- **被动监控**: 不做主动探测，无流量时无数据，接受此设计

### 缓存率定义

```
缓存率 = cacheReadTokens / inputTokens
```

时间窗口与顶部今日/7天/30天选择器同步。

## 三、延迟指标

| 指标 | 来源 | 时间范围限制 |
|------|------|------|
| 平均延迟 | stats_hourly.avg_latency_ms | 无限制 |
| P50 延迟 | relay_logs ORDER BY duration_ms | ≤ 7 天 |
| P95 延迟 | relay_logs ORDER BY duration_ms | ≤ 7 天 |
| TTFT P50 | relay_logs ORDER BY ttft_ms，过滤 NULL | ≤ 7 天 |

P50/P95 直接从 relay_logs 排序取中位数，个人网关流量规模下性能可接受。

## 四、后端变更

### 4.1 TTFT 采集（relay.ts）

在 `wrappedStream()` generator 内：
- 记录 `startTime = Date.now()`
- 收到首个有效 chunk 时：`ttftMs = Date.now() - startTime`，之后不再更新
- 非流式 relay 路径：`ttftMs = null`
- 通过 `statsCallback` 传递给 StatsCollector

### 4.2 StatsCallback 扩展（relay.ts / stats.ts）

```ts
type StatsCallback = (data: {
  // ...现有字段...
  ttftMs: number | null   // 新增
}) => void
```

`insertLogs` 写入时包含 `ttft_ms`。

### 4.3 聚合更新（statsDao.ts）

`aggregateToHourly` GROUP BY 查询补充：
```sql
SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success_count,
SUM(CASE WHEN status='error'   THEN 1 ELSE 0 END) AS fail_count,
AVG(duration_ms) AS avg_latency_ms
```

`aggregateToDaily` 同步从 stats_hourly 聚合新字段：
```sql
SUM(success_count), SUM(fail_count), AVG(avg_latency_ms)
```

### 4.4 新增查询方法（statsDao.ts）

```ts
// 渠道每小时稳定性（可用率趋势 + 延迟趋势）
getChannelStabilityHourly(db, channelId, from, to): StabilityPoint[]
// StabilityPoint = { hour: string, successCount, failCount, avgLatencyMs }

// 渠道排行（按指定维度汇总）
getChannelRanking(db, from, to): ChannelRankItem[]
// ChannelRankItem = { channelId, channelName, requests, successRate, avgLatencyMs, cost }

// 模型排行
getModelRanking(db, from, to): ModelRankItem[]
// ModelRankItem = { modelName, requests, inputTokens, outputTokens, cost }

// P50/P95（仅 ≤7天）
getLatencyPercentiles(db, from, to, channelId?): { p50: number, p95: number, ttftP50: number | null }
```

### 4.5 GatewayPresenter 新增 IPC 方法

```ts
getChannelStability(channelId, from, to): Promise<StabilityPoint[]>
getChannelRanking(from, to): Promise<ChannelRankItem[]>
getModelRanking(from, to): Promise<ModelRankItem[]>
getLatencyPercentiles(from, to, channelId?): Promise<LatencyPercentiles>
```

### 4.6 类型扩展（gateway.d.ts）

新增：`StabilityPoint`, `ChannelRankItem`, `ModelRankItem`, `LatencyPercentiles`

`RelayLog` 新增 `ttftMs: number | null`。

## 五、前端变更

### 5.1 新增依赖

```
echarts
vue-echarts
```

使用 ECharts 暗色主题，与项目现有 dark mode 一致。

### 5.2 新增组件

| 组件 | 路径 | 职责 |
|------|------|------|
| `StatsChart.vue` | `components/gateway/` | 趋势 Area Chart，可切换请求/费用/Token，使用 stats_hourly/daily 数据 |
| `RankBoard.vue` | `components/gateway/` | 渠道榜 + 模型榜，各含进度条、成功率 badge、切换排序维度 |
| `ChannelStabilityChart.vue` | `components/gateway/` | 渠道详情内双图：可用率折线 + 延迟折线（avg 实线/P95 虚线），含汇总 KPI |

### 5.3 GatewayPanel.vue 顶部 Dashboard 扩展

KPI 卡片从 4 个扩展为 6 个：

```
请求数 | 费用 | Input Token | Output Token | 缓存率 | 平均延迟(+TTFT均值)
```

Dashboard 区域新增：
1. `StatsChart`（趋势图，默认请求，可切换费用/Token）
2. `RankBoard`（渠道榜/模型榜，可切换请求/费用/Token 排序）

顶部 Dashboard 固定展开（方案 A），不折叠。

### 5.4 ChannelTab.vue

在渠道详情面板（右侧）的 header 与模型列表之间插入 `ChannelStabilityChart`，展示该渠道过去 24 小时的稳定性数据，时间范围固定为 24h（不受顶部选择器影响）。

### 5.5 LogTab.vue

日志列表新增 `TTFT` 列，非流式请求显示 `-`。列顺序：

```
时间 | 模型 | 渠道 | 来源 | Input | Output | TTFT(新) | 耗时 | 费用 | 状态
```

### 5.6 gateway store（gateway.ts）

新增状态与 actions：
```ts
channelRanking: ChannelRankItem[]
modelRanking: ModelRankItem[]
channelStability: Map<number, StabilityPoint[]>

loadChannelRanking()
loadModelRanking()
loadChannelStability(channelId)
```

## 六、UI 设计稿

设计稿 HTML 文件：`.superpowers/brainstorm/68124-1777292776/content/frontend-design.html`

关键视觉决策：
- 成功率 badge：≥95% 绿色，80-95% 黄色，<80% 红色
- 可用率趋势：绿色折线，故障时段红点标注
- 延迟趋势：avg 蓝色实线，P95 紫色虚线，双 y 轴

## 七、不在范围内

- 主动探测（定时健康检查）
- P50/P95 预聚合表（流量规模不需要）
- 暗色模式动态切换（已有 todo，非本次范围）
