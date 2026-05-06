# 莫斯（MOSS）Agent 设计文档

## 概述

新增内置 Agent 莫斯（MOSS），负责帮助用户管理日程和待办任务。数据存储在 Obsidian Vault 的 Markdown 文件中。同时引入仪表盘机制（Agent Dashboard），作为内置 Agent 的通用扩展能力。

---

## 一、仪表盘机制（Agent Dashboard）

### 1.1 设计目标

- 仅内置 Agent 可拥有仪表盘
- `AgentConfig.dashboard` 字段非空时，与该 Agent 对话的功能区自动出现"仪表盘" Tab
- 仪表盘内容由 Agent 在对话中主动调用 `dashboard_update` 工具推送
- 不同 Agent 可定义完全不同的仪表盘布局

### 1.2 类型扩展

**`src/shared/types/agent.d.ts`**：

```typescript
export interface AgentDashboard {
  template: string; // 完整 HTML 模版，用 {{key}} 占位符绑定数据
}

export interface AgentConfig {
  // ... 现有字段不变
  dashboard?: AgentDashboard; // 仅内置 Agent 使用
}
```

### 1.3 dashboard_update 工具

**注册条件**：`AgentChatPresenter` 在构建工具集时，检查当前 Agent 的 `config.dashboard` 是否存在，存在则将 `dashboard_update` 注入工具集。

**工具定义**：

```typescript
dashboard_update: {
  description: "更新仪表盘显示数据，将数据注入仪表盘模版并刷新渲染",
  parameters: {
    type: "object",
    properties: {
      data: {
        type: "object",
        description: "注入 HTML 模版的键值对，key 对应模版中的 {{key}} 占位符"
      }
    },
    required: ["data"]
  }
}
```

**执行逻辑**：工具执行时通过 `eventBus.sendToRenderer(AGENT_EVENTS.DASHBOARD_UPDATE, { sessionId, data })` 推送到渲染进程。

### 1.4 ChatFunctionPanel 扩展

**Tab 类型扩展**：`"tools" | "preview"` → `"tools" | "preview" | "dashboard"`

**显示条件**：`ChatroomPanel` 切换会话时，读取当前 Agent 的 `config.dashboard`，有值则显示"仪表盘" Tab。

**仪表盘组件 `AgentDashboardPanel.vue`**：

- 接收 `template`（来自 `AgentConfig.dashboard.template`）和 `data`（来自 `dashboard_update` 推送）
- 模版渲染：将 `{{key}}` 替换为 `data[key]`，生成最终 HTML
- 使用 `<iframe srcdoc="...">` 渲染，沙箱隔离

**状态管理**：`dashboardData` 按 `sessionId` 存储在 `useAgentChatStore`，切换会话时保留，不自动清空。

### 1.5 IPC 事件

```typescript
AGENT_EVENTS.DASHBOARD_UPDATE = "agent:dashboard:update";
// payload: { sessionId: string, data: Record<string, unknown> }
```

---

## 二、莫斯 Agent 定义

### 2.1 基本信息

```typescript
export const MOSS: BuiltinAgentDef = {
  id: "moss-ai",
  name: "莫斯",
  description: "你好，我是莫斯，帮你管理日程和待办任务。",
  avatar: { kind: "image", path: "avatars/moss.png" },
  themeColor: "#10b981",
  config: {
    disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    dashboard: { template: MOSS_DASHBOARD_TEMPLATE },
    agentSoul: MOSS_SOUL,
  },
};
```

头像源文件：`/Users/hexueyuan/Downloads/moss.png` → 复制到 `resources/agents/avatars/moss.png`

### 2.2 Obsidian 文件路径约定

路径从 `ConfigPresenter.get("obsidian.vaultPath")` 读取（运行时注入 agentSoul）。

- **任务文件**：`{vaultPath}/Tasks.md`
- **每日记录**：`{vaultPath}/日程记录/{yyyy}年/第{ww}周/{yyyy-mm-dd}.md`
- **周报**：`{vaultPath}/日程记录/{yyyy}年/第{ww}周/weekreport.md`

### 2.3 agentSoul 结构

静态部分写在 `moss.ts`，vault 路径在 `AgentChatPresenter` 构建 system prompt 时动态替换（`agentSoul` 支持 `string | (() => Promise<string>)`，或在 `buildSystemPrompt` 时通过 ConfigPresenter 注入）。

agentSoul 内容覆盖：

- 身份定义：莫斯是日程助手，不参与代码进化
- 路径约定：明确说明任务文件和每日记录的存储路径
- 行为规范：每次写操作后调用 `dashboard_update` 推送最新数据

### 2.4 Tasks.md 格式

```markdown
# 任务列表

## 待办

- [ ] 任务A
- [ ] 任务B

## 进行中

- [ ] 任务C 🔄

## 已完成

- [x] 任务D
```

### 2.5 每日记录格式

```markdown
# 2025-05-06

## 事件记录

- 10:00 完成了 XX
- 14:00 参加了 XX 会议

## 备注
```

### 2.6 仪表盘模版

HTML 模版存为常量，展示：

- 今日任务列表（`{{today_tasks}}`）
- 本周未完成任务（`{{week_pending}}`）
- 最近更新时间（`{{last_updated}}`）

---

## 三、莫斯 Skills

Skills 存放在 `resources/skills/` 下，每个 Skill 是一个目录，包含 `SKILL.md`，frontmatter 声明 `agentIds: [moss-ai]`。

### 3.1 moss-tasks

**职责**：任务管理——新增、更新状态、查询未完成任务。

- 新增任务：在 Tasks.md 对应分类下追加
- 更新状态：修改 checkbox 符号（`[ ]` ↔ `[x]`）+ 移动到对应分类
- 查询：读取 Tasks.md 过滤返回

### 3.2 moss-diary

**职责**：每日记录——记录当天活动、读取历史记录。

- 写入：确保目录存在，追加到当日文件
- 读取：按日期/周构造路径后读取对应文件
- 日期计算：ISO 周数（用于"第 XX 周"目录）

### 3.3 moss-weekly

**职责**：周报生成。

- 读取本周所有日记文件 + Tasks.md
- 生成结构化周报（按天汇总事件 + 本周任务完成情况）
- 写入 `日程记录/{yyyy}年/第{ww}周/weekreport.md`

---

## 四、实现范围与边界

### 需要新增/修改的文件

| 文件                                                       | 变更类型 | 说明                                                                                          |
| ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `src/shared/types/agent.d.ts`                              | 修改     | 新增 `AgentDashboard` 类型，`AgentConfig` 加 `dashboard` 字段                                 |
| `src/main/agents/index.ts`                                 | 修改     | 注册 MOSS 到 `BUILTIN_AGENTS`                                                                 |
| `src/main/agents/moss.ts`                                  | 新增     | 莫斯 Agent 定义                                                                               |
| `src/main/presenter/agentChat/agentChatPresenter.ts`       | 修改     | 构建工具集时按 `config.dashboard` 注入 `dashboard_update` 工具；agentSoul 动态注入 vault 路径 |
| `src/main/eventbus.ts`                                     | 修改     | 新增 `AGENT_EVENTS.DASHBOARD_UPDATE` 事件                                                     |
| `src/renderer/src/components/chat/ChatFunctionPanel.vue`   | 修改     | 新增 `dashboard` Tab，条件渲染 `AgentDashboardPanel`                                          |
| `src/renderer/src/components/chat/AgentDashboardPanel.vue` | 新增     | 仪表盘渲染组件                                                                                |
| `src/renderer/src/views/ChatroomPanel.vue`                 | 修改     | 读取 Agent dashboard 配置，控制 Tab 显示；订阅 dashboard:update 事件                          |
| `src/renderer/src/stores/agentChatStore.ts`                | 修改     | 新增 `dashboardData: Map<sessionId, Record>`                                                  |
| `resources/agents/avatars/moss.png`                        | 新增     | 莫斯头像                                                                                      |
| `resources/skills/moss-tasks/SKILL.md`                     | 新增     | 任务管理 Skill                                                                                |
| `resources/skills/moss-diary/SKILL.md`                     | 新增     | 每日记录 Skill                                                                                |
| `resources/skills/moss-weekly/SKILL.md`                    | 新增     | 周报生成 Skill                                                                                |

### 不需要改动

- `SkillPresenter`：现有 `agentIds` 过滤机制直接支持，无需修改
- `ToolPresenter.getToolSet`：`dashboard_update` 注入在 `AgentChatPresenter` 层处理，保持接口稳定
- 数据库 schema：无新表，`config_json` 直接存储 `dashboard` 字段
- AgentEditDialog：内置 Agent 受保护，用户不编辑，无需 UI 改动

### agentSoul 动态 vault 路径方案

`AgentConfig.agentSoul` 类型扩展为 `string | (() => Promise<string>)`（同步修改 `src/shared/types/agent.d.ts`）。

`AgentChatPresenter` 在构建 system prompt 时（`buildSystemPrompt` 调用前），若 `agentSoul` 为函数则 await 调用，结果作为 agentSoul 字符串使用。

莫斯的 `agentSoul` 实现为异步函数，从 `configPresenter.get("obsidian.vaultPath")` 读取路径后拼接完整 prompt，路径不存在时降级为提示用户配置。
