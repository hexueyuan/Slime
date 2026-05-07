# Slime Market Extraction Design

## 概述

将 Agent 和 Skill 定义从 Slime 数据库迁移到独立 git 仓库 `slime-market`，通过文件系统加载。彻底废弃 `agents` 数据库表。

## 目标

1. Agent/Skill 定义文件系统化，单一数据源
2. slime-market 仓库独立管理，用户 fork 后自定义
3. Slime 只保留 hal-ai 作为唯一内置 Agent（打包在 app 内）
4. 会话数据（sessions/messages）继续用 SQLite

## 目录结构

### slime-market 仓库

```
slime-market/
├── README.md
├── agents/
│   └── moss-ai/
│       ├── AGENT.json
│       ├── PROMPT.md
│       └── avatar.png
└── skills/
    └── slime-task-manage/
        └── SKILL.md
```

### 本地路径

```
~/.slime/
└── slime-market/          # 用户 clone 的仓库（固定路径）
    ├── agents/
    └── skills/
```

## 文件格式

### AGENT.json

```json
{
  "name": "莫斯",
  "description": "帮你管理日程和待办任务",
  "mbti": "ISFJ",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": ["exec", "ask_user", "skill"],
  "enabledSkills": ["slime-task-manage"],
  "allowedCliCommands": ["task"],
  "enableThinking": true,
  "subagentEnabled": false,
  "mcpTools": []
}
```

**字段说明：**

| 字段                   | 必填 | 默认值 | 说明                                  |
| ---------------------- | ---- | ------ | ------------------------------------- |
| name                   | 是   | -      | 显示名称（中文）                      |
| description            | 否   | ""     | Agent 描述                            |
| mbti                   | 是   | -      | 16 种 MBTI 类型之一                   |
| capabilityRequirements | 否   | []     | LLM 能力需求                          |
| enabledTools           | 否   | []     | 工具白名单                            |
| enabledSkills          | 否   | []     | Skill 引用（全局 skill 名称）         |
| allowedCliCommands     | 否   | []     | CLI 命令白名单（非空时自动注入 help） |
| enableThinking         | 否   | false  | 是否启用 thinking                     |
| subagentEnabled        | 否   | false  | 是否启用子 agent                      |
| mcpTools               | 否   | []     | MCP 工具白名单                        |

**移除的字段：**

- `maxTokens`：固定 32768，运行时硬编码
- `temperature`：由 MBTI 自动推导

### PROMPT.md

纯 Markdown 文件，作为 `additionalPrompt` 注入系统提示词。可选，不存在时为空。

### 头像

Agent 目录下的 `avatar.png`/`avatar.jpg`/`avatar.webp`。可选，不存在时用 MBTI 默认色生成占位。

### Skill（`skills/<name>/SKILL.md`）

沿用现有格式：YAML frontmatter（name, description）+ Markdown 正文。

## Agent ID 规则

- **ID = 目录名**
- 格式：`/^[a-z][a-z0-9-]*$/`，最长 50 字符
- UI 创建时用户输入英文名（即 ID），必须全局唯一
- 会话表 `agent_id` 存此值

## MBTI → Temperature 映射

```typescript
const MBTI_TEMPERATURE: Record<MBTIType, number> = {
  // xTxJ: 严谨、结构化
  INTJ: 0.3,
  ISTJ: 0.3,
  ENTJ: 0.3,
  ESTJ: 0.3,
  // xTxP: 逻辑但灵活
  INTP: 0.5,
  ISTP: 0.5,
  ENTP: 0.5,
  ESTP: 0.5,
  // xFxJ: 有条理但温和
  INFJ: 0.4,
  ISFJ: 0.4,
  ENFJ: 0.4,
  ESFJ: 0.4,
  // xFxP: 随性、开放
  INFP: 0.7,
  ISFP: 0.7,
  ENFP: 0.7,
  ESFP: 0.7,
};
```

## 加载架构

### Agent 加载顺序

1. **hal-ai**（内置）：从 app 资源加载
   - packaged: `app.getAppPath()/../resources/agents/hal-ai/`
   - dev: `process.cwd()/src/main/agents/hal-ai/`
2. **market agents**：扫描 `~/.slime/slime-market/agents/` 所有子目录
   - 含合法 `AGENT.json` 的目录即为 Agent
   - 格式错误/缺文件 → 跳过，log 警告

### Skill 加载

- 全局 skill 源：`~/.slime/slime-market/skills/`
- Agent 通过 `enabledSkills` 字段引用 skill 名称

### hal-ai 特殊性

- `protected = true`，UI 不可编辑/删除
- 不依赖 slime-market 存在
- slime-market 缺失时只有哈尔可用

## 会话关联

- `agent_sessions.agent_id` = Agent 目录名（TEXT，无外键约束）
- Agent 被删除后，历史会话仍可浏览消息，但无法新建会话
- UI 显示 "Agent 已移除" 标记

## 代码改造

### 新增

| 文件                              | 职责                                                   |
| --------------------------------- | ------------------------------------------------------ |
| `src/main/agents/marketLoader.ts` | 扫描 market agents 目录，解析 AGENT.json，返回 Agent[] |
| `src/shared/constants/mbti.ts`    | 新增 `MBTI_TEMPERATURE` 映射                           |
| `src/main/utils/paths.ts`         | 新增 `marketDir`/`marketAgentsDir`/`marketSkillsDir`   |

### 修改

| 文件                                         | 变更                                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/main/agents/index.ts`                   | 只加载 hal-ai                                            |
| `src/main/presenter/agentConfigPresenter.ts` | 重写：列表=hal + market；CRUD 改为文件读写；删除 DB 依赖 |
| `src/main/presenter/skillPresenter.ts`       | 全局 skill 源改为 `~/.slime/slime-market/skills/`        |
| `src/main/db/database.ts`                    | 删除 `agents` 表 DDL；`agent_sessions.agent_id` 去外键   |
| `src/main/db/models/agentDao.ts`             | 删除 agent CRUD 函数，保留 session 相关                  |

### 废弃

- `agents` 数据库表
- `agentDao` 中的 `ensureBuiltin`/`createAgent`/`updateAgent`/`removeAgent`/`listAgents`/`getAgentById`
- `AgentType` enum 中的 `builtin`/`custom` 区分（改为 `isBuiltin` 布尔标志）

### UI 适配

| 组件           | 变更                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| AgentManageTab | 列表不再区分 builtin/custom 分组                                                                   |
| AgentEditForm  | 移除 maxTokens/temperature 字段；新增英文 ID 输入（创建时，校验唯一）；头像选择后拷贝到 agent 目录 |
| SessionList    | agent 不存在时显示"已移除"                                                                         |

### 渲染进程 Store

- `useAgentStore`：数据源从 DB 改为文件扫描结果，对外接口不变

## UI 创建 Agent 流程

1. 用户输入中文名（name）+ 英文 ID
2. 校验 ID 格式（`/^[a-z][a-z0-9-]*$/`）+ 唯一性（目录不存在）
3. 选择 MBTI、配置工具/技能
4. 可选：选择头像图片
5. 确认创建 →
   - 创建 `~/.slime/slime-market/agents/<id>/` 目录
   - 写入 `AGENT.json`
   - 写入 `PROMPT.md`（可为空）
   - 拷贝头像到 `avatar.{ext}`

## 更新机制

手动 `git pull`。后续迭代考虑应用内触发。

## 不变的部分

- Gateway 全部逻辑
- `agent_sessions`/`agent_messages`/`agent_session_configs` 表结构
- AgentChatPresenter 对话引擎核心
- MCP 系统
- Schedule/Task 系统
- Evolution 系统

## slime-market 仓库初始化

从 Slime 迁移：

- `src/main/agents/moss-ai/config.json` → `agents/moss-ai/AGENT.json`（字段精简）
- `src/main/agents/moss-ai/prompt.md` → `agents/moss-ai/PROMPT.md`
- moss-ai 头像 → `agents/moss-ai/avatar.png`
- 相关 skill → `skills/slime-task-manage/SKILL.md`

## 首次使用引导

Slime 启动时检测 `~/.slime/slime-market/` 不存在：

- Agent 列表只显示 hal-ai
- AgentPanel 提示用户 clone 仓库获取更多 Agent
