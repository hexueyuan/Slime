# slime-cli agent/skill/config 命令 + 删除 Settings agents tab

日期: 2026-05-08

## 范围

1. `slime-cli agent` 子命令（list / get）
2. `slime-cli skill` 子命令（list）
3. `slime-cli config` 子命令（list / get / set）
4. 删除 Settings 对话框中的 agents tab

## HTTP 接口扩展（taskServer）

在现有 Fastify taskServer（端口 `SLIME_TASK_PORT`）上新增 6 个路由：

| 方法 | 路径           | 说明                               |
| ---- | -------------- | ---------------------------------- |
| GET  | `/agents`      | 列出全部 agent（builtin + market） |
| GET  | `/agents/:id`  | 获取指定 agent 详情                |
| GET  | `/skills`      | 列出全部 skill（builtin + market） |
| GET  | `/config`      | 列出全部 config key-value          |
| GET  | `/config/:key` | 查询单个 key                       |
| PUT  | `/config/:key` | 修改单个 key（白名单限制）         |

**数据来源：**

- agents → `agentRegistry.list()` / `agentRegistry.getById(id)`；`GET /agents/:id` 响应额外注入 `mbtiDescription`（从 `MBTI_PROFILES` 取）
- skills → 独立扫描两个目录：`paths.builtinSkillsDir`（source: "builtin"）和 `paths.marketSkillsDir`（source: "market"）；不复用 `skills/loader.ts` 的 source 字段
- config → `GET /config` 返回完整 JSON 对象；`GET /config/:key` 单 key 查询；`PUT /config/:key` 调用 `ConfigPresenter.set`

**config 写入白名单：**

- `obsidian.vaultPath`
- `gateway.port`

其余 key 的 PUT 请求返回 403。

## CLI 命令

### slime-cli agent

```
用法: slime-cli agent <subcommand>

子命令:
  list          列出全部 agent
  get <id>      查看指定 agent 详情

list 输出格式（每行一个）:
  [id] name (builtin|market) MBTI

get 输出格式:
  name: <名字>
  mbti: <类型> — <性格描述>
  description: <描述>
```

`allowedRoles: ["user", "builtin-agent"]`

### slime-cli skill

```
用法: slime-cli skill <subcommand>

子命令:
  list          列出全部 skill

list 输出格式（每行一个）:
  name (builtin|market) - description
```

`allowedRoles: ["user", "builtin-agent"]`

### slime-cli config

```
用法: slime-cli config <subcommand>

子命令:
  list              列出全部 key=value
  get <key>         查询单个 key
  set <key> <value> 修改 key（仅白名单 key）

可写入的 key:
  obsidian.vaultPath
  gateway.port
```

`allowedRoles: ["user", "builtin-agent"]`

## 删除 Settings agents tab

- 删除 `src/renderer/src/components/settings/SettingsDialog.vue` 中的 `agents` tab 项及对应面板
- 删除 `src/renderer/src/components/settings/AgentSettings.vue` 文件
- agent 管理功能由侧边栏 `AgentPanel`（AgentManageTab + SkillManageTab）完全覆盖

## 涉及文件

**新增：**

- `src/cli/commands/agent.ts`
- `src/cli/commands/skill.ts`
- `src/cli/commands/config.ts`

**修改：**

- `src/cli/index.ts` — 注册三个新命令
- `src/main/tasks/taskServer.ts` — 新增 6 个路由

**删除：**

- `src/renderer/src/components/settings/AgentSettings.vue`

**修改（删除 tab）：**

- `src/renderer/src/components/settings/SettingsDialog.vue`
