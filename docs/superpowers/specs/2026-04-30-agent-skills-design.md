# Agent Skills 设计

## 概述

为 Agent Loop 增加声明式 Skill 能力。Skill 是 SKILL.md 文件，包含 YAML frontmatter 元数据和 Markdown 指令，加载到 Agent 上下文后由 Agent 自行理解和执行。

## Skill 格式

目录 + `SKILL.md`，兼容 Claude Code 和 OpenClaw 格式：

```yaml
---
name: skill-name
description: Description of when to use this skill.
---
# Skill Title

Markdown 正文（格式无关，Agent 自行理解）
```

可选子目录：`references/`、`scripts/`、`assets/`。

## Skill 类型

| 属性     | Builtin                    | Local                          |
| -------- | -------------------------- | ------------------------------ |
| 来源     | app 资源内（只读）         | workspace `skills/`            |
| 可见范围 | 仅绑定 Agent（`agentIds`） | 所有 Agent（AgentConfig 配置） |
| 用户可见 | 完全透明                   | 可见可配置                     |
| 用户可改 | 不可                       | 可启用/禁用                    |

## 内部类型

```typescript
interface Skill {
  name: string;
  description: string;
  source: "builtin" | "local";
  baseDir: string;
  filePath: string;
  agentIds?: string[]; // builtin 必填
  enabled?: boolean; // local
}
```

## 文件结构

```
# builtin（app 资源内，只读）
resources/skills/
├── slime-guide/
│   └── SKILL.md          # agentIds: ["hal-ai"]

# local（workspace）
workspace/skills/
├── debugging/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
```

## 新增/修改文件

### 新增

| 文件                                   | 职责                             |
| -------------------------------------- | -------------------------------- |
| `src/main/skills/types.ts`             | Skill 类型定义                   |
| `src/main/skills/loader.ts`            | 目录扫描 + YAML frontmatter 解析 |
| `src/main/presenter/skillPresenter.ts` | 缓存、过滤、loadSkill、文件监控  |
| `src/shared/types/skills.ts`           | 共享类型                         |

### 修改

| 文件                       | 改动                                           |
| -------------------------- | ---------------------------------------------- |
| `contextBuilder.ts`        | 接收 skillList 注入 system prompt              |
| `toolPresenter.ts`         | 注册 `Skill` 工具                              |
| `agentChatPresenter.ts`    | 传 skillList 给 contextBuilder，Skill 工具处理 |
| `agent.d.ts` (AgentConfig) | 加 `skills?: string[]`                         |
| `agentDao.ts`              | 无需改（config_json 自动包含新字段）           |
| AgentEditDialog            | 加 Skills tab（勾选 local skills）             |

## 架构和数据流

```
App 启动
  → SkillPresenter.init()
    → 扫描 builtin skills → 按 agentIds 过滤
    → 扫描 local skills (workspace/skills/)
    → 内存缓存

Agent Chat 开始
  → contextBuilder.buildContext(agentId)
    → skillPresenter.getSkillList(agentId)
    → 注入 <system-reminder> 到 system prompt

Agent 调用 Skill
  → Skill(skill="debugging")
    → skillPresenter.loadSkill("debugging")
    → 返回 SKILL.md 内容作为 tool result
    → 下一轮 LLM 看到内容，按指令执行
```

## System Prompt 注入格式

在 system prompt 尾部注入技能列表：

```
<system-reminder>
The following skills are available for use with the Skill tool:
- skill-creator: Create, edit, and improve skills and SKILL.md files.
- debugging: Systematic debugging for errors and unexpected behavior.
</system-reminder>
```

上下文预算紧张时退化为仅列名称。

## Skill 工具定义

```
Skill(skill: string, args?: string)

Execute a skill within the main conversation.
- `skill`: exact name of available skill
- `args`: optional arguments

Important:
- Only invoke skills that appear in the available skills list
- When a skill matches, invoke BEFORE generating response
- If a <command-name> tag is present, skill is already loaded
```

## Agent Loop 执行流程

在 `agentChatPresenter.chat()` 的 executeTool 中：

```typescript
if (name === "Skill") {
  const content = await this.skillPresenter.loadSkill(parsedArgs.skill);
  result = `<system-reminder>\n${content}\n</system-reminder>`;
}
```

Skill 内容作为 tool result 注入，下一轮 LLM 调用看到并按指令执行。不影响 system prompt，不跨轮次持久化。

## 加载流程

```
skillPresenter.getSkillList(agentId)
  1. 若缓存有效 → 返回
  2. 扫描 builtin 目录 → 按 agentIds 过滤
  3. 扫描 workspace/skills/ → 按 AgentConfig.skills 过滤
  4. builtin 优先（同名时忽略 local）
  5. 缓存 → 返回
```

## AgentConfig 扩展

```typescript
interface AgentConfig {
  // ... 现有字段
  skills?: string[]; // 启用的 local skill 名称列表
}
```

## 错误处理

- SKILL.md 解析失败 → 跳过该 Skill，log warning
- `Skill` 调用不存在的 Skill → 返回 `"Skill 'X' not found"`
- 空 `skills/` 目录 → 正常，不注入列表
- `Skill` 工具不在 available skills 中时调用 → 工具定义已声明约束，由 Agent 自行遵守

## 测试

- `loader.ts` 单元测试：目录扫描、frontmatter 解析、agentIds/AgentConfig 过滤
- `skillPresenter.ts` 单元测试：缓存、loadSkill
- `toolPresenter.ts` 集成测试：Skill 工具注册和调用

## UI

AgentEditDialog 增加 Skills tab，列出所有 local skills 并支持勾选。不需要独立的 Skill 管理界面。
