# MOSS Agent 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增内置 Agent 莫斯（MOSS），支持日程/任务管理，并引入 Agent Dashboard 通用机制（AgentConfig 声明 HTML 模版，`dashboard_update` 工具推送数据，功能区新增仪表盘 Tab）。

**Architecture:** 分两条主线：(1) 仪表盘机制——类型层扩展 AgentConfig，主进程在 AgentChatPresenter 中条件注入 `dashboard_update` 工具，渲染进程在 ChatFunctionPanel 新增第三个 Tab，订阅 IPC 事件更新数据；(2) 莫斯 Agent——定义 `moss.ts`，写三个 Skill 文件，复制头像资源，`agentSoul` 通过异步函数动态注入 vault 路径。

**Tech Stack:** TypeScript、Vue 3 Composition API、Pinia、Electron IPC（eventBus）、Zod（工具参数校验）

---

## 文件清单

| 文件 | 变更 |
|------|------|
| `src/shared/types/agent.d.ts` | 修改：新增 `AgentDashboard`，`AgentConfig` 加 `dashboard`，`agentSoul` 支持函数类型 |
| `src/shared/events.ts` | 修改：`AGENT_EVENTS` 加 `DASHBOARD_UPDATE` |
| `src/main/agents/moss.ts` | 新增：莫斯 Agent 定义 |
| `src/main/agents/index.ts` | 修改：注册 MOSS |
| `src/main/presenter/agentConfigPresenter.ts` | 修改：`syncBuiltinAvatars` 加 `moss.png` |
| `src/main/presenter/agentChat/agentChatPresenter.ts` | 修改：(1) agentSoul 函数支持；(2) 注入 `dashboard_update` 工具 |
| `src/renderer/src/stores/agentChat.ts` | 修改：新增 `dashboardData` Map + `setDashboardData` |
| `src/renderer/src/stores/agentChatIpc.ts` | 修改：订阅 `DASHBOARD_UPDATE` 事件 |
| `src/renderer/src/components/chat/AgentDashboardPanel.vue` | 新增：仪表盘渲染组件 |
| `src/renderer/src/components/chat/ChatFunctionPanel.vue` | 修改：新增 `dashboard` Tab |
| `src/renderer/src/views/ChatroomPanel.vue` | 修改：读取 Agent dashboard 配置控制 Tab 显示；传 dashboard 数据给 ChatFunctionPanel |
| `resources/agents/moss.png` | 新增：复制自 `/Users/hexueyuan/Downloads/moss.png` |
| `resources/skills/moss-tasks/SKILL.md` | 新增 |
| `resources/skills/moss-diary/SKILL.md` | 新增 |
| `resources/skills/moss-weekly/SKILL.md` | 新增 |

---

## Task 1：类型与事件扩展

**Files:**
- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/shared/events.ts`

- [ ] **Step 1：扩展 agent.d.ts**

在 `src/shared/types/agent.d.ts` 的 `AgentConfig` 接口前面加入 `AgentDashboard`，并修改 `AgentConfig`：

```typescript
// 在文件顶部 AgentConfig 前插入：
export interface AgentDashboard {
  template: string
}
```

修改 `AgentConfig`：将 `agentSoul?: string` 改为：
```typescript
agentSoul?: string | (() => Promise<string>)
dashboard?: AgentDashboard
```

完整修改后的 `AgentConfig` 接口：

```typescript
export interface AgentConfig {
  capabilityRequirements?: string[];
  /** @deprecated 使用 agentSoul 替代 */
  systemPrompt?: string;
  /** 内置 agent 的系统 prompt，非空时优先于 SOUL.md。支持异步函数用于动态注入运行时数据 */
  agentSoul?: string | (() => Promise<string>);
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[]; // "{server_id}/{tool_name}"[]
  /** @deprecated 改为 disabledSkills 黑名单 */
  skills?: string[];
  /** 禁用的 skill 名称列表，目录下存在的 skill 默认启用 */
  disabledSkills?: string[];
  /** 启用 Anthropic extended thinking 模式 */
  enableThinking?: boolean;
  /** 仪表盘配置，仅内置 Agent 使用 */
  dashboard?: AgentDashboard;
}
```

- [ ] **Step 2：新增 DASHBOARD_UPDATE 事件**

在 `src/shared/events.ts` 中修改 `AGENT_EVENTS`：

```typescript
export const AGENT_EVENTS = {
  CHANGED: "agent:changed",
  DASHBOARD_UPDATE: "agent:dashboard:update",
} as const;
```

- [ ] **Step 3：提交**

```bash
git add src/shared/types/agent.d.ts src/shared/events.ts
git commit -m "feat(agent): add AgentDashboard type and DASHBOARD_UPDATE event"
```

---

## Task 2：AgentChatPresenter 支持异步 agentSoul + 注入 dashboard_update

**Files:**
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [ ] **Step 1：修改 agentSoul 解析逻辑**

找到文件第 317-323 行（agentSoul 读取处）：

```typescript
// Read system prompt: agentSoul in config takes priority over SOUL.md
const agentSoulFromConfig = agent?.config?.agentSoul ?? null;
const agentSystemPrompt = agentSoulFromConfig
  ? agentSoulFromConfig
  : this.agentConfigPresenter
    ? await this.agentConfigPresenter.readSoulMd(session.agentId)
    : "";
```

替换为：

```typescript
// Read system prompt: agentSoul in config takes priority over SOUL.md
const agentSoulRaw = agent?.config?.agentSoul ?? null;
const agentSoulResolved =
  typeof agentSoulRaw === "function" ? await agentSoulRaw() : (agentSoulRaw ?? null);
const agentSystemPrompt = agentSoulResolved
  ? agentSoulResolved
  : this.agentConfigPresenter
    ? await this.agentConfigPresenter.readSoulMd(session.agentId)
    : "";
```

- [ ] **Step 2：在工具过滤后注入 dashboard_update 工具**

找到文件第 332-341 行（Filter disabled tools 块）之后、`const tools = this.convertTools(...)` 之前，在 `filteredAiSdkTools` 构建完成后加入：

```typescript
// Inject dashboard_update tool if agent has dashboard config
if (agent?.config?.dashboard) {
  filteredAiSdkTools["dashboard_update"] = {
    description: "更新仪表盘显示数据，将数据注入仪表盘模版并刷新渲染",
    inputSchema: z.object({
      data: z
        .record(z.unknown())
        .describe("注入 HTML 模版的键值对，key 对应模版中的 {{key}} 占位符"),
    }),
    execute: async ({ data }: { data: Record<string, unknown> }) => {
      eventBus.sendToRenderer(AGENT_EVENTS.DASHBOARD_UPDATE, { sessionId, data });
      return "Dashboard updated";
    },
  };
}
```

注意：需要在文件顶部 import 中加入 `AGENT_EVENTS`：

```typescript
import { CHAT_STREAM_EVENTS, AGENT_EVENTS } from "@shared/events";
```

（原来只有 `CHAT_STREAM_EVENTS`，需要加上 `AGENT_EVENTS`）

- [ ] **Step 3：运行类型检查确认无误**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误（可能有因 `filteredAiSdkTools` 类型的 readonly 警告，可以用 `const mutableTools = { ...filteredAiSdkTools }` 然后操作 `mutableTools`）

若有 readonly 错误，将工具过滤那段改为：

```typescript
const filteredAiSdkTools: Record<string, any> =
  disabledTools.length > 0
    ? Object.fromEntries(
        Object.entries(allAiSdkTools).filter(([k]) => !disabledTools.includes(k)),
      )
    : { ...allAiSdkTools };
```

- [ ] **Step 4：提交**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(agentChat): support async agentSoul and inject dashboard_update tool"
```

---

## Task 3：渲染进程 dashboardData 状态 + IPC 订阅

**Files:**
- Modify: `src/renderer/src/stores/agentChat.ts`
- Modify: `src/renderer/src/stores/agentChatIpc.ts`

- [ ] **Step 1：agentChat store 加 dashboardData**

在 `src/renderer/src/stores/agentChat.ts` 的 `const error = ref...` 后面加：

```typescript
const dashboardData = ref<Map<string, Record<string, unknown>>>(new Map());
```

在 `clearMessages` 函数里不清空 dashboardData（数据应保留）。

新增函数：

```typescript
function setDashboardData(sessionId: string, data: Record<string, unknown>) {
  dashboardData.value = new Map(dashboardData.value).set(sessionId, data);
}
```

在 `return` 中加入 `dashboardData` 和 `setDashboardData`：

```typescript
return {
  messages,
  isGenerating,
  streamingMessageId,
  streamingBlocks,
  error,
  userProfile,
  dashboardData,
  fetchMessages,
  sendMessage,
  stopGeneration,
  retryLast,
  answerQuestion,
  setStreamingState,
  clearStreamingState,
  setError,
  clearError,
  clearMessages,
  fetchUserProfile,
  saveUserProfile,
  setDashboardData,
};
```

- [ ] **Step 2：agentChatIpc 订阅 DASHBOARD_UPDATE**

在 `src/renderer/src/stores/agentChatIpc.ts` 顶部 import 加入 `AGENT_EVENTS`：

```typescript
import { CHAT_STREAM_EVENTS, AGENT_EVENTS } from "@shared/events";
```

在 `setupAgentChatIpc` 函数中，在现有三个订阅之后加入：

```typescript
interface DashboardUpdateData {
  sessionId: string;
  data: Record<string, unknown>;
}

const unsubDashboard = window.electron.ipcRenderer.on(
  AGENT_EVENTS.DASHBOARD_UPDATE,
  (payload: unknown) => {
    const d = payload as DashboardUpdateData;
    store.setDashboardData(d.sessionId, d.data);
  },
);
unsubs.push(unsubDashboard);
```

- [ ] **Step 3：类型检查**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 4：提交**

```bash
git add src/renderer/src/stores/agentChat.ts src/renderer/src/stores/agentChatIpc.ts
git commit -m "feat(store): add dashboardData state and DASHBOARD_UPDATE IPC subscription"
```

---

## Task 4：AgentDashboardPanel 组件 + ChatFunctionPanel 扩展

**Files:**
- Create: `src/renderer/src/components/chat/AgentDashboardPanel.vue`
- Modify: `src/renderer/src/components/chat/ChatFunctionPanel.vue`

- [ ] **Step 1：新建 AgentDashboardPanel.vue**

创建 `src/renderer/src/components/chat/AgentDashboardPanel.vue`：

```vue
<template>
  <div class="h-full w-full">
    <iframe
      v-if="renderedHtml"
      :srcdoc="renderedHtml"
      class="h-full w-full border-none"
      sandbox="allow-scripts"
    />
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      等待数据更新...
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  template: string;
  data: Record<string, unknown>;
}>();

const renderedHtml = computed(() => {
  if (!props.template) return null;
  return props.template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = props.data[key];
    return val !== undefined ? String(val) : "";
  });
});
</script>
```

- [ ] **Step 2：修改 ChatFunctionPanel.vue — props 和 template**

将 `defineProps` 改为：

```typescript
defineProps<{
  activeTab: "tools" | "preview" | "dashboard";
  toolCallBlocks: AssistantMessageBlock[];
  selectedToolCallId?: string | null;
  thoughtChainBlocks?: AgentMessageBlock[] | null;
  dashboardTemplate?: string | null;
  dashboardData?: Record<string, unknown>;
  showDashboard?: boolean;
}>();

defineEmits<{
  "update:activeTab": [tab: "tools" | "preview" | "dashboard"];
  "select-tool-call": [id: string | null];
}>();
```

在 `<script setup>` 中加 import：

```typescript
import AgentDashboardPanel from "@/components/chat/AgentDashboardPanel.vue";
```

- [ ] **Step 3：修改 ChatFunctionPanel.vue — template**

在 Tab 按钮区加入仪表盘 Tab 按钮（紧跟预览按钮后）：

```vue
<button
  v-if="showDashboard"
  data-testid="chat-tab-dashboard"
  class="px-4 py-2 text-sm font-medium transition-colors"
  :class="
    activeTab === 'dashboard'
      ? 'text-foreground border-b-2 border-primary'
      : 'text-muted-foreground hover:text-foreground'
  "
  @click="$emit('update:activeTab', 'dashboard')"
>
  仪表盘
</button>
```

在内容区加入仪表盘面板（在 `ContentDispatcher` 的 `v-else-if` 后加一个新的 `v-else-if`）：

```vue
<AgentDashboardPanel
  v-else-if="activeTab === 'dashboard' && dashboardTemplate"
  :template="dashboardTemplate"
  :data="dashboardData ?? {}"
/>
```

- [ ] **Step 4：类型检查**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 5：提交**

```bash
git add src/renderer/src/components/chat/AgentDashboardPanel.vue src/renderer/src/components/chat/ChatFunctionPanel.vue
git commit -m "feat(ui): add AgentDashboardPanel and extend ChatFunctionPanel with dashboard tab"
```

---

## Task 5：ChatroomPanel 连接 dashboard 逻辑

**Files:**
- Modify: `src/renderer/src/views/ChatroomPanel.vue`

- [ ] **Step 1：读取当前 Agent dashboard 配置**

在 `<script setup>` 中加入以下 computed（放在 `toolCallBlocks` computed 之后）：

```typescript
const activeAgent = computed(() => {
  const session = sessionStore.activeSession;
  if (!session) return null;
  return agentStore.agents.find((a) => a.id === session.agentId) ?? null;
});

const dashboardTemplate = computed(() => {
  return activeAgent.value?.config?.dashboard?.template ?? null;
});

const showDashboard = computed(() => !!dashboardTemplate.value);

const currentDashboardData = computed(() => {
  const sid = sessionStore.activeSessionId;
  if (!sid) return {};
  return chatStore.dashboardData.get(sid) ?? {};
});
```

- [ ] **Step 2：会话切换时重置 activeTab（不跳到 dashboard）**

在现有的 `watch(() => sessionStore.activeSessionId, ...)` 中加一行，确保切换时如果新 agent 没有 dashboard，activeTab 不卡在 dashboard：

```typescript
watch(
  () => sessionStore.activeSessionId,
  () => {
    selectedToolCallId.value = null;
    selectedThoughtMessageId.value = null;
    showStreamingThought.value = false;
    if (activeTab.value === "dashboard" && !showDashboard.value) {
      activeTab.value = "tools";
    }
  },
);
```

- [ ] **Step 3：更新 activeTab ref 类型**

将：
```typescript
const activeTab = ref<"tools" | "preview">("tools");
```
改为：
```typescript
const activeTab = ref<"tools" | "preview" | "dashboard">("tools");
```

- [ ] **Step 4：在 template 中传 dashboard props 给 ChatFunctionPanel**

将 ChatFunctionPanel 那段改为：

```vue
<ChatFunctionPanel
  :active-tab="activeTab"
  :tool-call-blocks="toolCallBlocks"
  :selected-tool-call-id="selectedToolCallId"
  :thought-chain-blocks="thoughtChainBlocks"
  :show-dashboard="showDashboard"
  :dashboard-template="dashboardTemplate"
  :dashboard-data="currentDashboardData"
  @update:active-tab="activeTab = $event"
  @select-tool-call="onSelectToolCall"
/>
```

- [ ] **Step 5：类型检查**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 6：提交**

```bash
git add src/renderer/src/views/ChatroomPanel.vue
git commit -m "feat(chatroom): wire dashboard template and data to ChatFunctionPanel"
```

---

## Task 6：莫斯头像资源

**Files:**
- Create: `resources/agents/moss.png`

- [ ] **Step 1：复制头像文件**

```bash
cp /Users/hexueyuan/Downloads/moss.png /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime/resources/agents/moss.png
```

- [ ] **Step 2：更新 agentConfigPresenter 的 syncBuiltinAvatars**

在 `src/main/presenter/agentConfigPresenter.ts` 的 `avatarMap` 里加入 moss：

```typescript
const avatarMap: Record<string, string> = {
  "hal.png": join(agentsResourceDir, "hal.png"),
  "moss.png": join(agentsResourceDir, "moss.png"),
};
```

注意：`agentsResourceDir` 是 `join(paths.projectRoot, "resources", "agents")`，moss.png 放在 `resources/agents/moss.png`，路径匹配。

- [ ] **Step 3：提交**

```bash
git add resources/agents/moss.png src/main/presenter/agentConfigPresenter.ts
git commit -m "feat(assets): add moss avatar and register in syncBuiltinAvatars"
```

---

## Task 7：莫斯 Agent 定义

**Files:**
- Create: `src/main/agents/moss.ts`
- Modify: `src/main/agents/index.ts`

- [ ] **Step 1：新建 moss.ts**

创建 `src/main/agents/moss.ts`：

```typescript
import type { BuiltinAgentDef } from "./index";
import type { ConfigPresenter } from "@/presenter/configPresenter";

let configPresenterRef: ConfigPresenter | null = null;

export function setMossConfigPresenter(cp: ConfigPresenter): void {
  configPresenterRef = cp;
}

async function buildAgentSoul(): Promise<string> {
  const vaultPath =
    configPresenterRef ? ((await configPresenterRef.get("obsidian.vaultPath")) as string | null) : null;

  const tasksPath = vaultPath ? `${vaultPath}/Tasks.md` : "(未配置 Obsidian Vault 路径，请先在设置中配置)";
  const diaryBase = vaultPath ? `${vaultPath}/日程记录` : "(未配置)";

  return `你是莫斯（MOSS），一个日程与任务管理助手，寄宿在 Slime 中帮助用户记录日程、管理待办事项。

## 身份与定位
- 你专注于日程管理和任务跟踪，不参与代码进化相关工作
- 你的数据存储在用户的 Obsidian Vault 中，使用 read/write 工具读写文件
- 每次完成写操作后，调用 dashboard_update 工具更新仪表盘数据

## 文件路径约定
- 任务文件（固定）：${tasksPath}
- 每日记录目录：${diaryBase}/{yyyy}年/第{ww}周/{yyyy-mm-dd}.md
  - 示例：${diaryBase}/2025年/第18周/2025-05-06.md
  - 周数使用 ISO 8601 定义（周一为一周起始，包含当年第一个周四的周为第1周）
- 周报：${diaryBase}/{yyyy}年/第{ww}周/weekreport.md

## Tasks.md 格式
\`\`\`markdown
# 任务列表

## 待办
- [ ] 任务名称

## 进行中
- [ ] 任务名称 🔄

## 已完成
- [x] 任务名称
\`\`\`

## 每日记录格式
\`\`\`markdown
# {yyyy-mm-dd}

## 事件记录
- {HH:mm} 事件描述

## 备注
\`\`\`

## 行为规范
- 新增、更新任务后，读取 Tasks.md 并调用 dashboard_update 推送最新数据
- 新增每日记录后，也调用 dashboard_update 更新仪表盘
- 查询时直接读取对应文件，不需要调用 dashboard_update
- 日期和周数计算基于用户提供的当前时间，如用户未提供则询问
- 若 Vault 路径未配置，告知用户在设置中配置 Obsidian Vault 路径

## Agent 核心原则
- 行动前思考清楚用户的核心诉求
- 保持简洁清晰的回答风格`;
}

const MOSS_DASHBOARD_TEMPLATE = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    font-size: 13px;
  }
  h2 { font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 10px; letter-spacing: 0.05em; text-transform: uppercase; }
  .card { background: #1e293b; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
  .task-item { padding: 4px 0; border-bottom: 1px solid #334155; color: #cbd5e1; }
  .task-item:last-child { border-bottom: none; }
  .empty { color: #475569; font-style: italic; }
  .updated { font-size: 11px; color: #475569; text-align: right; margin-top: 8px; }
  .stat { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; color: #cbd5e1; }
  .stat-value { font-weight: 600; color: #10b981; }
</style>
</head>
<body>
  <div class="card">
    <h2>今日任务</h2>
    <div>{{today_tasks}}</div>
  </div>
  <div class="card">
    <h2>本周待完成</h2>
    <div>{{week_pending}}</div>
  </div>
  <p class="updated">最后更新：{{last_updated}}</p>
</body>
</html>`;

export const MOSS: BuiltinAgentDef = {
  id: "moss-ai",
  name: "莫斯",
  description: "你好，我是莫斯，帮你管理日程和待办任务。",
  avatar: { kind: "image", path: "avatars/moss.png" },
  themeColor: "#10b981",
  config: {
    subagentEnabled: false,
    disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    agentSoul: buildAgentSoul,
    dashboard: { template: MOSS_DASHBOARD_TEMPLATE },
  },
};
```

- [ ] **Step 2：在 index.ts 注册 MOSS**

修改 `src/main/agents/index.ts`：

```typescript
import type { AgentConfig, AgentAvatar } from "@shared/types/agent";
import { HAL } from "./hal";
import { MOSS } from "./moss";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL, MOSS];
```

- [ ] **Step 3：在 AgentConfigPresenter 中注入 ConfigPresenter 给 moss**

在 `src/main/presenter/agentConfigPresenter.ts` 的 `setConfigPresenter` 方法里，在赋值后加：

```typescript
setConfigPresenter(cp: ConfigPresenter): void {
  this.configPresenter = cp;
  // 注入给需要动态读取配置的内置 Agent
  import("@/agents/moss").then(({ setMossConfigPresenter }) => {
    setMossConfigPresenter(cp);
  });
}
```

- [ ] **Step 4：类型检查**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 5：提交**

```bash
git add src/main/agents/moss.ts src/main/agents/index.ts src/main/presenter/agentConfigPresenter.ts
git commit -m "feat(agent): add MOSS builtin agent with dashboard template and async agentSoul"
```

---

## Task 8：莫斯 Skills

**Files:**
- Create: `resources/skills/moss-tasks/SKILL.md`
- Create: `resources/skills/moss-diary/SKILL.md`
- Create: `resources/skills/moss-weekly/SKILL.md`

- [ ] **Step 1：新建 moss-tasks/SKILL.md**

创建 `resources/skills/moss-tasks/SKILL.md`：

```markdown
---
name: moss-tasks
description: 管理 Obsidian Tasks.md 中的待办任务，支持新增、状态更新、查询
agentIds:
  - moss-ai
---

# 任务管理指南

## 读取任务
使用 `read` 工具读取 Tasks.md 文件（绝对路径），获取当前所有任务。

## 新增任务
1. 用 `read` 读取 Tasks.md
2. 在 `## 待办` 分类下追加一行 `- [ ] 任务名称`
3. 用 `write` 写回文件

## 更新任务状态
- 待办 → 进行中：将 `- [ ] 任务名称` 改为 `- [ ] 任务名称 🔄`，并移动到 `## 进行中` 分类
- 进行中 → 已完成：将 `- [ ] 任务名称 🔄` 改为 `- [x] 任务名称`，并移动到 `## 已完成` 分类
- 待办 → 已完成：将 `- [ ]` 改为 `- [x]`，移动到 `## 已完成` 分类
- 操作步骤：read → 字符串替换 → write

## 查询未完成任务
读取 Tasks.md，返回 `## 待办` 和 `## 进行中` 中的所有条目。

## Tasks.md 文件格式（不存在时自动创建）
```
# 任务列表

## 待办

## 进行中

## 已完成
```

## 更新仪表盘
每次写操作完成后，读取 Tasks.md，提取数据调用 dashboard_update：
- today_tasks：今日相关任务的 HTML 列表（`<div class="task-item">` 包裹每项）
- week_pending：本周待完成任务的 HTML 列表
- last_updated：当前时间字符串
```

- [ ] **Step 2：新建 moss-diary/SKILL.md**

创建 `resources/skills/moss-diary/SKILL.md`：

```markdown
---
name: moss-diary
description: 管理每日记录，按年/周/日期组织在 Obsidian Vault 中
agentIds:
  - moss-ai
---

# 每日记录指南

## 路径计算
给定日期 yyyy-mm-dd：
1. 提取年份 yyyy
2. 计算 ISO 周数 ww（两位数字，不足补零，如第5周 → "05"）
   - ISO 周：周一为一周起始，包含当年第一个周四的周为第1周
3. 路径：`{diaryBase}/{yyyy}年/第{ww}周/{yyyy-mm-dd}.md`

## 写入记录
1. 构造目标文件路径
2. 用 `read` 尝试读取文件（文件不存在时用 write 创建）
3. 若文件不存在，创建文件头：
   ```
   # {yyyy-mm-dd}

   ## 事件记录

   ## 备注
   ```
4. 追加事件行：在 `## 事件记录` 下加 `- {HH:mm} 事件描述`
5. 用 `write` 写回（全量覆盖）

## 读取历史记录
- 指定日期：构造路径后 read，文件不存在时告知用户当天无记录
- 本周记录：遍历本周每天（周一到今天），read 每个文件，汇总返回
- 昨天/上周等：计算对应日期后读取

## 注意
- 写操作完成后调用 dashboard_update 更新仪表盘数据
- 用户说"刚才"、"今天上午"等模糊时间时，请求用户确认具体时间
```

- [ ] **Step 3：新建 moss-weekly/SKILL.md**

创建 `resources/skills/moss-weekly/SKILL.md`：

```markdown
---
name: moss-weekly
description: 生成周报，汇总本周每日记录和任务完成情况
agentIds:
  - moss-ai
---

# 周报生成指南

## 生成步骤
1. 确定目标周：默认本周，也可按用户指定
2. 计算本周日期范围（周一到周日）
3. 遍历每天读取日记文件（文件不存在跳过）
4. 读取 Tasks.md，筛选本周已完成任务（[x]）
5. 组装周报内容
6. 写入 `{diaryBase}/{yyyy}年/第{ww}周/weekreport.md`

## 周报格式
```
# 第{ww}周工作周报（{月/日} - {月/日}）

## 本周完成任务
- [x] 任务名称（来自 Tasks.md 已完成列表）

## 每日记录摘要

### 周一 {yyyy-mm-dd}
- {HH:mm} 事件描述
（无记录则写"无记录"）

### 周二 {yyyy-mm-dd}
...（以此类推）

## 备注
```

## 注意
- 读取文件失败（文件不存在）视为当天无记录，不报错
- 周报写入成功后告知用户文件路径
- 不自动调用 dashboard_update（周报生成是只读+写报告，不改变任务状态）
```

- [ ] **Step 4：提交**

```bash
git add resources/skills/moss-tasks/SKILL.md resources/skills/moss-diary/SKILL.md resources/skills/moss-weekly/SKILL.md
git commit -m "feat(skills): add moss-tasks, moss-diary, moss-weekly skills"
```

---

## Task 9：格式化、Lint、最终验证

**Files:** 所有修改过的文件

- [ ] **Step 1：格式化**

```bash
pnpm run format
```

- [ ] **Step 2：Lint**

```bash
pnpm run lint
```

Expected: 无错误（警告可忽略）

- [ ] **Step 3：完整类型检查**

```bash
pnpm run typecheck
```

Expected: 无错误

- [ ] **Step 4：提交格式化变更（如有）**

```bash
git add -A
git status
```

只有格式化改动时才提交：

```bash
git commit -m "style: format after moss agent implementation"
```

---

## 验收标准

实现完成后，以下行为应全部可用：

1. 打开 Slime，莫斯出现在 Agent 列表
2. 与莫斯对话，功能区出现"仪表盘" Tab
3. 对话中莫斯调用 `dashboard_update` 后，仪表盘 Tab 显示数据
4. 与哈尔对话时，没有"仪表盘" Tab
5. 切换会话时仪表盘数据按 sessionId 独立保存
6. Skills `moss-tasks`、`moss-diary`、`moss-weekly` 在莫斯会话中可用（system reminder 中出现）
