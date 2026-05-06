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
