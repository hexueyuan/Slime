# Reset Data & Schema Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理数据库 schema 中的死字段/冗余字段，并新增"重置数据"功能（Settings → 通用 tab）。

**Architecture:** schema 清理以 TypeScript 类型为锚点——先改 shared types 和 DDL，编译器报错指引修改 DAO/presenter/组件；重置功能通过现有 `presenter:call` IPC 接入 AppPresenter，无需新注册 handler。旧版本 DB 用户需手动执行重置才能继续使用。

**Tech Stack:** better-sqlite3, TypeScript, Vue 3 Composition API, Pinia, Electron IPC (`presenter:call`)

---

## 文件变更地图

| 文件 | 操作 | 涉及 Task |
|---|---|---|
| `src/main/db/database.ts` | 修改 DDL + 删除迁移块 | 1 |
| `src/shared/types/gateway.d.ts` | 删字段：Channel(baseUrls→baseUrl, proxy, priority, weight), GatewayApiKey(maxCost), Model(priority) | 2, 5, 6 |
| `src/main/db/models/channelDao.ts` | base_url 单值、去 proxy/priority/weight | 2 |
| `src/main/gateway/outbound/types.ts` | 删 OutboundConfig.proxy | 3 |
| `src/main/gateway/relay.ts` | baseUrls[0]→baseUrl, 去 proxy | 3 |
| `src/main/presenter/gatewayPresenter.ts` | baseUrls[0]→baseUrl, 去 maxCost 入参 | 4 |
| `src/main/db/models/apiKeyDao.ts` | 去 max_cost | 5 |
| `src/main/db/models/modelDao.ts` | 去 priority | 6 |
| `src/shared/types/agent.d.ts` | 删 SessionConfig.thinkingBudget, AgentConfig.thinkingBudget, ChatMessageRecord.isContextEdge/metadata, UsageStatsRecord | 7, 8, 9 |
| `src/main/db/models/agentMessageDao.ts` | 去 is_context_edge, metadata | 7 |
| `src/renderer/src/stores/agentChat.ts` | 去 isContextEdge, metadata 初始化 | 7 |
| `src/main/db/models/agentSessionConfigDao.ts` | 去 thinking_budget | 8 |
| `src/main/presenter/agentChatPresenterAdapter.ts` | 去 thinkingBudget | 8 |
| `src/main/presenter/agentChat/subagentPresenter.ts` | 去 thinkingBudget | 8 |
| `src/main/db/models/agentUsageStatsDao.ts` | **删除整个文件** | 9 |
| `src/main/db/index.ts` | 删 agentUsageStatsDao re-export | 9 |
| `src/main/db/models/agentSessionDao.ts` | 删 L101/L116 cascade DELETE | 9 |
| `src/main/db/models/agentDao.ts` | 删 ensureBuiltin 两条迁移 UPDATE | 10 |
| `src/renderer/src/components/gateway/ChannelTab.vue` | baseUrls→baseUrl, 去 priority/weight 硬编码 | 11 |
| `src/renderer/src/components/gateway/ApiKeyTab.vue` | 去 maxCost UI | 11 |
| `src/renderer/src/components/chat/AgentEditDialog.vue` | 去 thinkingBudget UI | 11 |
| `src/main/presenter/appPresenter.ts` | 新增 resetAllData() | 12 |
| `src/shared/types/presenters/app.presenter.d.ts` | 接口声明 resetAllData | 12 |
| `src/renderer/src/components/settings/SettingsDialog.vue` | 新增「通用」tab | 13 |
| `src/renderer/src/components/settings/GeneralSettings.vue` | **新建** | 13 |
| `test/main/db.test.ts` | 更新 schema 断言 | 随各 Task |
| `test/main/agentMessageDao.test.ts` | 删 isContextEdge/metadata 相关断言 | 7 |
| `test/main/agentDao.test.ts` | 删迁移 UPDATE 断言 | 10 |
| `test/main/gateway-relay.test.ts` | baseUrls→baseUrl, 去 proxy | 3 |
| `test/main/gatewayPresenter.test.ts` | baseUrls→baseUrl, 去 maxCost | 4 |
| `test/main/modelDao.test.ts` | 去 priority | 6 |
| `test/renderer/components/SettingsDialog.test.ts` | 新增通用 tab 断言 | 13 |

---

## Task 1: 更新 database.ts DDL + 删除迁移块

**Files:**
- Modify: `src/main/db/database.ts`

- [ ] **Step 1: 更新 DDL 常量**

将 `const DDL` 中下列改动一次性完成：

**channels 表**：删 `proxy TEXT,`、`priority INTEGER NOT NULL DEFAULT 0,`、`weight INTEGER NOT NULL DEFAULT 1,`；`base_urls TEXT NOT NULL DEFAULT '[]'` 改为 `base_url TEXT NOT NULL DEFAULT ''`

**api_keys 表**：删 `max_cost REAL,`

**models 表**：删 `priority INTEGER NOT NULL DEFAULT 0,`；`ORDER BY priority DESC, id` 改成 `ORDER BY id`（DDL 中无 ORDER BY，这在 DAO 里改）

**agent_session_configs 表**：删 `thinking_budget INTEGER,`

**agent_messages 表**：删 `is_context_edge INTEGER DEFAULT 0,`、`metadata TEXT DEFAULT '{}',`

**agent_usage_stats 表**：整块 CREATE TABLE + 两条 CREATE INDEX 删掉

最终 channels 建表语句：
```sql
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai',
  base_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  timeout INTEGER,
  models TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

最终 agent_messages 建表语句：
```sql
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  order_seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 删除全部 ALTER TABLE 迁移块**

删除 `createDb()` 函数内 L221~L289 的全部 try-catch 块（8个），只保留：
```typescript
function createDb(dbPath: string): BetterSqlite3.Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(DDL);
  return instance;
}
```

- [ ] **Step 3: 运行 typecheck，预期大量报错（后续 Task 逐一修复）**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck 2>&1 | head -60
```

- [ ] **Step 4: Commit**

```bash
git add src/main/db/database.ts
git commit -m "refactor(db): clean DDL - remove dead fields and migration blocks"
```

---

## Task 2: channelDao + Channel 类型（base_url 单值 + 删 proxy/priority/weight）

**Files:**
- Modify: `src/shared/types/gateway.d.ts`
- Modify: `src/main/db/models/channelDao.ts`

- [ ] **Step 1: 更新 Channel interface**

`src/shared/types/gateway.d.ts` 中 `Channel` 改为：
```typescript
export interface Channel {
  id: number;
  name: string;
  type: ChannelType;
  baseUrl: string;
  models: string[];
  enabled: boolean;
  timeout?: number;
  createdAt: string;
  updatedAt: string;
}
```

删除 `baseUrls: string[]`、`priority: number`、`weight: number`、`proxy?: string`。

- [ ] **Step 2: 更新 channelDao.ts**

```typescript
interface ChannelRow {
  id: number;
  name: string;
  type: string;
  base_url: string;
  models: string;
  enabled: number;
  timeout: number | null;
  created_at: string;
  updated_at: string;
}

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Channel["type"],
    baseUrl: row.base_url,
    models: JSON.parse(row.models),
    enabled: !!row.enabled,
    timeout: row.timeout ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChannels(db: BetterSqlite3.Database): Channel[] {
  const rows = db.prepare("SELECT * FROM channels ORDER BY id").all() as ChannelRow[];
  return rows.map(rowToChannel);
}

export function createChannel(
  db: BetterSqlite3.Database,
  data: Omit<Channel, "id" | "createdAt" | "updatedAt">,
): Channel {
  const stmt = db.prepare(`
    INSERT INTO channels (name, type, base_url, models, enabled, timeout)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.name,
    data.type,
    data.baseUrl,
    JSON.stringify(data.models),
    data.enabled ? 1 : 0,
    data.timeout ?? null,
  );
  return getChannel(db, Number(result.lastInsertRowid))!;
}
```

`updateChannel` 中删除 `baseUrls`/`proxy`/`priority`/`weight` 的 if 块，添加 `baseUrl`：
```typescript
if (data.baseUrl !== undefined) {
  sets.push("base_url = ?");
  values.push(data.baseUrl);
}
```

- [ ] **Step 3: 运行 typecheck，确认 channelDao 相关报错消失**

```bash
pnpm run typecheck 2>&1 | grep channelDao
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/gateway.d.ts src/main/db/models/channelDao.ts
git commit -m "refactor(db): channel - base_url single value, drop proxy/priority/weight"
```

---

## Task 3: OutboundConfig 删 proxy + relay.ts 修复

**Files:**
- Modify: `src/main/gateway/outbound/types.ts`
- Modify: `src/main/gateway/relay.ts`
- Modify: `test/main/gateway-relay.test.ts`

- [ ] **Step 1: 删除 OutboundConfig.proxy**

`src/main/gateway/outbound/types.ts` 中 `OutboundConfig`：
```typescript
export interface OutboundConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}
```

- [ ] **Step 2: 修复 relay.ts 两处 config 对象**

L112~L117 改为：
```typescript
const config = {
  baseUrl: channel.baseUrl,
  apiKey: selectedKey.key,
  timeout: channel.timeout,
};
```

L186~L192 同样改为：
```typescript
const config = {
  baseUrl: channel.baseUrl,
  apiKey: selectedKey.key,
  timeout: channel.timeout,
};
```

- [ ] **Step 3: 更新 gateway-relay 测试**

在 `test/main/gateway-relay.test.ts` 中搜索所有 `baseUrls` 出现，改为 `baseUrl: "https://..."` 单值；去掉测试数据中的 `proxy`/`priority`/`weight` 字段。

- [ ] **Step 4: 运行 relay 相关测试**

```bash
pnpm test test/main/gateway-relay.test.ts
```
预期：全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/main/gateway/outbound/types.ts src/main/gateway/relay.ts test/main/gateway-relay.test.ts
git commit -m "refactor(gateway): drop proxy from OutboundConfig and relay"
```

---

## Task 4: gatewayPresenter 修复

**Files:**
- Modify: `src/main/presenter/gatewayPresenter.ts`
- Modify: `test/main/gatewayPresenter.test.ts`

- [ ] **Step 1: 修复 gatewayPresenter.ts 中的 baseUrls[0]**

L213 中 `channel.baseUrls[0]` → `channel.baseUrl`。

- [ ] **Step 2: 修复 createApiKey 入参，去掉 maxCost**

找到 `createApiKey` 方法（约 L285），删掉参数对象中的 `maxCost?: number` 字段，删掉传给 `apiKeyDao.createApiKey` 时的 `maxCost: data.maxCost`。

同理找 `updateApiKey` 方法，删掉 `maxCost` 字段。

- [ ] **Step 3: 更新 gatewayPresenter 测试**

`test/main/gatewayPresenter.test.ts` 中搜索 `baseUrls`，改为 `baseUrl: "https://..."` 单值；搜索 `maxCost`，删掉相关断言和构造数据。

- [ ] **Step 4: 运行测试**

```bash
pnpm test test/main/gatewayPresenter.test.ts
```
预期：全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/gatewayPresenter.ts test/main/gatewayPresenter.test.ts
git commit -m "refactor(presenter): fix baseUrl and drop maxCost in gatewayPresenter"
```

---

## Task 5: apiKeyDao + GatewayApiKey 类型删 maxCost

**Files:**
- Modify: `src/shared/types/gateway.d.ts`
- Modify: `src/main/db/models/apiKeyDao.ts`

- [ ] **Step 1: 删 GatewayApiKey.maxCost**

`src/shared/types/gateway.d.ts` 中 `GatewayApiKey` 删掉 `maxCost?: number;`。

- [ ] **Step 2: 更新 apiKeyDao.ts**

`ApiKeyRow` 删掉 `max_cost: number | null`。

`rowToApiKey` 删掉 `maxCost: row.max_cost ?? undefined`。

`createApiKey` INSERT 语句：
```sql
INSERT INTO api_keys (name, key, enabled, is_internal, expires_at, allowed_models)
VALUES (?, ?, ?, ?, ?, ?)
```
删掉 `max_cost` 占位符和对应参数 `data.maxCost ?? null`。

`updateApiKey` 删掉 `maxCost` 的 if 块。

- [ ] **Step 3: 运行 typecheck**

```bash
pnpm run typecheck 2>&1 | grep -i "maxCost\|max_cost"
```
预期：无报错。

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/gateway.d.ts src/main/db/models/apiKeyDao.ts
git commit -m "refactor(db): drop maxCost from api_keys"
```

---

## Task 6: modelDao + Model 类型删 priority

**Files:**
- Modify: `src/shared/types/gateway.d.ts`
- Modify: `src/main/db/models/modelDao.ts`
- Modify: `test/main/modelDao.test.ts`

- [ ] **Step 1: 删 Model.priority**

`src/shared/types/gateway.d.ts` 中 `Model` 删掉 `priority: number;`。

- [ ] **Step 2: 更新 modelDao.ts**

`ModelRow` 删掉 `priority: number`。

`rowToModel` 删掉 `priority: row.priority`。

`listModels` 和 `listModelsByChannel` 的 SQL：`ORDER BY priority DESC, id` → `ORDER BY id`。

`createModel` INSERT：
```sql
INSERT INTO models (channel_id, model_name, model_type, capabilities, enabled) VALUES (?, ?, ?, ?, ?)
```
删掉 `priority` 占位符和 `data.priority` 参数。同步更新 `createModel` 的 `data` 参数类型（删掉 `priority: number`）。

`updateModel` 删掉 `priority` 的 if 块。

- [ ] **Step 3: 更新 modelDao 测试**

`test/main/modelDao.test.ts` 中删掉所有 `priority` 字段的构造和断言。

- [ ] **Step 4: 运行测试**

```bash
pnpm test test/main/modelDao.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/gateway.d.ts src/main/db/models/modelDao.ts test/main/modelDao.test.ts
git commit -m "refactor(db): drop priority from models"
```

---

## Task 7: agentMessageDao + ChatMessageRecord 删 isContextEdge/metadata

**Files:**
- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/db/models/agentMessageDao.ts`
- Modify: `src/renderer/src/stores/agentChat.ts`
- Modify: `test/main/agentMessageDao.test.ts`

- [ ] **Step 1: 更新 ChatMessageRecord 类型**

`src/shared/types/agent.d.ts` 中 `ChatMessageRecord` 删掉 `isContextEdge: boolean;` 和 `metadata: string;`。

- [ ] **Step 2: 更新 agentMessageDao.ts**

`MessageRow` 删掉 `is_context_edge: number` 和 `metadata: string`。

`rowToMessage` 删掉 `isContextEdge: !!row.is_context_edge` 和 `metadata: row.metadata`。

`createMessage` 参数类型删掉 `metadata?: string`，INSERT SQL 改为：
```sql
INSERT INTO agent_messages (id, session_id, order_seq, role, content, status, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```
删掉 `data.metadata ?? "{}"` 参数。

`updateMessage` 参数类型删掉 `metadata?: string` 和 `isContextEdge?: boolean`，删掉对应 if 块。

- [ ] **Step 3: 修复 agentChat store**

`src/renderer/src/stores/agentChat.ts` 中乐观更新对象删掉 `isContextEdge: false` 和 `metadata: "{}"` 两行。

- [ ] **Step 4: 更新 agentMessageDao 测试**

`test/main/agentMessageDao.test.ts` 中删掉 `isContextEdge`/`metadata` 相关构造和断言。

- [ ] **Step 5: 运行测试**

```bash
pnpm test test/main/agentMessageDao.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/db/models/agentMessageDao.ts src/renderer/src/stores/agentChat.ts test/main/agentMessageDao.test.ts
git commit -m "refactor(db): drop isContextEdge and metadata from agent_messages"
```

---

## Task 8: agentSessionConfigDao + SessionConfig 删 thinkingBudget

**Files:**
- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/db/models/agentSessionConfigDao.ts`
- Modify: `src/main/presenter/agentChatPresenterAdapter.ts`
- Modify: `src/main/presenter/agentChat/subagentPresenter.ts`

- [ ] **Step 1: 删 thinkingBudget 类型**

`src/shared/types/agent.d.ts` 中：
- `AgentConfig` 删掉 `thinkingBudget?: number;`
- `SessionConfig` 删掉 `thinkingBudget?: number | null;`

- [ ] **Step 2: 更新 agentSessionConfigDao.ts**

`SessionConfigRow` 删掉 `thinking_budget: number | null`。

`rowToConfig` 删掉 `thinkingBudget: row.thinking_budget`。

`createConfig` 参数删掉 `thinkingBudget?: number | null`，INSERT SQL 改为：
```sql
INSERT INTO agent_session_configs (id, capability_requirements, system_prompt, temperature, context_length, max_tokens)
VALUES (?, ?, ?, ?, ?, ?)
```
删掉 `data.thinkingBudget ?? null` 参数。

`updateConfig` 删掉 `thinkingBudget` 的 if 块。

- [ ] **Step 3: 修复 agentChatPresenterAdapter.ts**

找到 `createConfig` 调用处（约 L38~L42），删掉 `thinkingBudget: agentConfig?.thinkingBudget ?? null`。

- [ ] **Step 4: 修复 subagentPresenter.ts**

找到 `createConfig` 调用处（约 L38~L42），删掉 `thinkingBudget: parentConfig?.thinkingBudget ?? null`。

- [ ] **Step 5: 运行 typecheck**

```bash
pnpm run typecheck 2>&1 | grep -i "thinkingBudget\|thinking_budget"
```
预期：无报错。

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/db/models/agentSessionConfigDao.ts src/main/presenter/agentChatPresenterAdapter.ts src/main/presenter/agentChat/subagentPresenter.ts
git commit -m "refactor(db): drop thinking_budget from agent_session_configs"
```

---

## Task 9: 删除 agent_usage_stats 整张表

**Files:**
- Delete: `src/main/db/models/agentUsageStatsDao.ts`
- Modify: `src/main/db/index.ts`
- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/db/models/agentSessionDao.ts`

- [ ] **Step 1: 删除 DAO 文件**

```bash
rm src/main/db/models/agentUsageStatsDao.ts
```

- [ ] **Step 2: 更新 db/index.ts**

删掉这一行：
```typescript
export * from "./models/agentUsageStatsDao";
```

- [ ] **Step 3: 删除 UsageStatsRecord 类型**

`src/shared/types/agent.d.ts` 删掉整个 `UsageStatsRecord` interface（L115~L125）。

- [ ] **Step 4: 删除 agentSessionDao.ts 中的级联 DELETE**

`src/main/db/models/agentSessionDao.ts` L101 删掉：
```typescript
db.prepare("DELETE FROM agent_usage_stats WHERE session_id = ?").run(id);
```
L116 同样删掉：
```typescript
db.prepare("DELETE FROM agent_usage_stats WHERE session_id = ?").run(id);
```

- [ ] **Step 5: 运行 typecheck**

```bash
pnpm run typecheck 2>&1 | grep -i "usageStats\|usage_stats"
```
预期：无报错。

- [ ] **Step 6: 运行 session DAO 测试**

```bash
pnpm test test/main/agentSessionDao.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/main/db/index.ts src/shared/types/agent.d.ts src/main/db/models/agentSessionDao.ts
git commit -m "refactor(db): delete agent_usage_stats table and dead DAO"
```

---

## Task 10: 清理 agentDao ensureBuiltin 迁移代码

**Files:**
- Modify: `src/main/db/models/agentDao.ts`
- Modify: `test/main/agentDao.test.ts`

- [ ] **Step 1: 删除 ensureBuiltin 中的两条条件 UPDATE**

`src/main/db/models/agentDao.ts` `ensureBuiltin` 函数，删掉 L141~L150（两个 `db.prepare(...).run()` 迁移块），只保留 `INSERT OR IGNORE`：

```typescript
export function ensureBuiltin(db: BetterSqlite3.Database): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO agents (id, name, type, enabled, protected, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "hal-ai",
    "HalAI",
    "builtin",
    1,
    1,
    JSON.stringify({
      capabilityRequirements: ["reasoning"],
      subagentEnabled: false,
      disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    }),
    now,
    now,
  );
}
```

- [ ] **Step 2: 检查并更新 agentDao 测试**

```bash
grep -n "chat\|reasoning\|disabledTools\|migrate" test/main/agentDao.test.ts
```

删掉测试中验证迁移行为的断言（如"capabilityRequirements 从 chat 变为 reasoning"）。

- [ ] **Step 3: 运行测试**

```bash
pnpm test test/main/agentDao.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/main/db/models/agentDao.ts test/main/agentDao.test.ts
git commit -m "refactor(db): remove hal-ai migration statements from ensureBuiltin"
```

---

## Task 11: 渲染进程组件清理

**Files:**
- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`
- Modify: `src/renderer/src/components/gateway/ApiKeyTab.vue`
- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`
- Modify: `src/renderer/src/components/onboarding/AddChannelStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue`
- Modify: `test/renderer/components/OnboardingWizard.test.ts`（如有 baseUrls 断言）

- [ ] **Step 1: 修复 ChannelTab.vue**

1. `openEdit` 中 `baseUrl: ch.baseUrls[0] ?? ""` 已经是正确的（只是 `ch.baseUrls[0]` → `ch.baseUrl`）：
   ```typescript
   baseUrl: ch.baseUrl ?? "",
   ```

2. `save()` 中删掉 `const baseUrls = ...` 这行，`updateChannel` 和 `createChannel` 调用改为直接传 `baseUrl: form.value.baseUrl || defaultUrlForType.value`；删掉 `priority: 0` 和 `weight: 1` 字段。

   ```typescript
   await gw.updateChannel(channelId, {
     name: form.value.name,
     type: form.value.type,
     baseUrl: form.value.baseUrl || defaultUrlForType.value,
     models: [],
     enabled: form.value.enabled,
   });
   ```

   ```typescript
   const ch = await gw.createChannel({
     name: form.value.name,
     type: form.value.type,
     baseUrl: form.value.baseUrl || defaultUrlForType.value,
     models: [],
     enabled: form.value.enabled,
   });
   ```

3. `createModel` 调用（两处）删掉 `priority: 0`：
   ```typescript
   await gw.createModel({
     channelId,
     modelName,
     type: "chat",
     capabilities: [],
     enabled: true,
   });
   ```

- [ ] **Step 2: 修复 ApiKeyTab.vue**

1. 删掉 `form.value` 中的 `maxCost: undefined as number | undefined`。
2. 删掉 `form.value = { ..., maxCost: undefined, ... }` 中的 maxCost 初始化。
3. 删掉 `gw.createApiKey(...)` / `gw.updateApiKey(...)` 调用中的 `maxCost: form.value.maxCost`。
4. 删掉模板中展示 `ak.maxCost` 的 `<span>` 和 `maxCost` 的 `<input>`。

- [ ] **Step 3: 修复 AgentEditDialog.vue**

1. 删掉 `const thinkingBudget = ref<number | undefined>(undefined)`。
2. 删掉 `thinkingBudget.value = cfg?.thinkingBudget`。
3. 删掉 reset 时的 `thinkingBudget.value = undefined`。
4. 删掉保存时的 `thinkingBudget: thinkingBudget.value`。
5. 删掉模板中「思考预算」整个 `<div>` 块（含 label + input）。

- [ ] **Step 4: 修复 onboarding 组件**

`src/renderer/src/components/onboarding/AddChannelStep.vue` L72，将：
```typescript
baseUrls: [props.baseUrl],
```
改为：
```typescript
baseUrl: props.baseUrl,
```

`src/renderer/src/components/onboarding/OnboardingWizard.vue` L46，将：
```typescript
baseUrls: [config.baseUrl],
```
改为：
```typescript
baseUrl: config.baseUrl,
```

- [ ] **Step 5: 运行 typecheck**

```bash
pnpm run typecheck
```
预期：通过（0 errors）。

- [ ] **Step 6: 运行全量测试**

```bash
pnpm test
```
如有失败，按报错修复（主要是测试 fixtures 里的 Channel/Model 字段不匹配）。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/gateway/ChannelTab.vue src/renderer/src/components/gateway/ApiKeyTab.vue src/renderer/src/components/chat/AgentEditDialog.vue
git commit -m "refactor(ui): sync components with cleaned schema"
```

---

## Task 12: AppPresenter.resetAllData()

**Files:**
- Modify: `src/main/presenter/appPresenter.ts`
- Modify: `src/shared/types/presenters/app.presenter.d.ts`

- [ ] **Step 1: 更新接口声明**

`src/shared/types/presenters/app.presenter.d.ts`：
```typescript
export interface IAppPresenter {
  getVersion(): string;
  resetAllData(): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 2: 实现 resetAllData()**

`src/main/presenter/appPresenter.ts`：
```typescript
import { app } from "electron";
import { unlink } from "fs/promises";
import { paths } from "@/utils";
import { join } from "path";
import type { IAppPresenter } from "@shared/types/presenters";

export class AppPresenter implements IAppPresenter {
  getVersion(): string {
    return app.getVersion();
  }

  async resetAllData(): Promise<{ success: boolean; error?: string }> {
    const targets = [
      join(paths.slimeDir, "gateway.db"),
      paths.configFile,
    ];
    try {
      for (const p of targets) {
        await unlink(p).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 3: 运行 typecheck**

```bash
pnpm run typecheck 2>&1 | grep appPresenter
```

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/appPresenter.ts src/shared/types/presenters/app.presenter.d.ts
git commit -m "feat(presenter): add resetAllData to AppPresenter"
```

---

## Task 13: Settings UI — 通用 Tab + GeneralSettings

**Files:**
- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`
- Create: `src/renderer/src/components/settings/GeneralSettings.vue`
- Modify: `test/renderer/components/SettingsDialog.test.ts`

- [ ] **Step 1: 新建 GeneralSettings.vue**

```vue
<script setup lang="ts">
import { ref } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const appPresenter = usePresenter("appPresenter");

const state = ref<"idle" | "confirming" | "loading" | "done" | "error">("idle");
const errorMsg = ref("");

function openConfirm() {
  state.value = "confirming";
}
function cancelConfirm() {
  state.value = "idle";
}
async function confirmReset() {
  state.value = "loading";
  const result = await appPresenter.resetAllData();
  if (result.success) {
    state.value = "done";
  } else {
    errorMsg.value = result.error ?? "未知错误";
    state.value = "error";
  }
}
</script>

<template>
  <div class="space-y-5">
    <h3 class="text-sm font-semibold text-foreground">通用</h3>

    <!-- 危险区域 -->
    <div class="rounded-md border border-red-500/30 p-4">
      <p class="mb-1 text-xs font-semibold text-red-400">危险区域</p>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm text-foreground">重置数据</p>
          <p class="text-xs text-muted-foreground">删除所有本地数据并恢复出厂设置，操作不可撤销</p>
        </div>
        <button
          v-if="state !== 'done'"
          :disabled="state === 'loading'"
          class="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-50"
          @click="openConfirm"
        >
          重置数据
        </button>
        <span v-else class="shrink-0 text-sm text-emerald-400">重置成功，请重启应用</span>
      </div>
      <p v-if="state === 'error'" class="mt-2 text-xs text-red-400">{{ errorMsg }}</p>
    </div>

    <!-- 确认对话框 -->
    <Teleport v-if="state === 'confirming'" to="body">
      <div class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" @click="cancelConfirm" />
        <div class="relative w-80 rounded-lg border border-border bg-card p-5 shadow-xl">
          <h4 class="mb-2 text-sm font-semibold text-foreground">确认重置？</h4>
          <p class="mb-4 text-xs text-muted-foreground">此操作不可撤销，所有数据将被永久删除。重置后需手动重启应用。</p>
          <div class="flex justify-end gap-2">
            <button
              class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              @click="cancelConfirm"
            >
              取消
            </button>
            <button
              class="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
              @click="confirmReset"
            >
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

- [ ] **Step 2: 更新 SettingsDialog.vue**

script 中 import GeneralSettings：
```typescript
import GeneralSettings from "./GeneralSettings.vue";
```

`activeTab` 类型扩展：
```typescript
const activeTab = ref<"profile" | "gateway" | "general">("profile");
```

左导航新增按钮（放在「网关」按钮之后）：
```html
<button
  :class="[
    'rounded-md px-3 py-1.5 text-left text-sm',
    activeTab === 'general'
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/50',
  ]"
  @click="activeTab = 'general'"
>
  通用
</button>
```

右侧内容区新增：
```html
<GeneralSettings v-else-if="activeTab === 'general'" />
```

- [ ] **Step 3: 更新 SettingsDialog 测试**

`test/renderer/components/SettingsDialog.test.ts` 中新增「通用」tab 渲染断言：
```typescript
it('renders 通用 tab button', async () => {
  // 找到 activeTab 为 general 的按钮存在
  const buttons = wrapper.findAll('button')
  expect(buttons.some(b => b.text() === '通用')).toBe(true)
})
```

- [ ] **Step 4: 运行 SettingsDialog 测试**

```bash
pnpm test test/renderer/components/SettingsDialog.test.ts
```

- [ ] **Step 5: 运行全量测试 + typecheck**

```bash
pnpm run typecheck && pnpm test
```
预期：typecheck 0 errors，测试全部通过（除已知 pre-existing statsDao 失败）。

- [ ] **Step 6: 运行 format + lint**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/settings/GeneralSettings.vue src/renderer/src/components/settings/SettingsDialog.vue test/renderer/components/SettingsDialog.test.ts
git commit -m "feat(ui): add 通用 tab with reset data feature to Settings"
```
