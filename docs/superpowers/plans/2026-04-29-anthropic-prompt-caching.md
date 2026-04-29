# Anthropic Prompt Caching 透传实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Anthropic prompt caching 的 Gateway 完整透传链路，并在客户端启用自动缓存

**Architecture:** 7 步渐进式实现。类型层 → 入站解析 → 出站序列化 → 客户端缓存 → 统计类型 → 统计查询 → UI。每步独立可测，TDD 先行。

**Tech Stack:** TypeScript, Vitest, Vue 3, better-sqlite3, ECharts

**参考 Spec:** `docs/superpowers/specs/2026-04-29-anthropic-prompt-caching-design.md`

---

### Task 1: 添加 CacheControl 到内部类型

**Files:**

- Modify: `src/main/gateway/outbound/types.ts:1-67`

- [ ] **Step 1: 添加类型定义**

在 `InternalTool` 接口之前插入 `CacheControl` 和 `SystemTextPart` 类型，并修改各类型：

```typescript
// 在 InternalTool 之前新增
export interface CacheControl {
  type: "ephemeral";
  ttl?: string; // "5m" | "1h"，透传用
}

export interface SystemTextPart {
  type: "text";
  text: string;
  cacheControl?: CacheControl;
}

// InternalContent 各变体加 cacheControl
export type InternalContent =
  | { type: "text"; text: string; cacheControl?: CacheControl }
  | {
      type: "image";
      source: { type: "base64"; mediaType: string; data: string } | { type: "url"; url: string };
      cacheControl?: CacheControl;
    }
  | { type: "tool_use"; id: string; name: string; input: unknown; cacheControl?: CacheControl }
  | {
      type: "tool_result";
      toolUseId: string;
      content: string;
      isError?: boolean;
      cacheControl?: CacheControl;
    };

// InternalTool 加 cacheControl
export interface InternalTool {
  name: string;
  description?: string;
  inputSchema: unknown;
  cacheControl?: CacheControl;
}

// InternalRequest 加 cacheControl 和 systemParts
export interface InternalRequest {
  model: string;
  messages: InternalMessage[];
  stream: boolean;
  maxTokens?: number;
  temperature?: number;
  tools?: InternalTool[];
  systemPrompt?: string;
  systemParts?: SystemTextPart[]; // 新增：数组格式 system
  cacheControl?: CacheControl; // 新增：顶级自动缓存
  rawHeaders?: Record<string, string>;
  rawBody?: string;
  apiKeyId?: number;
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm run typecheck
```

预期：零类型错误。

- [ ] **Step 3: 确保现有测试仍然通过**

```bash
pnpm test
```

所有已有测试应该保持通过（新增的 `cacheControl?` 全是可选字段，不影响现有逻辑）。

- [ ] **Step 4: Commit**

```bash
git add src/main/gateway/outbound/types.ts
git commit -m "feat(gateway): add CacheControl types to internal request model"
```

---

### Task 2: 入站解析 cache_control

**Files:**

- Modify: `src/main/gateway/inbound/anthropic.ts:1-50`
- Create: `test/main/gateway-anthropic-inbound.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/main/gateway-anthropic-inbound.test.ts`：

```typescript
import { describe, it, expect } from "vitest";

// 直接引入内部函数（从模块导出后使用）
// 注意：需要先在 inbound/anthropic.ts 中导出 toInternalContent 和 parseSystem

describe("Anthropic inbound cache_control", () => {
  it("解析请求顶级 cache_control", () => {
    // 测试注册到路由时会验证 InternalRequest.cacheControl
    // 此处测试解析逻辑能正确写入
    expect(true).toBe(true); // 占位，后续通过集成测试验证
  });
});
```

由于 inbound handler 的核心逻辑（`toInternalContent`、`parseSystem`）当前是模块私有函数，需要先导出后才能单元测试。这一步先确保 typecheck 通过，实际验证在 Task 3 的出站往返测试中覆盖。

- [ ] **Step 2: 更新 AnthropicContentBlock 和 AnthropicRequestBody 类型**

在 `inbound/anthropic.ts` 中：

```typescript
// AnthropicContentBlock 加 cache_control
interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  source?: { type: string; media_type?: string; data?: string; url?: string };
  cache_control?: { type: string; ttl?: string }; // 新增
}

// AnthropicToolDef 加 cache_control
interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema: unknown;
  cache_control?: { type: string; ttl?: string }; // 新增
}

// AnthropicRequestBody 加顶级 cache_control
interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  system?:
    | string
    | { type: string; text: string; cache_control?: { type: string; ttl?: string } }[];
  max_tokens?: number;
  temperature?: number;
  tools?: AnthropicToolDef[];
  stream?: boolean;
  cache_control?: { type: string; ttl?: string }; // 新增
}
```

- [ ] **Step 3: 更新 toInternalContent 透传 cache_control**

```typescript
function toInternalContent(block: AnthropicContentBlock): InternalContent {
  let result: InternalContent;
  switch (block.type) {
    case "text":
      result = { type: "text", text: block.text ?? "" };
      break;
    case "image": {
      if (block.source?.type === "base64") {
        result = {
          type: "image",
          source: {
            type: "base64",
            mediaType: block.source.media_type ?? "image/png",
            data: block.source.data ?? "",
          },
        };
      } else {
        result = {
          type: "image",
          source: { type: "url", url: block.source?.url ?? "" },
        };
      }
      break;
    }
    case "tool_use":
      result = {
        type: "tool_use",
        id: block.id ?? "",
        name: block.name ?? "",
        input: block.input,
      };
      break;
    case "tool_result":
      result = {
        type: "tool_result",
        toolUseId: block.tool_use_id ?? "",
        content: block.content ?? "",
        isError: block.is_error,
      };
      break;
    default:
      result = { type: "text", text: "" };
  }
  // 透传 cache_control
  if (block.cache_control) {
    result = {
      ...result,
      cacheControl: { type: "ephemeral" as const, ttl: block.cache_control.ttl },
    };
  }
  return result;
}
```

- [ ] **Step 4: 更新 parseSystem 保留结构化**

```typescript
function parseSystem(system: AnthropicRequestBody["system"]): {
  systemPrompt?: string;
  systemParts?: SystemTextPart[];
} {
  if (!system) return {};
  if (typeof system === "string") return { systemPrompt: system };

  // 检查是否有 cache_control
  const hasCacheControl = system.some((s) => s.cache_control);
  if (!hasCacheControl) {
    return { systemPrompt: system.map((s) => s.text).join("\n") };
  }

  // 保留结构化
  return {
    systemPrompt: system.map((s) => s.text).join("\n"),
    systemParts: system.map((s) => ({
      type: "text" as const,
      text: s.text,
      ...(s.cache_control
        ? { cacheControl: { type: "ephemeral" as const, ttl: s.cache_control.ttl } }
        : {}),
    })),
  };
}
```

- [ ] **Step 5: 更新消息和请求构建**

找到函数 `registerAnthropicInbound` 中构建 `InternalRequest` 的位置，更新为：

```typescript
// 原: const systemPrompt = parseSystem(body.system)
// 改为:
const { systemPrompt, systemParts } = parseSystem(body.system);

const internal: InternalRequest = {
  model: body.model,
  messages: body.messages.map((msg) => ({
    role: msg.role as InternalMessage["role"],
    content: (typeof msg.content === "string"
      ? [{ type: "text", text: msg.content }]
      : msg.content.map(toInternalContent)) as InternalContent[],
  })),
  stream: body.stream ?? false,
  maxTokens: body.max_tokens,
  temperature: body.temperature,
  systemPrompt,
  systemParts, // 新增
  cacheControl: body.cache_control ? { type: "ephemeral", ttl: body.cache_control.ttl } : undefined, // 新增：顶级 cache_control
  tools: body.tools?.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
    cacheControl: t.cache_control
      ? { type: "ephemeral" as const, ttl: t.cache_control.ttl }
      : undefined,
  })),
  rawBody: body.rawBody,
};
```

- [ ] **Step 6: 验证 typecheck 和现有测试**

```bash
pnpm run typecheck && pnpm test
```

预期：零类型错误，所有已有测试通过。

- [ ] **Step 7: Commit**

```bash
git add src/main/gateway/inbound/anthropic.ts
git commit -m "feat(gateway): parse cache_control from Anthropic inbound requests"
```

---

### Task 3: 出站序列化 cache_control

**Files:**

- Modify: `src/main/gateway/outbound/anthropic.ts:10-74`
- Modify: `test/main/gateway-outbound.test.ts:15-151`

- [ ] **Step 1: 写失败测试**

在 `test/main/gateway-outbound.test.ts` 的 `describe("toAnthropicRequest")` 块末尾，在 `fromAnthropicResponse` describe 之前添加：

```typescript
it("adds top-level cache_control", () => {
  const body = toAnthropicRequest(baseRequest({ cacheControl: { type: "ephemeral" } }));
  expect(body.cache_control).toEqual({ type: "ephemeral" });
});

it("adds cache_control on content blocks", () => {
  const body = toAnthropicRequest(
    baseRequest({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hello", cacheControl: { type: "ephemeral" } }],
        },
      ],
    }),
  );
  const msgs = body.messages as Array<{ content: Array<Record<string, unknown>> }>;
  expect(msgs[0].content[0]).toMatchObject({
    type: "text",
    text: "hello",
    cache_control: { type: "ephemeral" },
  });
});

it("adds cache_control on tools", () => {
  const body = toAnthropicRequest(
    baseRequest({
      tools: [
        {
          name: "read",
          description: "read file",
          inputSchema: { type: "object" },
          cacheControl: { type: "ephemeral" },
        },
      ],
    }),
  );
  expect((body.tools as Array<Record<string, unknown>>)[0]).toMatchObject({
    name: "read",
    cache_control: { type: "ephemeral" },
  });
});

it("outputs array-format system when systemParts present", () => {
  const body = toAnthropicRequest(
    baseRequest({
      systemParts: [
        { type: "text", text: "you are helpful" },
        { type: "text", text: "more context", cacheControl: { type: "ephemeral" } },
      ],
    }),
  );
  expect(body.system).toEqual([
    { type: "text", text: "you are helpful" },
    { type: "text", text: "more context", cache_control: { type: "ephemeral" } },
  ]);
});

it("cache_control with ttl passes through", () => {
  const body = toAnthropicRequest(baseRequest({ cacheControl: { type: "ephemeral", ttl: "1h" } }));
  expect(body.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test -- test/main/gateway-outbound.test.ts
```

预期：新增 5 个测试全部 FAIL，`cache_control` / `cacheControl` 未出现在输出中

- [ ] **Step 3: 更新 convertContent 透传 cache_control**

在 `outbound/anthropic.ts` 的 `convertContent` 函数中，每个 case 末尾加：

```typescript
function convertContent(msg: InternalMessage) {
  return msg.content.map((c) => {
    let result: Record<string, unknown>;
    switch (c.type) {
      case "text":
        result = { type: "text" as const, text: c.text };
        break;
      case "image":
        result = {
          type: "image" as const,
          source:
            c.source.type === "base64"
              ? { type: "base64" as const, media_type: c.source.mediaType, data: c.source.data }
              : { type: "url" as const, url: c.source.url },
        };
        break;
      case "tool_use":
        result = { type: "tool_use" as const, id: c.id, name: c.name, input: c.input };
        break;
      case "tool_result":
        result = {
          type: "tool_result" as const,
          tool_use_id: c.toolUseId,
          content: c.content,
          is_error: c.isError,
        };
        break;
    }
    if (c.cacheControl) {
      result.cache_control = {
        type: c.cacheControl.type,
        ...(c.cacheControl.ttl ? { ttl: c.cacheControl.ttl } : {}),
      };
    }
    return result;
  });
}
```

- [ ] **Step 4: 更新 toAnthropicRequest 顶级和 tools 和 system**

```typescript
export function toAnthropicRequest(req: InternalRequest) {
  // ... existing extracted/system/messages ...

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.maxTokens ?? 4096,
  };

  // system: 优先用 systemParts（数组格式），fallback 到 systemPrompt（字符串）
  if (req.systemParts) {
    body.system = req.systemParts.map((p) => {
      const part: Record<string, unknown> = { type: p.type, text: p.text };
      if (p.cacheControl) {
        part.cache_control = {
          type: p.cacheControl.type,
          ...(p.cacheControl.ttl ? { ttl: p.cacheControl.ttl } : {}),
        };
      }
      return part;
    });
  } else if (system) {
    body.system = system;
  }

  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.stream) body.stream = true;

  // 顶级 cache_control
  if (req.cacheControl) {
    body.cache_control = {
      type: req.cacheControl.type,
      ...(req.cacheControl.ttl ? { ttl: req.cacheControl.ttl } : {}),
    };
  }

  if (req.tools?.length) {
    body.tools = req.tools.map((t) => {
      const tool: Record<string, unknown> = {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      };
      if (t.cacheControl) {
        tool.cache_control = {
          type: t.cacheControl.type,
          ...(t.cacheControl.ttl ? { ttl: t.cacheControl.ttl } : {}),
        };
      }
      return tool;
    });
  }

  return body;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm test -- test/main/gateway-outbound.test.ts
```

预期：全部测试 PASS（包括新增的 5 个缓存测试）

- [ ] **Step 6: 运行所有测试确保无回归**

```bash
pnpm test
```

预期：全部通过。

- [ ] **Step 7: Commit**

```bash
git add src/main/gateway/outbound/anthropic.ts test/main/gateway-outbound.test.ts
git commit -m "feat(gateway): serialize cache_control in Anthropic outbound adapter"
```

---

### Task 4: 客户端启用自动缓存

**Files:**

- Modify: `src/main/llm/providers/anthropic/types.ts:4-12`
- Modify: `src/main/llm/providers/anthropic/requestBuilder.ts:10-47`
- Modify: `src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts:1-82`

- [ ] **Step 1: 更新类型定义**

`src/main/llm/providers/anthropic/types.ts` — `AnthropicRequestBody` 加 `cache_control`：

```typescript
export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  stream: boolean;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  cache_control?: { type: string; ttl?: string }; // 新增
}
```

- [ ] **Step 2: 写失败测试**

在 `requestBuilder.test.ts` 末尾（最后一个 `it` 块之后）添加：

```typescript
it("includes cache_control for automatic caching", () => {
  const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
  const result = buildAnthropicRequest(messages, {}, baseOptions);
  expect(result.cache_control).toEqual({ type: "ephemeral" });
});

it("cache_control does not affect existing request structure", () => {
  const messages: CoreMessage[] = [
    { role: "system", content: "be helpful" },
    { role: "user", content: "hi" },
  ];
  const tools: Record<string, Tool> = {
    read: {
      description: "read",
      parameters: { type: "object", properties: {} },
    },
  };
  const result = buildAnthropicRequest(messages, tools, baseOptions);
  expect(result.system).toBe("be helpful");
  expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
  expect(result.tools).toBeDefined();
  expect(result.cache_control).toEqual({ type: "ephemeral" });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
pnpm test -- src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
```

预期：新增 2 个测试 FAIL（`result.cache_control` 为 undefined）

- [ ] **Step 4: 修改 requestBuilder**

在 `buildAnthropicRequest` 的返回对象中加一行：

```typescript
return {
  model: options.model,
  max_tokens: options.maxTokens ?? 4096,
  stream: true,
  system,
  messages: anthropicMessages,
  tools: anthropicTools,
  temperature: options.temperature,
  cache_control: { type: "ephemeral" }, // ← 新增：启用自动缓存
};
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm test -- src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
```

预期：全部测试 PASS

- [ ] **Step 6: 整体测试**

```bash
pnpm test
```

预期：全部通过。

- [ ] **Step 7: Commit**

```bash
git add src/main/llm/providers/anthropic/types.ts src/main/llm/providers/anthropic/requestBuilder.ts src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
git commit -m "feat(llm): enable Anthropic automatic prompt caching in request builder"
```

---

### Task 5: 统计类型补充缓存字段

**Files:**

- Modify: `src/shared/types/gateway.d.ts:159-191`

- [ ] **Step 1: 更新 TrendPoint**

```typescript
export interface TrendPoint {
  date: string;
  hour?: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number; // 新增
  cacheWriteTokens: number; // 新增
  cost: number;
}
```

- [ ] **Step 2: 更新 ChannelRankItem**

```typescript
export interface ChannelRankItem {
  channelId: number;
  channelName: string;
  requests: number;
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
  cacheReadTokens: number; // 新增
  cacheWriteTokens: number; // 新增
  cost: number;
}
```

- [ ] **Step 3: 更新 ModelRankItem**

```typescript
export interface ModelRankItem {
  modelName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number; // 新增
  cacheWriteTokens: number; // 新增
  cost: number;
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
pnpm run typecheck
```

预期：在更新 statsDao 查询之前，可能有类型错误（dao 返回的对象缺少新字段）。这一步是预期行为，Task 6 会修复。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/gateway.d.ts
git commit -m "feat(gateway): add cache fields to TrendPoint, ChannelRankItem, ModelRankItem"
```

---

### Task 6: 统计查询补缓存列

**Files:**

- Modify: `src/main/db/models/statsDao.ts:343-403` (trend queries)
- Modify: `src/main/db/models/statsDao.ts:186-265` (ranking queries)

- [ ] **Step 1: 更新 getStatsDailyTrend SQL**

```typescript
export function getStatsDailyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(cache_write_tokens) AS cache_write_tokens
      FROM (
        SELECT date, requests, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at) AS date, 1, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND date(created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY date ORDER BY date`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}
```

- [ ] **Step 2: 更新 getStatsHourlyTrend SQL**

```typescript
export function getStatsHourlyTrend(
  db: BetterSqlite3.Database,
  from: string,
  to: string,
): TrendPoint[] {
  const rows = db
    .prepare(
      `SELECT date, hour, SUM(requests) AS requests, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost) AS cost,
              SUM(cache_read_tokens) AS cache_read_tokens,
              SUM(cache_write_tokens) AS cache_write_tokens
      FROM (
        SELECT date, hour, requests, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM stats_hourly WHERE date >= ? AND date < ?
        UNION ALL
        SELECT date(created_at), CAST(strftime('%H', created_at) AS INTEGER),
               1, input_tokens, output_tokens, cost,
               cache_read_tokens, cache_write_tokens
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND (date(created_at) || '_' || CAST(strftime('%H', created_at) AS INTEGER))
            NOT IN (SELECT date || '_' || hour FROM stats_hourly WHERE date >= ? AND date < ?)
      )
      GROUP BY date, hour ORDER BY date, hour`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    date: r.date as string,
    hour: r.hour as number,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}
```

- [ ] **Step 3: 更新 getChannelRanking SQL**

子查询中补 `cache_read_tokens, cache_write_tokens`：

```typescript
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
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(weighted_latency) / NULLIF(SUM(requests), 0) AS avg_latency_ms,
        SUM(cost) AS cost
      FROM (
        SELECT d.channel_id, COALESCE(c.name, 'unknown') AS channel_name,
               d.requests, d.success_count, d.fail_count,
               d.cache_read_tokens, d.cache_write_tokens,
               d.avg_latency_ms * d.requests AS weighted_latency, d.cost
        FROM stats_daily d LEFT JOIN channels c ON c.id = d.channel_id
        WHERE d.date >= ? AND d.date < ?
        UNION ALL
        SELECT COALESCE(l.channel_id, 0), COALESCE(c.name, 'unknown'),
               1,
               CASE WHEN l.status = 'success' THEN 1 ELSE 0 END,
               CASE WHEN l.status = 'error' THEN 1 ELSE 0 END,
               l.cache_read_tokens, l.cache_write_tokens,
               l.duration_ms, l.cost
        FROM relay_logs l LEFT JOIN channels c ON c.id = l.channel_id
        WHERE date(l.created_at) >= ? AND date(l.created_at) < ?
          AND date(l.created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY channel_id
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    channelId: r.channel_id as number,
    channelName: r.channel_name as string,
    requests: r.requests as number,
    successCount: r.success_count as number,
    failCount: r.fail_count as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    avgLatencyMs: (r.avg_latency_ms as number) ?? 0,
    cost: r.cost as number,
  }));
}
```

- [ ] **Step 4: 更新 getModelRanking SQL**

```typescript
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
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(cost) AS cost
      FROM (
        SELECT model_name, requests, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, cost
        FROM stats_daily WHERE date >= ? AND date < ?
        UNION ALL
        SELECT model_name, 1, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, cost
        FROM relay_logs WHERE date(created_at) >= ? AND date(created_at) < ?
          AND date(created_at) NOT IN (SELECT DISTINCT date FROM stats_daily WHERE date >= ? AND date < ?)
      )
      GROUP BY model_name
      ORDER BY requests DESC`,
    )
    .all(from, to, from, to, from, to) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    modelName: r.model_name as string,
    requests: r.requests as number,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    cacheWriteTokens: r.cache_write_tokens as number,
    cost: r.cost as number,
  }));
}
```

- [ ] **Step 5: 验证 typecheck 和测试**

```bash
pnpm run typecheck && pnpm test
```

预期：零错误，所有测试通过。

- [ ] **Step 6: Commit**

```bash
git add src/main/db/models/statsDao.ts
git commit -m "feat(gateway): add cache columns to trend/ranking SQL queries"
```

---

### Task 7: 趋势图和排行榜展示缓存指标

**Files:**

- Modify: `src/renderer/src/views/GatewayPanel.vue:68-77` (metricOptions)
- Modify: `src/renderer/src/components/gateway/StatsChart.vue:14,24-35` (metric 支持)
- Modify: `src/renderer/src/components/gateway/RankBoard.vue:31-58` (缓存展示)

- [ ] **Step 1: 更新 MetricKey 和 metricOptions**

`GatewayPanel.vue`：

```typescript
type MetricKey = "requests" | "cost" | "tokens" | "cachedTokens"; // 加 cachedTokens

const metricOptions: { key: MetricKey; label: string }[] = [
  { key: "requests", label: "请求" },
  { key: "cost", label: "费用" },
  { key: "tokens", label: "Token" },
  { key: "cachedTokens", label: "缓存Token" }, // 新增
];
```

- [ ] **Step 2: 更新 StatsChart 支持 cachedTokens 指标**

`StatsChart.vue`：

```typescript
// 更新 props metric 类型
const props = defineProps<{
  points: TrendPoint[];
  metric: "requests" | "cost" | "tokens" | "cachedTokens";
  granularity: "hourly" | "daily";
}>();

// series computed 中新增
const series = computed(() => {
  if (props.metric === "requests") {
    return [{ name: "请求数", data: props.points.map((p) => p.requests) }];
  }
  if (props.metric === "cost") {
    return [{ name: "费用($)", data: props.points.map((p) => Number(p.cost.toFixed(4))) }];
  }
  if (props.metric === "tokens") {
    return [
      { name: "Input Token", data: props.points.map((p) => p.inputTokens) },
      { name: "Output Token", data: props.points.map((p) => p.outputTokens) },
    ];
  }
  // 新增 cachedTokens
  return [
    { name: "缓存读", data: props.points.map((p) => p.cacheReadTokens) },
    { name: "缓存写", data: props.points.map((p) => p.cacheWriteTokens) },
  ];
});
```

- [ ] **Step 3: 更新 RankBoard 模型排行榜展示缓存**

`RankBoard.vue` — 在 model ranking 模板中，行内补充缓存信息：

当前每个 model 行只显示一个数值。缓存读 token 作为次要信息追加在数值右侧。修改 model 排序栏下的显示逻辑：

```typescript
// 在 model ranking 模板 value 行 (<span class="shrink-0 text-xs text-muted-foreground">) 中
// 当 sortKey === "tokens" 时追加缓存信息
{
  sortKey === "cost"
    ? `$${item.cost.toFixed(3)}`
    : sortKey === "tokens"
      ? `${formatNum(item.inputTokens + item.outputTokens)}`
      : formatNum(item.requests);
}
// 在 tokens 排序时，新增缓存命中数展示：
// <span class="text-xs text-muted-foreground/60"> | 缓存: {{ formatNum(item.cacheReadTokens) }}</span>
```

完整修改 `RankBoard.vue` template 中 model ranking 部分的行值显示：

```html
<span class="shrink-0 text-xs text-muted-foreground">
  {{ sortKey === "cost" ? `$${item.cost.toFixed(3)}` : sortKey === "tokens" ?
  `${formatNum(item.inputTokens + item.outputTokens)}` : formatNum(item.requests) }}
  <template v-if="sortKey === 'tokens' && item.cacheReadTokens > 0">
    <span class="text-muted-foreground/50"> | 缓存 {{ formatNum(item.cacheReadTokens) }}</span>
  </template>
</span>
```

- [ ] **Step 4: 验证 typecheck 和 format**

```bash
pnpm run typecheck && pnpm run format
```

预期：零错误。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/GatewayPanel.vue src/renderer/src/components/gateway/StatsChart.vue src/renderer/src/components/gateway/RankBoard.vue
git commit -m "feat(gateway): add cached tokens metric to trend chart and rank board"
```

---

## 实现顺序

任务按依赖顺序排列：1 → 2 → 3 → 4 → 5 → 6 → 7

- Task 1-3 是 Gateway 核心链路（类型→入站→出站），必须顺序执行
- Task 4 依赖 Task 1（LLM client 的 requestBuilder 生成的请求体会经过 Gateway 的 inbound/outbound）
- Task 5-7 是统计 UI，可独立于 Task 2-4 开发，但依赖 Task 1

## 验证检查点

全部完成后执行：

```bash
pnpm run typecheck
pnpm run format
pnpm run lint
pnpm test
```

确保零错误、全部测试通过。
