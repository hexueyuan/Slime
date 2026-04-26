# Gateway 日志请求/响应详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LLM Gateway 日志增加完整的请求/响应 body 存储与展示，用户可在日志面板查看每次请求的具体内容。

**Architecture:** relay 层采集 InternalRequest/InternalResponse 并序列化为 JSON 传入 stats callback，写入 relay_logs 表的新 TEXT 字段。UI 通过按 ID 查详情的方式按需加载 body，在右侧抽屉中展示。

**Tech Stack:** TypeScript, better-sqlite3, Vue 3 Composition API, TailwindCSS

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/shared/types/gateway.d.ts` | RelayLog 类型新增 requestBody/responseBody |
| `src/shared/types/presenters/gateway.presenter.d.ts` | IGatewayPresenter 新增 getLogDetail |
| `src/main/db/database.ts` | DDL migration 新增列 |
| `src/main/db/models/logDao.ts` | insertLogs 写入 body、getRecentLogs 排除 body、新增 getLogDetail |
| `src/main/gateway/relay.ts` | StatsCallback 扩展、relay/relayStream 采集 body、过滤函数 |
| `src/main/gateway/stats.ts` | 无变更（已通过 RelayLog 类型自动接收新字段） |
| `src/main/presenter/gatewayPresenter.ts` | onStats 透传 body、暴露 getLogDetail |
| `src/renderer/src/components/gateway/LogTab.vue` | 移除 expand、新增抽屉详情面板 |
| `test/main/gateway-log-detail.test.ts` | 新增：logDao 和 relay body 采集测试 |
| `test/renderer/components/LogTab.test.ts` | 新增：LogTab 抽屉交互测试 |

---

### Task 1: 类型 + DB Migration

**Files:**
- Modify: `src/shared/types/gateway.d.ts:94-110`
- Modify: `src/shared/types/presenters/gateway.presenter.d.ts:75`
- Modify: `src/main/db/database.ts:145-160`

- [ ] **Step 1: RelayLog 类型新增字段**

在 `src/shared/types/gateway.d.ts` 的 `RelayLog` 接口中，在 `error?: string` 之后、`createdAt: string` 之前新增：

```ts
  requestBody?: string
  responseBody?: string
```

- [ ] **Step 2: IGatewayPresenter 新增 getLogDetail**

在 `src/shared/types/presenters/gateway.presenter.d.ts` 的 `getRecentLogs` 下方新增：

```ts
  getLogDetail(id: number): RelayLog | undefined;
```

- [ ] **Step 3: DB migration 新增列**

在 `src/main/db/database.ts` 的 `createDb` 函数中，已有 channels.models 列迁移的 try/catch 块之后，新增：

```ts
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN request_body TEXT");
  } catch {
    // column already exists
  }
  try {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN response_body TEXT");
  } catch {
    // column already exists
  }
```

- [ ] **Step 4: 运行 typecheck 验证**

Run: `pnpm run typecheck`
Expected: 编译失败（GatewayPresenter 未实现 getLogDetail），确认类型变更生效

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/gateway.d.ts src/shared/types/presenters/gateway.presenter.d.ts src/main/db/database.ts
git commit -m "feat(gateway): add requestBody/responseBody to RelayLog type + DB migration"
```

---

### Task 2: DAO 层改造

**Files:**
- Modify: `src/main/db/models/logDao.ts`
- Test: `test/main/gateway-log-detail.test.ts`

- [ ] **Step 1: 写 DAO 测试**

创建 `test/main/gateway-log-detail.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type BetterSqlite3 from 'better-sqlite3'
import { initDb, closeDb } from '@/db'
import { insertLogs, getRecentLogs, getLogDetail } from '@/db/models/logDao'

let db: BetterSqlite3.Database

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  closeDb()
})

describe('logDao body fields', () => {
  const baseLog = {
    groupName: 'test-group',
    channelId: 1,
    channelName: 'ch1',
    modelName: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0.001,
    durationMs: 200,
    status: 'success' as const,
  }

  it('insertLogs writes requestBody and responseBody', () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ])
    const row = db.prepare('SELECT request_body, response_body FROM relay_logs WHERE id = 1').get() as {
      request_body: string | null
      response_body: string | null
    }
    expect(row.request_body).toBe('{"model":"gpt-4o"}')
    expect(row.response_body).toBe('{"content":"hi"}')
  })

  it('insertLogs handles undefined body as null', () => {
    insertLogs(db, [baseLog])
    const row = db.prepare('SELECT request_body, response_body FROM relay_logs WHERE id = 1').get() as {
      request_body: string | null
      response_body: string | null
    }
    expect(row.request_body).toBeNull()
    expect(row.response_body).toBeNull()
  })

  it('getRecentLogs excludes body fields', () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ])
    const logs = getRecentLogs(db, 10, 0)
    expect(logs).toHaveLength(1)
    expect(logs[0].requestBody).toBeUndefined()
    expect(logs[0].responseBody).toBeUndefined()
    expect(logs[0].modelName).toBe('gpt-4o')
  })

  it('getLogDetail returns full log with body', () => {
    insertLogs(db, [
      { ...baseLog, requestBody: '{"model":"gpt-4o"}', responseBody: '{"content":"hi"}' },
    ])
    const log = getLogDetail(db, 1)
    expect(log).toBeDefined()
    expect(log!.requestBody).toBe('{"model":"gpt-4o"}')
    expect(log!.responseBody).toBe('{"content":"hi"}')
    expect(log!.modelName).toBe('gpt-4o')
  })

  it('getLogDetail returns undefined for non-existent id', () => {
    expect(getLogDetail(db, 999)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/gateway-log-detail.test.ts`
Expected: FAIL — `getLogDetail` 不存在

- [ ] **Step 3: 修改 logDao.ts**

在 `src/main/db/models/logDao.ts` 中：

**3a. LogRow 接口新增字段**（在 `error: string | null` 之后）：

```ts
  request_body: string | null;
  response_body: string | null;
```

**3b. rowToLog 函数新增映射**（在 `error` 行之后）：

```ts
    requestBody: row.request_body ?? undefined,
    responseBody: row.response_body ?? undefined,
```

**3c. insertLogs 的 INSERT 语句和 run 调用中新增 body 字段**：

SQL 改为：
```sql
    INSERT INTO relay_logs
      (api_key_id, group_name, channel_id, channel_name, model_name,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost, duration_ms, status, error, request_body, response_body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

run 调用末尾新增：
```ts
        log.requestBody ?? null,
        log.responseBody ?? null,
```

**3d. getRecentLogs 改为显式列举字段（排除 body）**：

将 `SELECT *` 替换为：
```sql
SELECT id, api_key_id, group_name, channel_id, channel_name, model_name,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost, duration_ms, status, error, created_at
FROM relay_logs ORDER BY id DESC LIMIT ? OFFSET ?
```

由于查询不含 body 列，rowToLog 中 `request_body` / `response_body` 会是 undefined，结果中 `requestBody` / `responseBody` 为 undefined。这符合预期。但为避免 TypeScript 类型问题，将 `rowToLog` 的参数类型从 `LogRow` 改为接受可选的 body 字段。具体做法：不改 rowToLog 签名，而是对 getRecentLogs 的查询结果做单独的 cast（`as LogRow[]` 仍然有效，因为缺失字段在访问时返回 undefined，`?? undefined` 处理正确）。

**3e. 新增 getLogDetail 函数**：

```ts
export function getLogDetail(
  db: BetterSqlite3.Database,
  id: number,
): RelayLog | undefined {
  const row = db
    .prepare('SELECT * FROM relay_logs WHERE id = ?')
    .get(id) as LogRow | undefined
  return row ? rowToLog(row) : undefined
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test test/main/gateway-log-detail.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/db/models/logDao.ts test/main/gateway-log-detail.test.ts
git commit -m "feat(gateway): logDao support requestBody/responseBody + getLogDetail"
```

---

### Task 3: Relay 层采集 body

**Files:**
- Modify: `src/main/gateway/relay.ts`
- Modify: `test/main/gateway-relay.test.ts`

- [ ] **Step 1: 写 relay body 采集测试**

在 `test/main/gateway-relay.test.ts` 的 `describe("relay")` 块末尾新增：

```ts
  it("statsCallback 包含 requestBody 和 responseBody", async () => {
    setup();
    const send = vi.fn().mockResolvedValue(baseResponse);
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    await relay.relay(baseRequest);

    expect(statsCalls).toHaveLength(1);
    const call = statsCalls[0] as { requestBody?: string; responseBody?: string };
    expect(call.requestBody).toBeDefined();
    expect(JSON.parse(call.requestBody!).model).toBe("gpt-4o");
    expect(call.responseBody).toBeDefined();
    expect(JSON.parse(call.responseBody!).content).toEqual(baseResponse.content);
  });

  it("statsCallback 失败时 responseBody 为 undefined", async () => {
    setup();
    const send = vi.fn().mockRejectedValue(new Error("fail"));
    mockGetAdapter.mockReturnValue({ send, sendStream: vi.fn() });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    await relay.relay(baseRequest).catch(() => {});

    for (const call of statsCalls) {
      expect((call as { responseBody?: string }).responseBody).toBeUndefined();
    }
  });
```

在 `describe("relayStream")` 块末尾新增：

```ts
  it("statsCallback 包含流式累积的 responseBody", async () => {
    setup();
    const events: StreamEvent[] = [
      { type: "content_delta", delta: { type: "text", text: "hello " } },
      { type: "content_delta", delta: { type: "text", text: "world" } },
      { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } },
      { type: "stop", stopReason: "end_turn", model: "gpt-4o-2024" },
    ];

    async function* fakeStream(): AsyncIterable<StreamEvent> {
      for (const e of events) yield e;
    }

    mockGetAdapter.mockReturnValue({
      send: vi.fn(),
      sendStream: vi.fn().mockReturnValue(fakeStream()),
    });

    const relay = createRelay(createDeps());
    const statsCalls: unknown[] = [];
    relay.onStats((data) => statsCalls.push(data));

    const result = await relay.relayStream(baseRequest);
    // 消费流触发 stats
    for await (const _ of result.stream) { /* drain */ }

    expect(statsCalls).toHaveLength(1);
    const call = statsCalls[0] as { requestBody?: string; responseBody?: string };
    expect(call.requestBody).toBeDefined();
    expect(JSON.parse(call.requestBody!).model).toBe("gpt-4o");
    expect(call.responseBody).toBeDefined();
    const respBody = JSON.parse(call.responseBody!);
    expect(respBody.content).toEqual([{ type: "text", text: "hello world" }]);
    expect(respBody.usage.inputTokens).toBe(10);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/gateway-relay.test.ts`
Expected: FAIL — statsCallback 数据中无 requestBody/responseBody

- [ ] **Step 3: 修改 relay.ts — StatsCallback 类型**

在 `src/main/gateway/relay.ts` 的 `StatsCallback` 类型定义中，`error?: string` 之后新增：

```ts
  requestBody?: string;
  responseBody?: string;
```

- [ ] **Step 4: 新增 filterRequestForLog 函数**

在 `createRelay` 函数之前新增：

```ts
function filterForLog(request: InternalRequest): string {
  const filtered = {
    ...request,
    messages: request.messages.map((msg) => ({
      ...msg,
      content: msg.content.map((c) => {
        if (c.type === 'image') {
          return { type: 'image' as const, source: { type: 'url' as const, url: '[image data omitted]' } }
        }
        return c
      }),
    })),
  }
  return JSON.stringify(filtered)
}
```

- [ ] **Step 5: 修改 relay() 非流式路径**

在 `relay()` 函数中：

成功路径（`try` 块内 `adapter.send` 调用之后），在 `statsCallback?.({...})` 调用中新增字段：

```ts
            requestBody: filterForLog(request),
            responseBody: JSON.stringify(response),
```

失败路径（`catch` 块内），在 `statsCallback?.({...})` 调用中新增：

```ts
            requestBody: filterForLog(request),
```

（responseBody 不传，默认 undefined）

- [ ] **Step 6: 修改 relayStream() 流式路径**

在 `relayStream()` 中：

在 `wrappedStream` generator 内，`usage` 变量声明旁新增文本累积变量：

```ts
            let contentText = '';
```

在处理每个 chunk 时（`first.value` 和 `next.value`），累积文本。在 `if (first.value.type === 'usage')` 之前新增（对 first 和 loop 内的 next 都做）：

```ts
              if (evt.type === 'content_delta' && evt.delta.type === 'text') {
                contentText += evt.delta.text;
              }
```

具体实现：将 first.value 和 next.value 的处理统一。先 yield first.value，然后 loop yield next.value。对每个 value 做 usage 和 content 累积。

重构 wrappedStream 为：

```ts
          async function* wrappedStream(): AsyncIterable<StreamEvent> {
            let usage: InternalResponse['usage'] = { inputTokens: 0, outputTokens: 0 }
            let contentText = ''
            let stopReason = ''
            let responseModel = modelName

            function accumulate(evt: StreamEvent) {
              if (evt.type === 'usage') usage = evt.usage
              if (evt.type === 'content_delta' && evt.delta.type === 'text') {
                contentText += evt.delta.text
              }
              if (evt.type === 'stop') {
                stopReason = evt.stopReason
                responseModel = evt.model
              }
            }

            try {
              if (!first.done) {
                accumulate(first.value)
                yield first.value
              }
              while (true) {
                const next = await iterator.next()
                if (next.done) break
                accumulate(next.value)
                yield next.value
              }
              const responseBody = JSON.stringify({
                content: [{ type: 'text', text: contentText }],
                usage,
                model: responseModel,
                stopReason,
              })
              statsCallback?.({
                groupName,
                channelId: chId,
                channelName: chName,
                modelName,
                apiKeyId: keyId,
                usage,
                durationMs: Date.now() - startTime,
                status: 'success',
                requestBody: filterForLog(request),
                responseBody,
              })
            } catch (streamErr) {
              statsCallback?.({
                groupName,
                channelId: chId,
                channelName: chName,
                modelName,
                apiKeyId: keyId,
                usage: { inputTokens: 0, outputTokens: 0 },
                durationMs: Date.now() - startTime,
                status: 'error',
                error: streamErr instanceof Error ? streamErr.message : String(streamErr),
                requestBody: filterForLog(request),
              })
              throw streamErr
            }
          }
```

连接失败路径（外层 `catch`），在 `statsCallback?.({...})` 中新增：

```ts
            requestBody: filterForLog(request),
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test test/main/gateway-relay.test.ts`
Expected: PASS — all tests including new body tests

- [ ] **Step 8: Commit**

```bash
git add src/main/gateway/relay.ts test/main/gateway-relay.test.ts
git commit -m "feat(gateway): relay captures requestBody/responseBody in stats callback"
```

---

### Task 4: GatewayPresenter 透传 + IPC

**Files:**
- Modify: `src/main/presenter/gatewayPresenter.ts`

- [ ] **Step 1: onStats 回调透传 body**

在 `src/main/presenter/gatewayPresenter.ts` 的 `this.relay.onStats((data) => {...})` 回调中，`this.statsCollector.record({...})` 的参数对象末尾新增（在 `error: data.error,` 之后）：

```ts
        requestBody: data.requestBody,
        responseBody: data.responseBody,
```

- [ ] **Step 2: 新增 getLogDetail 方法**

在 `getRecentLogs` 方法之后新增：

```ts
  getLogDetail(id: number): RelayLog | undefined {
    return logDao.getLogDetail(getDb(), id)
  }
```

- [ ] **Step 3: 运行 typecheck 验证**

Run: `pnpm run typecheck`
Expected: PASS — GatewayPresenter 实现了 IGatewayPresenter.getLogDetail

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/gatewayPresenter.ts
git commit -m "feat(gateway): presenter exposes getLogDetail + passes body to stats"
```

---

### Task 5: LogTab 抽屉 UI

**Files:**
- Modify: `src/renderer/src/components/gateway/LogTab.vue`

- [ ] **Step 1: 改造 LogTab.vue**

替换 `src/renderer/src/components/gateway/LogTab.vue` 的完整内容：

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePresenter } from '@/composables/usePresenter'
import type { RelayLog } from '@shared/types/gateway'
import { GATEWAY_EVENTS } from '@shared/events'
import { Icon } from '@iconify/vue'

const gw = usePresenter('gatewayPresenter')

const logs = ref<RelayLog[]>([])
const loading = ref(false)
const hasMore = ref(true)
const PAGE_SIZE = 50

// Drawer state
const drawerOpen = ref(false)
const drawerLog = ref<RelayLog | null>(null)
const drawerLoading = ref(false)
const activeTab = ref<'request' | 'response'>('request')

onMounted(() => loadMore())

const cleanup = window.electron.ipcRenderer.on(GATEWAY_EVENTS.LOG_ADDED, () => {
  refresh()
})
onUnmounted(() => cleanup?.())

async function loadMore() {
  loading.value = true
  const batch = await gw.getRecentLogs(PAGE_SIZE, logs.value.length)
  logs.value = [...logs.value, ...batch]
  hasMore.value = batch.length === PAGE_SIZE
  loading.value = false
}

async function refresh() {
  logs.value = []
  hasMore.value = true
  await loadMore()
}

async function openDetail(log: RelayLog) {
  drawerOpen.value = true
  drawerLoading.value = true
  drawerLog.value = null
  activeTab.value = 'request'
  const detail = await gw.getLogDetail(log.id)
  drawerLog.value = detail ?? log
  drawerLoading.value = false
}

function closeDrawer() {
  drawerOpen.value = false
  drawerLog.value = null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`
}

function formatDuration(ms: number): string {
  return `${ms}ms`
}

function formatJson(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-sm font-medium">日志</h3>
      <button
        class="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="刷新"
        @click="refresh"
      >
        <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Log table -->
    <div v-if="logs.length" class="space-y-1">
      <div
        v-for="log in logs"
        :key="log.id"
        class="cursor-pointer rounded-lg bg-muted/30 transition-colors hover:bg-muted/50"
        @click="openDetail(log)"
      >
        <div class="flex items-center gap-3 p-3 text-xs">
          <span class="w-28 shrink-0 text-muted-foreground">{{ formatTime(log.createdAt) }}</span>
          <span class="w-28 shrink-0 truncate font-medium">{{ log.modelName }}</span>
          <span class="w-24 shrink-0 truncate text-muted-foreground">{{
            log.channelName ?? '-'
          }}</span>
          <span class="w-24 shrink-0 text-muted-foreground">
            {{ log.inputTokens }} / {{ log.outputTokens }}
          </span>
          <span class="w-16 shrink-0 text-muted-foreground">{{ formatCost(log.cost) }}</span>
          <span class="w-16 shrink-0 text-muted-foreground">{{
            formatDuration(log.durationMs)
          }}</span>
          <span
            :class="[
              'shrink-0 rounded px-1.5 py-0.5 text-xs',
              log.status === 'success'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400',
            ]"
          >
            {{ log.status }}
          </span>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading" class="py-12 text-center text-sm text-muted-foreground">
      暂无日志
    </div>

    <!-- Load more -->
    <div v-if="hasMore && logs.length" class="mt-3 flex justify-center">
      <button
        class="rounded px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        :disabled="loading"
        @click="loadMore"
      >
        {{ loading ? '加载中...' : '加载更多' }}
      </button>
    </div>

    <!-- Detail Drawer -->
    <Teleport to="body">
      <div v-if="drawerOpen" class="fixed inset-0 z-50 flex">
        <!-- Overlay -->
        <div class="flex-1 bg-black/50" @click="closeDrawer" />
        <!-- Drawer panel -->
        <div class="flex h-full w-[50vw] flex-col border-l border-border bg-card shadow-xl">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 class="text-sm font-medium">日志详情</h3>
            <button
              class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              @click="closeDrawer"
            >
              <Icon icon="lucide:x" class="h-4 w-4" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="drawerLoading" class="flex flex-1 items-center justify-center">
            <Icon icon="lucide:loader-2" class="h-5 w-5 animate-spin text-muted-foreground" />
          </div>

          <!-- Content -->
          <div v-else-if="drawerLog" class="flex flex-1 flex-col overflow-hidden">
            <!-- Meta -->
            <div class="space-y-2 border-b border-border px-4 py-3 text-xs">
              <div class="flex items-center gap-4">
                <span class="font-medium">{{ drawerLog.modelName }}</span>
                <span
                  :class="[
                    'rounded px-1.5 py-0.5',
                    drawerLog.status === 'success'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400',
                  ]"
                >
                  {{ drawerLog.status }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <div>渠道: {{ drawerLog.channelName ?? '-' }}</div>
                <div>耗时: {{ formatDuration(drawerLog.durationMs) }}</div>
                <div>
                  Tokens: {{ drawerLog.inputTokens }} in / {{ drawerLog.outputTokens }} out
                </div>
                <div>费用: {{ formatCost(drawerLog.cost) }}</div>
                <div>Group: {{ drawerLog.groupName }}</div>
                <div>API Key ID: {{ drawerLog.apiKeyId ?? '-' }}</div>
                <div>Cache Read: {{ drawerLog.cacheReadTokens }}</div>
                <div>Cache Write: {{ drawerLog.cacheWriteTokens }}</div>
              </div>
              <!-- Error -->
              <div
                v-if="drawerLog.error"
                class="rounded bg-red-500/10 p-2 text-red-400"
              >
                {{ drawerLog.error }}
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-border px-4 text-xs">
              <button
                :class="[
                  'border-b-2 px-3 py-2 transition-colors',
                  activeTab === 'request'
                    ? 'border-violet-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
                @click="activeTab = 'request'"
              >
                请求
              </button>
              <button
                :class="[
                  'border-b-2 px-3 py-2 transition-colors',
                  activeTab === 'response'
                    ? 'border-violet-500 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ]"
                @click="activeTab = 'response'"
              >
                响应
              </button>
            </div>

            <!-- Body content -->
            <div class="flex-1 overflow-auto p-4">
              <template v-if="activeTab === 'request'">
                <pre
                  v-if="drawerLog.requestBody"
                  class="whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground"
                >{{ formatJson(drawerLog.requestBody) }}</pre>
                <div v-else class="py-8 text-center text-sm text-muted-foreground">无内容</div>
              </template>
              <template v-else>
                <pre
                  v-if="drawerLog.responseBody"
                  class="whitespace-pre-wrap break-all text-xs leading-relaxed text-foreground"
                >{{ formatJson(drawerLog.responseBody) }}</pre>
                <div v-else class="py-8 text-center text-sm text-muted-foreground">无内容</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

- [ ] **Step 2: 运行 format + lint**

Run: `pnpm run format && pnpm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/gateway/LogTab.vue
git commit -m "feat(gateway): log detail drawer with request/response body display"
```

---

### Task 6: 集成验证

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过。如有旧测试因 body 字段变更失败（如 gateway-stats.test.ts 中 makeLog 缺少可选字段），不需要修改——可选字段 undefined 不影响。

- [ ] **Step 2: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: 运行 format + lint**

Run: `pnpm run format && pnpm run lint`
Expected: PASS

- [ ] **Step 4: 修复任何失败**

如有失败，根据错误信息修复。常见问题：
- 旧测试 `makeLog()` 需确认 `requestBody`/`responseBody` 是可选字段不影响
- LogRow 类型 cast 可能需要在 getRecentLogs 中用 `as Omit<LogRow, 'request_body' | 'response_body'>[]` 或保持 `as LogRow[]`

- [ ] **Step 5: Final commit（如有修复）**

```bash
git add -A
git commit -m "fix(gateway): integration fixes for log detail feature"
```
