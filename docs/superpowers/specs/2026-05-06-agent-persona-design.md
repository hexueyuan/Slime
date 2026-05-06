# Agent 个性化元数据设计

**日期**: 2026-05-06
**分支**: brave

## 目标

支持在 `agents/xxxagent.ts` 中定义内置 agent 的头像、简介、主题颜色和 agentSoul（系统 prompt），并在 New Thread 页面以卡片形式展示 agent 头像。所有与该 agent 相关的 UI 颜色以 `themeColor` 为基准。

---

## 1. 类型变更

### `src/shared/types/agent.d.ts`

`Agent` 顶层新增 `themeColor` 字段：

```ts
export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  enabled: boolean;
  protected: boolean;
  description?: string;
  avatar?: AgentAvatar | null;
  themeColor?: string | null; // CSS hex，如 "#a855f7"
  config?: AgentConfig | null;
  createdAt: number;
  updatedAt: number;
}
```

`AgentConfig` 新增 `agentSoul`，原 `systemPrompt` 标记 deprecated：

```ts
export interface AgentConfig {
  // ...existing fields...
  /** @deprecated 使用 agentSoul 替代 */
  systemPrompt?: string;
  /** 内置 agent 的系统 prompt，优先级高于 systemPrompt */
  agentSoul?: string;
}
```

### `src/main/agents/index.ts`

`BuiltinAgentDef` 新增 `avatar` 和 `themeColor`：

```ts
export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig; // agentSoul 在 config 里
}
```

---

## 2. 数据层

### DB Migration

`agents` 表新增列：

```sql
ALTER TABLE agents ADD COLUMN theme_color TEXT;
```

迁移文件加入此 SQL，不影响已有数据（默认 NULL）。

### `src/main/db/models/agentDao.ts`

- `AgentRow` 新增 `theme_color: string | null`
- `rowToAgent` 映射 `themeColor: row.theme_color ?? undefined`
- `createAgent` / `updateAgent` 支持写入 `themeColor`
- `ensureBuiltin` upsert 语句补全 `avatar_json` 和 `theme_color`（当前 upsert 漏掉了 `avatar_json`，一并修复）：

```sql
INSERT INTO agents (id, name, description, type, enabled, protected, avatar_json, theme_color, config_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  avatar_json = excluded.avatar_json,
  theme_color = excluded.theme_color,
  config_json = excluded.config_json,
  updated_at = excluded.updated_at
```

---

## 3. Presenter 层

`AgentConfigPresenter.updateAgent` 已接收 `Partial<Agent>`，`themeColor` 自然流入 `agentDao.updateAgent`，无需额外改动。

`AgentEditDialog` 加颜色选择器（`<input type="color">`），允许编辑自定义 agent 的 `themeColor`。

---

## 4. 主题色注入

在需要展示 agent 的父容器注入 CSS 变量：

```html
<div :style="{ '--agent-color': agent.themeColor ?? '#a855f7' }"></div>
```

所有原先硬编码 `violet-500` / `#a855f7` 的涉及 agent 颜色处改为 `var(--agent-color)`，包括：

- New Thread 卡片选中边框/背景
- `AgentAvatar` 默认 fallback 颜色
- `ChatView` 头部 agent 名称/头像区域
- `SessionList` agent 标识色

---

## 5. New Thread 页面改版

当前 chip 布局改为卡片网格：

- 布局：`flex flex-wrap justify-center gap-3`，每张卡片固定宽约 160px
- 每张卡片内容：`AgentAvatar size="lg"` + agent 名称（font-medium）+ description（`line-clamp-2` 截断，`text-muted-foreground`）
- 选中态：边框和背景使用 `var(--agent-color)`（`border-[var(--agent-color)] bg-[var(--agent-color)]/10`）
- 无 description 时只显示头像 + 名字

---

## 6. hal.ts 更新

`hal.ts` 补充 `avatar` 和 `themeColor`，`config.systemPrompt` 改为 `config.agentSoul`：

```ts
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
    agentSoul: systemPrompt,
  },
};
```

---

## 7. agentSoul 读取优先级

`AgentChatPresenter` 构建 system prompt 时，优先读 `config.agentSoul`，fallback 到 `SOUL.md` 文件（已有逻辑），`config.systemPrompt` 不再读取。

优先级：`config.agentSoul` 非空 → 直接使用，不读 SOUL.md；`config.agentSoul` 为空 → fallback 读 SOUL.md（现有逻辑不变）。`config.systemPrompt` 不再读取。

具体逻辑在 `contextBuilder.ts` 或 `agentChatPresenter.ts` 的 `buildSystemPrompt` 中调整。

---

## 变更文件清单

| 文件                                                                        | 变更类型                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/shared/types/agent.d.ts`                                               | 新增 `Agent.themeColor`，`AgentConfig.agentSoul` |
| `src/main/agents/index.ts`                                                  | `BuiltinAgentDef` 新增 `avatar`/`themeColor`     |
| `src/main/agents/hal.ts`                                                    | 补充 avatar/themeColor，改用 agentSoul           |
| `src/main/db/models/agentDao.ts`                                            | theme_color 字段支持，ensureBuiltin 修复         |
| `src/main/db/index.ts` 或 migration                                         | ALTER TABLE 加 theme_color 列                    |
| `src/renderer/src/components/chat/NewThread.vue`                            | 改为卡片布局，复用 AgentAvatar                   |
| `src/renderer/src/components/chat/AgentAvatar.vue`                          | fallback 颜色改用 `var(--agent-color)`           |
| `src/renderer/src/components/chat/AgentEditDialog.vue`                      | 加 themeColor 颜色选择器                         |
| `src/renderer/src/components/chat/ChatView.vue`                             | 注入 `--agent-color` CSS 变量                    |
| `src/renderer/src/views/ChatroomPanel.vue`                                  | 注入 `--agent-color` 到会话区域                  |
| `src/main/presenter/agentChat/contextBuilder.ts` 或 `agentChatPresenter.ts` | agentSoul 优先级逻辑                             |
