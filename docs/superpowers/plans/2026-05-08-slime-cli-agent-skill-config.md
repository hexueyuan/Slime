# slime-cli agent/skill/config 命令 + 删除 Settings agents tab 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 slime-cli 新增 agent/skill/config 三个子命令，并删除 Settings 对话框中的 agents tab。

**Architecture:** taskServer（Fastify）新增 6 个路由提供 agent/skill/config 数据；CLI 三个命令文件通过 `SLIME_TASK_PORT` HTTP 调用；ConfigPresenter 实例通过参数注入 taskServer。

**Tech Stack:** TypeScript, Fastify, Node.js `fs`（skill 扫描）, `MBTI_MAP`（`src/shared/constants/mbti.ts`）, Vue 3（删除 tab）

---

## 文件结构

**新增：**

- `src/cli/commands/agent.ts` — `agentCommand` CommandDef
- `src/cli/commands/skill.ts` — `skillCommand` CommandDef
- `src/cli/commands/config.ts` — `configCommand` CommandDef

**修改：**

- `src/main/tasks/taskServer.ts` — `createTaskServer` 签名增加 `configStore` 参数，新增 6 个路由
- `src/main/presenter/taskPresenter.ts` — `init()` 传入 `configPresenter` 给 `createTaskServer`
- `src/cli/index.ts` — 注册三个新命令
- `src/renderer/src/components/settings/SettingsDialog.vue` — 删除 agents tab

**删除：**

- `src/renderer/src/components/settings/AgentSettings.vue`

---

## Task 1: taskServer 新增 agent/skill 路由

**Files:**

- Modify: `src/main/tasks/taskServer.ts`

### agent 响应类型

`GET /agents` 返回数组，每项：

```ts
{
  id: string;
  name: string;
  source: "builtin" | "market"; // agent.type === 'builtin' → 'builtin', else 'market'
  mbti: string;
}
```

`GET /agents/:id` 返回：

```ts
{
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
  mbtiDescription: string; // MBTI_MAP[agent.mbti].personality
  description: string | undefined;
}
```

### skill 响应类型

`GET /skills` 返回数组，每项：

```ts
{
  name: string;
  description: string;
  source: "builtin" | "market";
}
```

- [ ] **Step 1: 在 `taskServer.ts` 顶部新增 import**

在现有 import 块末尾追加：

```ts
import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { paths } from "@/utils/paths";
import { MBTI_MAP } from "@shared/constants/mbti";
```

- [ ] **Step 2: 新增 `GET /agents` 路由**

在 `return app;` 之前插入：

```ts
app.get("/agents", async (_req, reply) => {
  const agents = agentRegistry.list();
  const result = agents.map((a) => ({
    id: a.id,
    name: a.name,
    source: a.type === "builtin" ? "builtin" : "market",
    mbti: a.mbti,
  }));
  return reply.send(result);
});
```

- [ ] **Step 3: 新增 `GET /agents/:id` 路由**

```ts
app.get<{ Params: { id: string } }>("/agents/:id", async (req, reply) => {
  const agent = agentRegistry.getById(req.params.id);
  if (!agent) return reply.status(404).send({ error: `agent not found: ${req.params.id}` });
  const mbtiProfile = MBTI_MAP[agent.mbti];
  return reply.send({
    id: agent.id,
    name: agent.name,
    source: agent.type === "builtin" ? "builtin" : "market",
    mbti: agent.mbti,
    mbtiDescription: mbtiProfile?.personality ?? "",
    description: agent.description,
  });
});
```

- [ ] **Step 4: 新增 skill 扫描辅助函数**

在 `createTaskServer` 函数定义之前添加：

```ts
interface SkillItem {
  name: string;
  description: string;
  source: "builtin" | "market";
}

function scanSkillDir(dir: string, source: "builtin" | "market"): SkillItem[] {
  if (!existsSync(dir)) return [];
  const items: SkillItem[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    const mdPath = join(dir, entry, "SKILL.md");
    if (!existsSync(mdPath)) continue;
    let content: string;
    try {
      content = readFileSync(mdPath, "utf-8");
    } catch {
      continue;
    }
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const raw = match[1];
    let name = "";
    let description = "";
    for (const line of raw.split("\n")) {
      const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
      if (!kv) continue;
      if (kv[1] === "name") name = kv[2].trim();
      if (kv[1] === "description") description = kv[2].trim();
    }
    if (name && description) items.push({ name, description, source });
  }
  return items;
}
```

- [ ] **Step 5: 新增 `GET /skills` 路由**

```ts
app.get("/skills", async (_req, reply) => {
  const builtin = scanSkillDir(paths.builtinSkillsDir, "builtin");
  const market = scanSkillDir(paths.marketSkillsDir, "market");
  return reply.send([...builtin, ...market]);
});
```

- [ ] **Step 6: 运行 typecheck 确认无报错**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm run typecheck
```

期望：无 TS 错误

- [ ] **Step 7: Commit**

```bash
git add src/main/tasks/taskServer.ts
git commit -m "feat(taskServer): add /agents and /skills routes"
```

---

## Task 2: taskServer 新增 config 路由

**Files:**

- Modify: `src/main/tasks/taskServer.ts`
- Modify: `src/main/presenter/taskPresenter.ts`

### config 路由说明

- `GET /config` — 返回完整 config JSON 对象（`configStore.readAll()`）
- `GET /config/:key` — 返回 `{ key, value }` 或 404
- `PUT /config/:key` — 白名单检查后调用 `configStore.set(key, value)`，返回 `{ key, value }`

白名单（只允许这两个 key）：

```ts
const CONFIG_WRITABLE_KEYS = ["obsidian.vaultPath", "gateway.port"];
```

`ConfigPresenter` 目前只有 `get(key)` 和 `set(key, value)`，没有 `readAll`。需要在 `configPresenter.ts` 补充一个内部方法，或者直接读 JSON 文件。这里选择在 `taskServer.ts` 中使用 `IConfigPresenter` 接口，只用已有的 `get` 和 `set`，而 `list` 路由通过传入的 `configStore` 实例（JsonStore）直接读文件。

更简单的做法：给 `createTaskServer` 增加一个 `configGet: (key: string) => Promise<unknown>` 和 `configSet: (key: string, value: unknown) => Promise<boolean>` 和 `configReadAll: () => Promise<Record<string, unknown>>` 的简单接口。

- [ ] **Step 1: 修改 `createTaskServer` 签名**

在 `taskServer.ts` 中，将函数签名改为：

```ts
interface ConfigStore {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<boolean>
  readAll: () => Promise<Record<string, unknown>>
}

export function createTaskServer(
  db: BetterSqlite3.Database,
  onTasksChanged: () => void,
  configStore: ConfigStore,
): FastifyInstance {
```

- [ ] **Step 2: 新增 config 路由**

在 `return app;` 之前插入：

```ts
const CONFIG_WRITABLE_KEYS = ["obsidian.vaultPath", "gateway.port"];

app.get("/config", async (_req, reply) => {
  const all = await configStore.readAll();
  return reply.send(all);
});

app.get<{ Params: { key: string } }>("/config/:key", async (req, reply) => {
  const value = await configStore.get(req.params.key);
  if (value === null || value === undefined) {
    return reply.status(404).send({ error: `config key not found: ${req.params.key}` });
  }
  return reply.send({ key: req.params.key, value });
});

app.put<{ Params: { key: string }; Body: { value: unknown } }>(
  "/config/:key",
  async (req, reply) => {
    const { key } = req.params;
    if (!CONFIG_WRITABLE_KEYS.includes(key)) {
      return reply
        .status(403)
        .send({
          error: `key '${key}' is not writable. Allowed: ${CONFIG_WRITABLE_KEYS.join(", ")}`,
        });
    }
    const { value } = req.body;
    await configStore.set(key, value);
    return reply.send({ key, value });
  },
);
```

- [ ] **Step 3: 在 `ConfigPresenter` 中增加 `readAll` 方法**

修改 `src/main/presenter/configPresenter.ts`：

```ts
async readAll(): Promise<Record<string, unknown>> {
  return this.store.read()
}
```

在类定义中 `get` 方法之前插入。同时在 `IConfigPresenter` 接口（`src/shared/types/presenters/`）中添加对应声明（如果存在）。

- [ ] **Step 4: 更新 IConfigPresenter 接口**

修改 `src/shared/types/presenters/config.presenter.d.ts`，在 `set` 之后添加：

```ts
export interface IConfigPresenter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<boolean>;
  readAll(): Promise<Record<string, unknown>>;
}
```

- [ ] **Step 5: 修改 `taskPresenter.ts` 传入 configPresenter**

在 `taskPresenter.ts` 中：

1. 在 `import` 块添加：

```ts
import { configPresenter } from "./configPresenter";
```

2. 将 `createTaskServer` 调用改为：

```ts
this.server = createTaskServer(db, () => this.emitTasksChanged(), {
  get: (key) => configPresenter.get(key),
  set: (key, value) => configPresenter.set(key, value),
  readAll: () => configPresenter.readAll(),
});
```

- [ ] **Step 6: 运行 typecheck**

```bash
pnpm run typecheck
```

期望：无 TS 错误

- [ ] **Step 7: Commit**

```bash
git add src/main/tasks/taskServer.ts src/main/presenter/taskPresenter.ts src/main/presenter/configPresenter.ts
git commit -m "feat(taskServer): add /config routes with whitelist write"
```

---

## Task 3: CLI `slime-cli agent` 命令

**Files:**

- Create: `src/cli/commands/agent.ts`
- Modify: `src/cli/index.ts`

输出格式：

- `agent list`：每行 `[id] name (builtin|market) MBTI`
- `agent get <id>`：多行 `name: ...` / `mbti: MBTI — 描述` / `description: ...`

- [ ] **Step 1: 创建 `src/cli/commands/agent.ts`**

```ts
import type { CommandDef } from "../registry";

interface AgentListItem {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
}

interface AgentDetail {
  id: string;
  name: string;
  source: "builtin" | "market";
  mbti: string;
  mbtiDescription: string;
  description?: string;
}

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `agent — 查看 Agent 列表和详情\n\n用法: slime-cli agent <subcommand>\n\n子命令:\n  list          列出全部 agent\n  get <id>      查看指定 agent 详情\n\n示例:\n  slime-cli agent list\n  slime-cli agent get hal-ai\n`,
    );
    return;
  }

  if (sub === "list") {
    const agents = (await httpGet("/agents")) as AgentListItem[];
    if (agents.length === 0) {
      process.stdout.write("(no agents)\n");
    } else {
      for (const a of agents) {
        process.stdout.write(`[${a.id}] ${a.name} (${a.source}) ${a.mbti}\n`);
      }
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少 agent ID\n\n用法: slime-cli agent get <id>\n\n运行 `slime-cli help agent` 查看完整用法说明。",
      );
    }
    const agent = (await httpGet(`/agents/${rest[0]}`)) as AgentDetail;
    process.stdout.write(`name: ${agent.name}\n`);
    process.stdout.write(`mbti: ${agent.mbti} — ${agent.mbtiDescription}\n`);
    process.stdout.write(`description: ${agent.description ?? ""}\n`);
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list | get\n\n运行 \`slime-cli help agent\` 查看完整用法说明。`,
    );
  }
}

export const agentCommand: CommandDef = {
  name: "agent",
  description: "Agent 列表与详情",
  detail: `agent — 查看 Agent 列表和详情

用法:
  slime-cli agent <subcommand>

子命令:
  list          列出全部 agent（内置 + market）
  get <id>      查看指定 agent 的名字、MBTI、描述

list 输出格式:
  [id] name (builtin|market) MBTI

get 输出格式:
  name: <名字>
  mbti: <类型> — <性格描述>
  description: <描述>

示例:
  slime-cli agent list
  slime-cli agent get hal-ai`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
```

- [ ] **Step 2: 在 `src/cli/index.ts` 注册 agentCommand**

修改：

```ts
import { agentCommand } from "./commands/agent";
// ...
const allCommands = [logsCommand, taskCommand, agentCommand];
```

- [ ] **Step 3: 运行 typecheck**

```bash
pnpm run typecheck
```

期望：无 TS 错误

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/agent.ts src/cli/index.ts
git commit -m "feat(cli): add agent list/get subcommands"
```

---

## Task 4: CLI `slime-cli skill` 命令

**Files:**

- Create: `src/cli/commands/skill.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 创建 `src/cli/commands/skill.ts`**

```ts
import type { CommandDef } from "../registry";

interface SkillItem {
  name: string;
  description: string;
  source: "builtin" | "market";
}

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `skill — 查看 Skill 列表\n\n用法: slime-cli skill <subcommand>\n\n子命令:\n  list          列出全部 skill\n\n示例:\n  slime-cli skill list\n`,
    );
    return;
  }

  if (sub === "list") {
    const skills = (await httpGet("/skills")) as SkillItem[];
    if (skills.length === 0) {
      process.stdout.write("(no skills)\n");
    } else {
      for (const s of skills) {
        process.stdout.write(`${s.name} (${s.source}) - ${s.description}\n`);
      }
    }
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list\n\n运行 \`slime-cli help skill\` 查看完整用法说明。`,
    );
  }
}

export const skillCommand: CommandDef = {
  name: "skill",
  description: "Skill 列表",
  detail: `skill — 查看 Skill 列表

用法:
  slime-cli skill <subcommand>

子命令:
  list          列出全部 skill（内置 + market）

list 输出格式:
  name (builtin|market) - description

示例:
  slime-cli skill list`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
```

- [ ] **Step 2: 在 `src/cli/index.ts` 注册 skillCommand**

```ts
import { skillCommand } from "./commands/skill";
// ...
const allCommands = [logsCommand, taskCommand, agentCommand, skillCommand];
```

- [ ] **Step 3: 运行 typecheck**

```bash
pnpm run typecheck
```

期望：无 TS 错误

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/skill.ts src/cli/index.ts
git commit -m "feat(cli): add skill list subcommand"
```

---

## Task 5: CLI `slime-cli config` 命令

**Files:**

- Create: `src/cli/commands/config.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: 创建 `src/cli/commands/config.ts`**

```ts
import type { CommandDef } from "../registry";

function getBaseUrl(): string {
  const port = process.env["SLIME_TASK_PORT"];
  if (!port) throw new Error("SLIME_TASK_PORT not set");
  return `http://127.0.0.1:${port}`;
}

async function httpGet(path: string): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function httpPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { error: string }).error);
  return json;
}

async function runAsync(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help") {
    process.stdout.write(
      `config — 查询和修改 Slime 配置\n\n用法: slime-cli config <subcommand>\n\n子命令:\n  list              列出全部配置项\n  get <key>         查询单个配置项\n  set <key> <value> 修改配置项（仅白名单 key）\n\n可写入的 key:\n  obsidian.vaultPath\n  gateway.port\n\n示例:\n  slime-cli config list\n  slime-cli config get obsidian.vaultPath\n  slime-cli config set obsidian.vaultPath /Users/me/vault\n`,
    );
    return;
  }

  if (sub === "list") {
    const all = (await httpGet("/config")) as Record<string, unknown>;
    const entries = Object.entries(all);
    if (entries.length === 0) {
      process.stdout.write("(empty)\n");
    } else {
      for (const [k, v] of entries) {
        process.stdout.write(`${k}=${JSON.stringify(v)}\n`);
      }
    }
  } else if (sub === "get") {
    if (!rest[0]) {
      throw new Error(
        "缺少 key\n\n用法: slime-cli config get <key>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    const result = (await httpGet(`/config/${rest[0]}`)) as { key: string; value: unknown };
    process.stdout.write(`${result.key}=${JSON.stringify(result.value)}\n`);
  } else if (sub === "set") {
    if (!rest[0]) {
      throw new Error(
        "缺少 key\n\n用法: slime-cli config set <key> <value>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    if (rest[1] === undefined) {
      throw new Error(
        "缺少 value\n\n用法: slime-cli config set <key> <value>\n\n运行 `slime-cli help config` 查看完整用法说明。",
      );
    }
    // 尝试解析 JSON，失败则作为字符串
    let value: unknown;
    try {
      value = JSON.parse(rest[1]);
    } catch {
      value = rest[1];
    }
    const result = (await httpPut(`/config/${rest[0]}`, { value })) as {
      key: string;
      value: unknown;
    };
    process.stdout.write(`${result.key}=${JSON.stringify(result.value)}\n`);
  } else {
    throw new Error(
      `未知子命令: ${sub}\n\n可用子命令: list | get | set\n\n运行 \`slime-cli help config\` 查看完整用法说明。`,
    );
  }
}

export const configCommand: CommandDef = {
  name: "config",
  description: "查询和修改 Slime 配置",
  detail: `config — 查询和修改 Slime 配置

用法:
  slime-cli config <subcommand>

子命令:
  list              列出全部配置项
  get <key>         查询单个配置项
  set <key> <value> 修改配置项（仅白名单 key）

可写入的 key:
  obsidian.vaultPath   Obsidian vault 目录路径
  gateway.port         LLM Gateway 端口号

value 解析规则:
  先尝试 JSON.parse，失败则作为字符串处理
  示例: set gateway.port 40000  → 数字 40000
        set obsidian.vaultPath /path/to/vault  → 字符串

示例:
  slime-cli config list
  slime-cli config get obsidian.vaultPath
  slime-cli config set obsidian.vaultPath /Users/me/vault
  slime-cli config set gateway.port 40000

  # ❌ 不可写的 key（报错: key is not writable）
  slime-cli config set app.onboarded true`,
  allowedRoles: ["user", "builtin-agent"],
  run(args) {
    runAsync(args).catch((e: unknown) => {
      process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    });
  },
};
```

- [ ] **Step 2: 在 `src/cli/index.ts` 注册 configCommand**

```ts
import { configCommand } from "./commands/config";
// ...
const allCommands = [logsCommand, taskCommand, agentCommand, skillCommand, configCommand];
```

- [ ] **Step 3: 运行 typecheck**

```bash
pnpm run typecheck
```

期望：无 TS 错误

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/config.ts src/cli/index.ts
git commit -m "feat(cli): add config list/get/set subcommands"
```

---

## Task 6: 删除 Settings agents tab

**Files:**

- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`
- Delete: `src/renderer/src/components/settings/AgentSettings.vue`

- [ ] **Step 1: 修改 `SettingsDialog.vue`，删除 agents tab 按钮**

删除第 54-64 行（agents tab button）：

```html
<button
  :class="[
    'rounded-md px-3 py-1.5 text-left text-sm',
    activeTab === 'agents'
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/50',
  ]"
  @click="activeTab = 'agents'"
>
  Agent
</button>
```

- [ ] **Step 2: 删除 `AgentSettings` 渲染分支和 import**

从 `<div class="flex flex-1 ...">` 内删除：

```html
<AgentSettings v-else-if="activeTab === 'agents'" />
```

从 `<script setup>` 删除：

```ts
import AgentSettings from "./AgentSettings.vue";
```

从 `activeTab` 类型删除 `"agents"`：

```ts
const activeTab = ref<"profile" | "gateway" | "general" | "mcp" | "update">("profile");
```

- [ ] **Step 3: 删除 `AgentSettings.vue` 文件**

```bash
rm src/renderer/src/components/settings/AgentSettings.vue
```

- [ ] **Step 4: 运行 typecheck + lint**

```bash
pnpm run typecheck
pnpm run lint
```

期望：无错误

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/settings/SettingsDialog.vue
git rm src/renderer/src/components/settings/AgentSettings.vue
git commit -m "feat(ui): remove agents tab from Settings dialog"
```

---

## Task 7: 格式化、lint 检查、构建验证

- [ ] **Step 1: 格式化**

```bash
pnpm run format
```

- [ ] **Step 2: Lint**

```bash
pnpm run lint
```

期望：无错误

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

期望：无错误

- [ ] **Step 4: Commit 格式化变更（如有）**

```bash
git add -A
git diff --cached --stat
# 如有变更：
git commit -m "style: format after agent/skill/config cli impl"
```
