# Anthropic Prompt Caching 透传设计

## 背景

Slime Gateway 目前的数据层已准备好缓存追踪（`relay_logs`、`stats_*` 有 `cache_read_tokens` / `cache_write_tokens`，`model_prices` 有缓存定价），但链路中缺失 `cache_control` 的透传，导致上游 Anthropic 缓存从未触发。每次请求都完整计算，费用高、速度慢。

Anthropic 支持两种缓存模式：
- **自动缓存**：请求体顶级加 `cache_control: { type: "ephemeral" }`，系统自动管理断点
- **显式断点**：content block / tool / system part 级别加 `cache_control`

本设计实现两种模式的完整透传，并在 Slime 内部客户端启用自动缓存。

## 类型定义

### `src/main/gateway/outbound/types.ts`

```typescript
// 新增
export interface CacheControl {
  type: "ephemeral"
  ttl?: string  // "5m" | "1h"，透传用
}

export type InternalContent =
  | { type: "text"; text: string; cacheControl?: CacheControl }
  | { type: "image"; source: ...; cacheControl?: CacheControl }
  | { type: "tool_use"; id: string; name: string; input: unknown; cacheControl?: CacheControl }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean; cacheControl?: CacheControl }

export interface InternalTool {
  name: string
  description?: string
  inputSchema: unknown
  cacheControl?: CacheControl  // 新增
}

export interface InternalRequest {
  // ...existing fields
  cacheControl?: CacheControl  // 新增：顶级自动缓存
  systemParts?: SystemTextPart[]  // 新增：数组格式 system（保留 cache_control）
}

export interface SystemTextPart {
  type: "text"
  text: string
  cacheControl?: CacheControl
}
```

## 入站解析

### `src/main/gateway/inbound/anthropic.ts`

1. `AnthropicRequestBody` 加 `cache_control?: { type: string; ttl?: string }`
2. `AnthropicContentBlock` 加 `cache_control?: { type: string }`
3. `AnthropicToolDef` 加 `cache_control?: { type: string }`
4. `parseSystem` 改为返回 `{ systemPrompt?: string, systemParts?: SystemTextPart[] }`：
   - 字符串 system → `systemPrompt`
   - 数组 system 且无 cache_control → 拼接为 `systemPrompt`
   - 数组 system 且有 cache_control → `systemParts`（保留结构化）
5. `toInternalContent`：block 有 `cache_control` 时带出 `cacheControl`
6. Tool 转换：map 时带出 `cacheControl`
7. 请求顶级 `cache_control` → `req.cacheControl`

## 出站序列化

### `src/main/gateway/outbound/anthropic.ts`

1. `toAnthropicRequest`：
   - `req.cacheControl` 存在时 `body.cache_control = req.cacheControl`
   - `req.systemParts` 存在时 `body.system = systemParts`（数组格式），否则用 `systemPrompt`（字符串）
   - Tools map 带出 `cache_control`
2. `convertContent`：每个 block 存在 `cacheControl` 时带出 `cache_control`

## 客户端自动缓存

### `src/main/llm/providers/anthropic/types.ts`

`AnthropicRequestBody` 加 `cache_control?: { type: string }`

### `src/main/llm/providers/anthropic/requestBuilder.ts`

`buildAnthropicRequest` 返回体加 `cache_control: { type: "ephemeral" }`。

Gateway 透传后，Anthropic 自动缓存 system prompt、tools、历史消息前缀，无需手动管理断点。

## 统计指标补充

### `src/shared/types/gateway.d.ts`

| 类型 | 补字段 |
|------|--------|
| `TrendPoint` | `cacheReadTokens: number`、`cacheWriteTokens: number` |
| `ChannelRankItem` | `cacheReadTokens: number`、`cacheWriteTokens: number` |
| `ModelRankItem` | `cacheReadTokens: number`、`cacheWriteTokens: number` |

### `src/main/db/models/statsDao.ts`

趋势查询和排名查询 SQL 补 `SUM(cache_read_tokens)`、`SUM(cache_write_tokens)`。

### `src/renderer/src/views/GatewayPanel.vue`

- `MetricKey` 加 `"cachedTokens"`
- `metricOptions` 加 `{ key: "cachedTokens", label: "缓存Token" }`
- `StatsChart` 支持缓存 Token 指标

### RankBoard 组件

Channel/Model 排行榜增加缓存读 Token 列（排名已有 cost，缓存 token 作为辅助信息展示）。

## 文件改动总览

| # | 文件 | 改动 |
|---|------|------|
| 1 | `gateway/outbound/types.ts` | 加 `CacheControl`、`SystemTextPart`；`InternalContent`/`InternalTool`/`InternalRequest` 加缓存字段 |
| 2 | `gateway/inbound/anthropic.ts` | 解析请求顶级/content/tool/system 的 `cache_control` |
| 3 | `gateway/outbound/anthropic.ts` | 序列化 `cache_control`、数组 system |
| 4 | `llm/providers/anthropic/types.ts` | `AnthropicRequestBody` 加 `cache_control` |
| 5 | `llm/providers/anthropic/requestBuilder.ts` | 请求体加 `cache_control: { type: "ephemeral" }` |
| 6 | `shared/types/gateway.d.ts` | `TrendPoint`/`ChannelRankItem`/`ModelRankItem` 补缓存字段 |
| 7 | `db/models/statsDao.ts` | SQL 补缓存列 |
| 8 | `views/GatewayPanel.vue` | 趋势图加缓存指标 |
| 9 | RankBoard 相关组件 | 排行榜展缓存数据 |

## 边界情况

- `cache_control` 的 `type` 只透传，不做校验（Anthropic API 会报错）
- `ttl` 只透传，支持 `"5m"` 和 `"1h"`
- 非 Anthropic 通道忽略 `cacheControl`（outbound 适配器各自决定是否支持）
- system 同时为字符串且无缓存标记时，不生成 `systemParts`，保持向后兼容
- stream 和非 stream 路径均透传 `cache_control`
- 现有 `cacheReadTokens` / `cacheWriteTokens` 从上游响应中解析的逻辑不变

## 测试策略

1. `inbound/anthropic.ts`：解析含顶级 `cache_control` 的请求、含 content block `cache_control` 的请求、含 system array `cache_control` 的请求
2. `outbound/anthropic.ts`：`toAnthropicRequest` 正确输出 `cache_control`（顶级、content、system、tool 各级）
3. `requestBuilder.ts`：验证构建的请求体含 `cache_control`
4. `statsDao.ts`：趋势/排名查询返回正确的缓存数值
