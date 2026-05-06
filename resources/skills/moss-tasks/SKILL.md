---
name: moss-tasks
description: 管理待办任务，通过 slime-cli task 命令操作
agentIds:
  - moss-ai
---

# 任务管理

任务通过 `slime-cli task` 命令管理，所有操作都经由 CLI 完成，仪表盘由系统自动更新。

## 命令

- 新增任务：`exec slime-cli task add <任务描述>`
- 开始任务：`exec slime-cli task start <id>`
- 完成任务：`exec slime-cli task done <id>`
- 取消任务：`exec slime-cli task cancel <id>`
- 查询列表：`exec slime-cli task list [--status todo|in_progress|done|cancelled|archived]`
- 查询详情：`exec slime-cli task get <id>`

`list` 不传 `--status` 时返回所有非归档任务。

## 状态流转

```
todo → in_progress（start）→ done（done）
任意状态 → cancelled（cancel）
```

## 说明

- 仪表盘由系统自动更新，无需任何额外操作
- 任务完成或取消超过 7 天后自动归档
