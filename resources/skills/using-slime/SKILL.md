---
name: using-slime
description: Slime 使用手册，让你能够回答用户关于 Slime 的任何使用问题，包括功能介绍、模块说明、以及通过 slime-cli 进行管理操作
---

# 概念层

## Slime 是什么

Slime 是一个基于 Electron 桌面应用，运行在用户本地。核心理念：Agent原生化的个人助理软件。

## 核心模块

### LLM Gateway
本地 HTTP 代理服务，统一管理多个 LLM 供应商（Anthropic、OpenAI、Gemini、DeepSeek、Volcengine 等）。
- **供应商（Channel）**：接入一个 LLM 服务商，配置 baseURL + API Key
- **分组（Group）**：将多个供应商聚合，支持负载均衡和熔断
- **模型能力标签**：reasoning / vision / image_gen / tool_call，用于按需选模型

**可以使用 `slime-cli config` 查询和修改 Gateway 相关配置，通过 `slime-cli help config` 获取命令使用帮助**

### Agent 对话系统
多 Agent 聊天室。每个 Agent 都是一个史莱姆（Slime）形象，有独立的身份、性格（MBTI）、工具权限和提示词。
- **哈尔（hal-ai）**：唯一内置 Agent，负责帮助用户使用 Slime，拥有 Slime 内的最高权限

**可以使用 `slime-cli agent` 查看 Agent 列表和详情，通过 `slime-cli help agent` 获取命令使用帮助**

### Schedule 任务系统
任务管理模块，支持用户和 Agent 协作管理待办事项。可以实现用户自己给自己、用户给 Agent、Agent 给用户以及 Agent 给 Agent 创建待办。
- 任务状态流转：`todo → in_progress → done / cancelled`
- 支持指定创建者、执行者、计划时间、重复间隔

**可以使用 `slime-cli task` 管理任务，通过 `slime-cli help task` 获取命令使用帮助**

### Skill 系统
Agent 可加载的技能包，扩展 Agent 的能力边界。
- **内置 Skill**：随 Slime 打包，位于 `resources/skills/`
- **Market Skill**：从 slime-market 安装，位于 `~/.slime/slime-market/skills/`

**可以使用 `slime-cli skill` 管理 Skill，通过 `slime-cli help skill` 获取命令使用帮助**

## 数据存储

Slime 的数据统一存放在用户数据目录下的 `.slime/` 子目录：

| 路径 | 内容 |
|------|------|
| `{userData}/.slime/config/slime.config.json` | 应用配置 |
| `{userData}/.slime/data/` | 数据库（SQLite） |
| `{userData}/.slime/avatars/` | 自定义头像 |
| `{userData}/logs/slime-YYYY-MM-DD.log` | 每日运行日志 |
| `~/.slime/slime-market/` | slime-market 安装的 Agent/Skill |

`{userData}` 在 macOS 上通常为 `~/Library/Application Support/Slime`。

**可以使用 `slime-cli logs` 查看和管理运行日志，通过 `slime-cli help logs` 获取命令使用帮助**

---

# 操作层：slime-cli 管理工具

`slime-cli` 是 Slime 的命令行管理工具，独立于 Electron 运行。`logs` 命令不需要主进程在线，其余命令需要 Slime 主进程运行中。

## 可用命令

| 命令 | 说明 |
|------|------|
| `logs` | 查看和管理今日运行日志 |
| `agent` | 查看 Agent 列表和详情 |
| `skill` | 查看 Skill 列表 |
| `config` | 查询和修改配置 |
| `task` | 创建和管理待办任务 |

## 权限说明

slime-cli 通过环境变量 `SLIME_ROLE` 识别调用者角色：
- `user`：普通用户，可使用全部上述命令
- `builtin-agent`（哈尔）：内置 Agent，权限高于普通用户
- `external-agent`：受 Agent 配置的 `allowedCliCommands` 白名单限制

## 获取命令帮助

需要了解某个命令的具体用法时，直接调用 CLI 获取实时文档：

```
slime-cli help              # 列出所有可用命令
slime-cli help <command>    # 查看指定命令的详细用法和示例
```

例如：`slime-cli help task` 可获取 task 命令的完整子命令、参数和示例说明。
