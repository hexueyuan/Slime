# Obsidian 深度集成设计

**日期**: 2026-05-01
**状态**: 已批准

## 概述

将自定义 Agent 的 `systemPrompt`（SOUL.md）和 `skills` 从 Slime 数据库迁移到文件系统，支持用户配置 Obsidian vault 路径，实现在 Obsidian 中直接编辑 Agent 定义和 Skill 内容。

内置 Agent（`type === "builtin"`）不受影响，继续使用现有机制。

---

## 目录结构

### 默认（未配置 Obsidian）

```
~/.slime/agents/{agent-id}/
├── SOUL.md
└── skills/
    └── {skill-name}/
        └── SKILL.md
```

### 配置了 Obsidian vault

```
{vault}/Slime/{agent-name}/
├── SOUL.md
└── skills/
    └── {skill-name}/
        └── SKILL.md
```

说明：

- 默认目录用 `agent-id` 命名（唯一，防重名）
- Obsidian 目录用 `agent-name`（人类可读）
- 内置 Agent 不创建目录，返回 `null`

---

## 配置

**配置键**: `obsidian.vaultPath`，存于 `slime.config.json`

值为 Obsidian vault 根目录的绝对路径，空值表示使用默认目录（`~/.slime/agents/`）。

---

## 路径解析模块

新增 `src/main/utils/agentPaths.ts`，集中管理所有 Agent 文件路径：

```typescript
// 返回 Agent 工作目录，内置 Agent 返回 null
function getAgentDir(
  agent: { id: string; name: string; type: string },
  vaultPath: string | null,
): string | null;

// SOUL.md 路径
function getSoulPath(agentDir: string): string; // agentDir/SOUL.md

// skills 子目录
function getSkillsDir(agentDir: string): string; // agentDir/skills/
```

---

## Agent 生命周期

### 创建

1. DB 写入元数据（现有逻辑不变）
2. 创建 Agent 目录（`fs.mkdir({ recursive: true })`）
3. 写出空 `SOUL.md`（内容为提示注释，引导用户填写）

### 更新

- `name` 变更且使用 Obsidian 目录时，执行 `fs.rename` 重命名目录
- 其他字段变更不涉及文件操作

### 删除

- DB 删除（现有逻辑）
- **不删除**文件目录，留给用户自行清理（避免静默删除 Obsidian 笔记）

---

## systemPrompt 读取

在 `agentChatPresenter` 构建 context 时：

1. 调用 `getAgentDir` 获取目录
2. 读取 `SOUL.md` 内容作为 systemPrompt
3. 文件不存在 → fallback 到空字符串
4. DB `config_json` 中的 `systemPrompt` 字段废弃不读（字段保留，不做 migration）

---

## Skill 加载变更

### 扫描来源

| 类型    | 路径                            | 过滤方式                        |
| ------- | ------------------------------- | ------------------------------- |
| builtin | `projectRoot/resources/skills/` | `agentIds` 白名单（现有）       |
| local   | `agentDir/skills/`              | `disabledSkills` 黑名单（新增） |

### 启用/禁用逻辑

- 目录下存在的 skill 默认全部启用
- `AgentConfig.disabledSkills: string[]`（新增字段）存储禁用的 skill 名称列表
- `AgentConfig.skills` 字段废弃（不读不写）

### 缓存

全局 skill 缓存改为按 `agentId` 缓存，启动时加载，运行时不刷新。

---

## 类型变更

### `AgentConfig`（`src/shared/types/agent.d.ts`）

```typescript
interface AgentConfig {
  capabilityRequirements?: string[];
  // systemPrompt?: string        // 废弃，改从 SOUL.md 读
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[];
  // skills?: string[]            // 废弃，改为黑名单
  disabledSkills?: string[]; // 新增：禁用的 skill 名称
}
```

---

## UI 变更

### Settings General Tab

新增路径配置项：

```
Obsidian Vault 路径
[ 路径输入框 ] [选择目录] [清除]
提示：修改路径后，已有 Agent 目录不会自动迁移。
```

- "选择目录"：`dialog.showOpenDialog({ properties: ['openDirectory'] })`
- "清除"：删除配置值，恢复默认
- 保存：`configPresenter.set("obsidian.vaultPath", path)`

### AgentEditDialog Skills Tab

- 展示该 Agent `agentDir/skills/` 目录下所有 skill（只读来源，不可在此增删）
- 每条 skill 有启用/禁用开关（写入 `config.disabledSkills`）
- 底部显示 skill 目录路径 + "在 Finder 中显示"按钮（`shell.showItemInFolder`）

---

## 变更模块汇总

| 模块                                                 | 变更内容                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| 新增 `src/main/utils/agentPaths.ts`                  | Agent 目录路径解析                                           |
| `src/shared/types/agent.d.ts`                        | `systemPrompt` 废弃；`skills` 废弃；新增 `disabledSkills`    |
| `src/main/presenter/configPresenter.ts`              | 读写 `obsidian.vaultPath`                                    |
| `src/main/presenter/agentConfigPresenter.ts`         | 创建/重命名 Agent 时操作目录文件                             |
| `src/main/presenter/skillPresenter.ts`               | 按 agentId 扫描各自 skills 目录；黑名单过滤；按 agentId 缓存 |
| `src/main/presenter/agentChat/agentChatPresenter.ts` | systemPrompt 从 SOUL.md 读取                                 |
| `src/main/presenter/agentChat/contextBuilder.ts`     | 接收文件读取的 systemPrompt                                  |
| Settings UI（General tab）                           | 新增 Obsidian vault 路径配置项                               |
| `AgentEditDialog` Skills tab                         | 改为目录 skill 列表 + 黑名单禁用控制                         |

---

## 不在本次范围内

- 文件变更实时监听（fs.watch）
- 现有 Agent 数据迁移工具
- 跨 Agent 共享 skill
- Skill 在 UI 中创建/编辑（用户直接在文件系统或 Obsidian 操作）
