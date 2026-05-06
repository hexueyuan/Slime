# Agent 个性化元数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持在 `agents/xxxagent.ts` 中定义内置 agent 的头像、主题颜色、简介、agentSoul（系统 prompt），并在 New Thread 页面以卡片形式展示 agent，所有相关 UI 颜色以 themeColor 为基准。

**Architecture:** 在 `Agent` 类型顶层新增 `themeColor` 字段；`AgentConfig` 新增 `agentSoul` 字段替代 `systemPrompt`；DB 增加 `theme_color` 列并修复 `ensureBuiltin` 漏字段问题；渲染层通过 `--agent-color` CSS 变量注入主题色；New Thread 页面改为卡片网格布局。

**Tech Stack:** TypeScript, Vue 3 Composition API, TailwindCSS, better-sqlite3, Vitest

---

## 文件变更清单

| 文件                                                   | 操作                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `src/shared/types/agent.d.ts`                          | 修改：新增 `Agent.themeColor`，`AgentConfig.agentSoul`  |
| `src/main/agents/index.ts`                             | 修改：`BuiltinAgentDef` 新增 `avatar`/`themeColor`      |
| `src/main/agents/hal.ts`                               | 修改：补充 avatar/themeColor，改用 agentSoul            |
| `src/main/db/database.ts`                              | 修改：DDL 加 `theme_color` 列，migrate() 加 ALTER TABLE |
| `src/main/db/models/agentDao.ts`                       | 修改：theme_color 字段支持，ensureBuiltin 修复          |
| `src/main/presenter/agentChat/agentChatPresenter.ts`   | 修改：agentSoul 优先读取逻辑                            |
| `src/renderer/src/components/chat/NewThread.vue`       | 修改：改为卡片布局，复用 AgentAvatar                    |
| `src/renderer/src/components/chat/AgentAvatar.vue`     | 修改：fallback 颜色改用 `var(--agent-color)`            |
| `src/renderer/src/components/chat/ChatView.vue`        | 修改：注入 `--agent-color` CSS 变量                     |
| `src/renderer/src/components/chat/AgentEditDialog.vue` | 修改：新增 themeColor 颜色选择器                        |
| `test/main/agentDao.test.ts`                           | 修改：补充 themeColor/ensureBuiltin 测试                |

---

## Task 1: 扩展共享类型

**Files:**

- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/agents/index.ts`

- [ ] **Step 1: 修改 `agent.d.ts`，新增 `themeColor` 和 `agentSoul`**

打开 `src/shared/types/agent.d.ts`，在 `Agent` interface 的 `avatar` 字段后加一行，并在 `AgentConfig` 末尾加 `agentSoul`：

```typescript
// Agent interface，在 avatar 字段后加：
themeColor?: string | null;   // CSS hex，如 "#a855f7"

// AgentConfig interface，末尾加：
/** @deprecated 使用 agentSoul 替代 */
systemPrompt?: string;
/** 内置 agent 的系统 prompt，非空时优先于 SOUL.md */
agentSoul?: string;
```

完整修改后 `Agent` 的字段顺序：

```typescript
export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  protected: boolean;
  description?: string;
  avatar?: AgentAvatar | null;
  themeColor?: string | null;
  config?: AgentConfig | null;
  createdAt: number;
  updatedAt: number;
}
```

完整修改后 `AgentConfig` 末尾：

```typescript
export interface AgentConfig {
  capabilityRequirements?: string[];
  /** @deprecated 使用 agentSoul 替代 */
  systemPrompt?: string;
  /** 内置 agent 的系统 prompt，非空时优先于 SOUL.md */
  agentSoul?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[];
  /** @deprecated 改为 disabledSkills 黑名单 */
  skills?: string[];
  disabledSkills?: string[];
  enableThinking?: boolean;
}
```

- [ ] **Step 2: 修改 `src/main/agents/index.ts`，新增 `avatar`/`themeColor` 字段**

```typescript
import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import { HAL } from "./hal";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL];
```

- [ ] **Step 3: 更新 `src/main/agents/hal.ts`**

```typescript
import type { BuiltinAgentDef } from "./index";

const agentSoul = `你是哈尔（Hal），寄宿在Slime软件中的智能AI，你的任务是帮助Slime的使用者更好地使用Slime以及解决他们的问题，为了达成这个目的你可以使用相关的工具去实现某些操作或者获取你需要的信息。

## Agent 核心原则
- 在你行动之前务必思考清楚用户的核心诉求以及你的目标；
- 确保简单清晰的回答风格；
- 在你尝试了所有可能的工具之后如果依旧没有获取到能解决问题的信息之后，你应该明确地回复用户你不知道，不要去编造不存在的事实；

## 回复格式
- 完成信息收集并写好答案后，再执行清理操作（如关闭浏览器），清理操作之后不要再输出任何文本。`;

export const HAL: BuiltinAgentDef = {
  id: "hal-ai",
  name: "哈尔",
  description: "你好我是哈尔，有任何使用问题都可以来找我～",
  avatar: { kind: "lucide", icon: "lucide:bot" },
  themeColor: "#a855f7",
  config: {
    capabilityRequirements: ["reasoning"],
    subagentEnabled: false,
    disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    agentSoul,
  },
};
```

- [ ] **Step 4: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无类型错误（或仅因后续 DB 层未改而有警告，可先忽略）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/agents/index.ts src/main/agents/hal.ts
git commit -m "feat: add themeColor/agentSoul to agent types and hal def"
```

---

## Task 2: DB 层 — 新增 theme_color 列

**Files:**

- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/models/agentDao.ts`

- [ ] **Step 1: 在 `database.ts` DDL 的 `agents` 表加 `theme_color` 列**

找到 DDL 中 `agents` 表定义，在 `avatar_json TEXT` 后加一行：

```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  protected INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  avatar_json TEXT,
  theme_color TEXT,
  config_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 在 `migrate()` 函数中加 ALTER TABLE**

```typescript
function migrate(instance: BetterSqlite3.Database): void {
  // Add raw_request_body column if it doesn't exist
  const cols = instance.prepare("PRAGMA table_info(relay_logs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "raw_request_body")) {
    instance.exec("ALTER TABLE relay_logs ADD COLUMN raw_request_body TEXT");
  }
  // Add theme_color column to agents if it doesn't exist
  const agentCols = instance.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
  if (!agentCols.some((c) => c.name === "theme_color")) {
    instance.exec("ALTER TABLE agents ADD COLUMN theme_color TEXT");
  }
}
```

- [ ] **Step 3: 修改 `agentDao.ts` — `AgentRow` 新增字段，`rowToAgent` 映射**

在 `AgentRow` interface 加：

```typescript
interface AgentRow {
  id: string;
  name: string;
  type: string;
  enabled: number;
  protected: number;
  description: string | null;
  avatar_json: string | null;
  theme_color: string | null; // 新增
  config_json: string | null;
  created_at: number;
  updated_at: number;
}
```

在 `rowToAgent` 加映射：

```typescript
function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AgentType,
    enabled: !!row.enabled,
    protected: !!row.protected,
    description: row.description ?? undefined,
    avatar: row.avatar_json ? (JSON.parse(row.avatar_json) as AgentAvatar) : undefined,
    themeColor: row.theme_color ?? undefined, // 新增
    config: row.config_json ? (JSON.parse(row.config_json) as AgentConfig) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: 修改 `createAgent` 支持写入 `themeColor`**

```typescript
export function createAgent(
  db: BetterSqlite3.Database,
  data: Omit<Agent, "createdAt" | "updatedAt">,
): Agent {
  const now = Date.now();
  db.prepare(
    `INSERT INTO agents (id, name, type, enabled, protected, description, avatar_json, theme_color, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    data.id,
    data.name,
    data.type,
    data.enabled ? 1 : 0,
    data.protected ? 1 : 0,
    data.description ?? null,
    data.avatar != null ? JSON.stringify(data.avatar) : null,
    data.themeColor ?? null, // 新增
    data.config != null ? JSON.stringify(data.config) : null,
    now,
    now,
  );
  return getAgentById(db, data.id)!;
}
```

- [ ] **Step 5: 修改 `updateAgent` 支持写入 `themeColor`**

在 `updateAgent` 的 sets 块中，`data.avatar` 之后加：

```typescript
if (data.themeColor !== undefined) {
  sets.push("theme_color = ?");
  values.push(data.themeColor ?? null);
}
```

- [ ] **Step 6: 修复 `ensureBuiltin` — 补充 `avatar_json` 和 `theme_color`**

```typescript
export function ensureBuiltin(db: BetterSqlite3.Database): void {
  const now = Date.now();
  const upsert = db.prepare(
    `INSERT INTO agents (id, name, description, type, enabled, protected, avatar_json, theme_color, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       avatar_json = excluded.avatar_json,
       theme_color = excluded.theme_color,
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`,
  );
  for (const agent of BUILTIN_AGENTS) {
    upsert.run(
      agent.id,
      agent.name,
      agent.description ?? null,
      "builtin",
      1,
      1,
      agent.avatar != null ? JSON.stringify(agent.avatar) : null,
      agent.themeColor ?? null,
      JSON.stringify(agent.config),
      now,
      now,
    );
  }
}
```

- [ ] **Step 7: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add src/main/db/database.ts src/main/db/models/agentDao.ts
git commit -m "feat: add theme_color to agents table and agentDao"
```

---

## Task 3: agentSoul 读取优先级

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

找到 `agentChatPresenter.ts` 中读取 SOUL.md 的位置（约第 317 行）：

```typescript
// Read systemPrompt from SOUL.md if available
const agentSystemPrompt = this.agentConfigPresenter
  ? await this.agentConfigPresenter.readSoulMd(session.agentId)
  : "";
```

- [ ] **Step 1: 改为优先读 `agentSoul`，fallback 到 SOUL.md**

先拿到 agent 对象，读取 `config.agentSoul`：

```typescript
// Read system prompt: agentSoul in config takes priority over SOUL.md
const agent = this.agentConfigPresenter
  ? await this.agentConfigPresenter.getAgent(session.agentId)
  : null;
const agentSoulFromConfig = agent?.config?.agentSoul ?? null;
const agentSystemPrompt = agentSoulFromConfig
  ? agentSoulFromConfig
  : this.agentConfigPresenter
    ? await this.agentConfigPresenter.readSoulMd(session.agentId)
    : "";
```

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat: prefer agentSoul config field over SOUL.md"
```

---

## Task 4: 渲染层 — 主题色注入

**Files:**

- Modify: `src/renderer/src/components/chat/AgentAvatar.vue`
- Modify: `src/renderer/src/components/chat/ChatView.vue`

- [ ] **Step 1: 修改 `AgentAvatar.vue` — default fallback 改用 `var(--agent-color)`**

找到 template 底部的 default slot（无头像时的 fallback）：

```html
<!-- Default -->
<div
  v-else
  :class="['flex shrink-0 items-center justify-center rounded-full bg-violet-500/15', s.box]"
>
  <Icon icon="lucide:bot" :class="[s.icon, 'text-violet-400']" />
</div>
```

改为（用 CSS 变量，fallback 到 violet）：

```html
<!-- Default -->
<div
  v-else
  :class="['flex shrink-0 items-center justify-center rounded-full', s.box]"
  style="background-color: color-mix(in srgb, var(--agent-color, #a855f7) 15%, transparent)"
>
  <Icon icon="lucide:bot" :class="s.icon" style="color: var(--agent-color, #a855f7)" />
</div>
```

- [ ] **Step 2: 修改 `ChatView.vue` — 顶层 div 注入 `--agent-color`**

找到 template 最外层 `<div v-if="session" class="relative flex h-full flex-col">`，改为：

```html
<div
  v-if="session"
  class="relative flex h-full flex-col"
  :style="{ '--agent-color': agent?.themeColor ?? '#a855f7' }"
></div>
```

- [ ] **Step 3: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/AgentAvatar.vue src/renderer/src/components/chat/ChatView.vue
git commit -m "feat: inject --agent-color CSS var from agent themeColor"
```

---

## Task 5: New Thread 页面改为卡片布局

**Files:**

- Modify: `src/renderer/src/components/chat/NewThread.vue`

- [ ] **Step 1: 重写 `NewThread.vue` 为卡片网格**

完整替换 `NewThread.vue` 内容：

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import NewThreadInput from "./NewThreadInput.vue";
import AgentAvatar from "./AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import type { Agent } from "@shared/types/agent";

const agentStore = useAgentStore();
const sessionStore = useAgentSessionStore();
const chatStore = useAgentChatStore();

const selectedAgentId = ref<string | null>(null);

onMounted(() => {
  const halAi = agentStore.enabledAgents.find((a) => a.id === "hal-ai");
  if (halAi) {
    selectedAgentId.value = halAi.id;
  } else if (agentStore.enabledAgents.length > 0) {
    selectedAgentId.value = agentStore.enabledAgents[0].id;
  }
});

async function onSend(content: string) {
  if (!selectedAgentId.value) return;
  const session = await sessionStore.createSession(selectedAgentId.value);
  await chatStore.sendMessage(session.id, content);
}

function agentColor(agent: Agent): string {
  return agent.themeColor ?? "#a855f7";
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-1 flex-col items-center justify-center px-8">
      <h2 class="mb-1 text-lg font-medium text-foreground">开始新对话</h2>
      <p class="mb-6 text-sm text-muted-foreground">选择一个 Agent 开始</p>

      <!-- Agent cards -->
      <div class="flex flex-wrap justify-center gap-3">
        <button
          v-for="agent in agentStore.enabledAgents"
          :key="agent.id"
          :style="{
            '--agent-color': agentColor(agent),
            borderColor: selectedAgentId === agent.id ? agentColor(agent) : undefined,
            backgroundColor: selectedAgentId === agent.id ? agentColor(agent) + '1a' : undefined,
          }"
          :class="[
            'flex w-40 flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm transition-colors',
            selectedAgentId === agent.id
              ? 'text-foreground'
              : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
          ]"
          @click="selectedAgentId = agent.id"
        >
          <AgentAvatar :avatar="agent.avatar" size="lg" />
          <span class="font-medium text-foreground">{{ agent.name }}</span>
          <span
            v-if="agent.description"
            class="line-clamp-2 text-center text-xs text-muted-foreground"
          >
            {{ agent.description }}
          </span>
        </button>
      </div>
    </div>

    <!-- Bottom input -->
    <NewThreadInput placeholder="输入消息开始对话..." :disabled="!selectedAgentId" @send="onSend" />
  </div>
</template>
```

注意：脚本顶部需要补上 `import { ref, onMounted } from "vue"`，`ref` 在上面遗漏了，完整 script：

```typescript
import { ref, onMounted } from "vue";
import NewThreadInput from "./NewThreadInput.vue";
import AgentAvatar from "./AgentAvatar.vue";
import { useAgentStore } from "@/stores/agent";
import { useAgentSessionStore } from "@/stores/agentSession";
import { useAgentChatStore } from "@/stores/agentChat";
import type { Agent } from "@shared/types/agent";
```

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/NewThread.vue
git commit -m "feat: redesign NewThread as agent card grid with themeColor"
```

---

## Task 6: AgentEditDialog 加 themeColor 选择器

**Files:**

- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [ ] **Step 1: 在 script 中加 `themeColor` ref，并在 watch 中读取/重置**

在 `enableThinking` ref 后加：

```typescript
const themeColor = ref("#a855f7");
```

在 `watch` 的 edit 模式加载中（`capabilities.value = ...` 附近）加：

```typescript
themeColor.value = agent.themeColor ?? "#a855f7";
```

在 create 模式重置中加：

```typescript
themeColor.value = "#a855f7";
```

- [ ] **Step 2: 在保存时传入 `themeColor`**

找到 `updateAgent` / `createAgent` 调用处，加入 `themeColor: themeColor.value`。

以 `updateAgent` 为例（找到调用处，加一行）：

```typescript
await agentConfig.updateAgent(props.agentId!, {
  name: name.value,
  description: description.value || undefined,
  avatar: buildAvatar(),
  themeColor: themeColor.value, // 新增
  enabled: enabled.value,
  config: buildConfig(),
});
```

`createAgent` 同理。

- [ ] **Step 3: 在 template 中加颜色选择器**

在头像颜色选择区域附近（或"基本信息" tab 的 description 输入框之后）加：

```html
<!-- 主题颜色 -->
<div class="space-y-1.5">
  <label class="text-xs font-medium text-muted-foreground">主题颜色</label>
  <div class="flex items-center gap-2">
    <input
      v-model="themeColor"
      type="color"
      class="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
    />
    <span class="text-xs text-muted-foreground">{{ themeColor }}</span>
    <div class="flex gap-1">
      <button
        v-for="c in PRESET_COLORS"
        :key="c"
        class="h-5 w-5 rounded-full border-2 transition-all"
        :style="{
          backgroundColor: c,
          borderColor: themeColor === c ? 'white' : 'transparent',
        }"
        @click="themeColor = c"
      />
    </div>
  </div>
</div>
```

- [ ] **Step 4: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue
git commit -m "feat: add themeColor picker to AgentEditDialog"
```

---

## Task 7: 测试 & lint

- [ ] **Step 1: 运行全量测试**

```bash
pnpm test
```

Expected: 所有测试通过（或仅已有 skip 测试）。

- [ ] **Step 2: 找到 agentDao 相关测试，补充 themeColor 断言**

找到测试文件（一般在 `test/main/` 下）中 `ensureBuiltin` 相关 case，验证：

1. `ensureBuiltin` 后查询的 agent 有 `themeColor = "#a855f7"`
2. `ensureBuiltin` 再次调用会覆盖 `avatar_json` 和 `theme_color`（upsert 正确）

示例断言：

```typescript
ensureBuiltin(db);
const hal = getAgentById(db, "hal-ai");
expect(hal?.themeColor).toBe("#a855f7");
expect(hal?.avatar).toEqual({ kind: "lucide", icon: "lucide:bot" });

// 验证 upsert 覆盖
ensureBuiltin(db); // 再次调用
const hal2 = getAgentById(db, "hal-ai");
expect(hal2?.themeColor).toBe("#a855f7");
```

- [ ] **Step 3: 运行测试确认通过**

```bash
pnpm test
```

Expected: PASS。

- [ ] **Step 4: lint + format**

```bash
pnpm run format && pnpm run lint
```

Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git add test/
git commit -m "test: add themeColor and ensureBuiltin coverage"
```
