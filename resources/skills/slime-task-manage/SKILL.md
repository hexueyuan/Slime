---
name: slime-task-manage
description: 管理Slime中的待办任务，支持任务创建、更新、取消以及查询
---

# 任务管理

通过 `slime-cli task` 命令管理任务，所有操作都经由slime-cli完成，仪表盘由系统自动更新。
<Important>在执行命令之前，你必须先执行`slime-cli help task`查看任务管理命令的说明</Important>

## 命令

**参考`slime-cli help task`输出**

## 状态流转

```
todo → in_progress（start）→ done（done）
任意状态 → cancelled（cancel）
```

## 说明

- 仪表盘由系统自动更新，无需任何额外操作
- 任务完成或取消超过 7 天后自动归档
