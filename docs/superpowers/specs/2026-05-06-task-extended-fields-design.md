# 任务扩展字段设计：创建人、归属人、定时、循环

## 概述

为 tasks 表新增四组字段，支持三种任务类型：普通任务、定时任务（一次性）、定时循环任务。支持区分创建人（用户/Agent）和归属人（用户/Agent/暂无）。

## 任务类型

| 类型 | scheduled_at | repeat_interval |
|------|-------------|-----------------|
| 普通任务 | null | null |
| 定时任务（一次性） | 有值 | null/0 |
| 定时循环任务 | 有值 | >0 |

## 数据库变更

### 新增字段（ALTER TABLE tasks）

```sql
ALTER TABLE tasks ADD COLUMN creator_type TEXT NOT NULL DEFAULT 'user';
ALTER TABLE tasks ADD COLUMN creator_id TEXT;
ALTER TABLE tasks ADD COLUMN assignee_type TEXT NOT NULL DEFAULT 'user';
ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
ALTER TABLE tasks ADD COLUMN scheduled_at INTEGER;
ALTER TABLE tasks ADD COLUMN repeat_interval INTEGER;
```

### 新增索引

```sql
CREATE INDEX idx_tasks_assignee ON tasks(assignee_type, assignee_id);
CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

### 字段说明

- `creator_type`: 'user' | 'agent'，创建后不可修改
- `creator_id`: 用户 id 或 agent id，创建后不可修改
- `assignee_type`: 'user' | 'agent'，可修改
- `assignee_id`: 用户 id 或 agent id，null 表示暂无归属
- `scheduled_at`: 首次执行时间戳（ms），null 表示普通任务
- `repeat_interval`: 间隔分钟数，null/0 表示不循环

### 迁移策略

已有数据：creator/assignee 默认为 user + 当前用户 id。

## 类型定义变更（schedule.d.ts）

```typescript
export type ActorType = 'user' | 'agent'

export type RepeatPreset = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface Task {
  id: string
  title: string
  detail?: string
  status: TaskStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  creatorType: ActorType
  creatorId?: string
  assigneeType: ActorType
  assigneeId?: string
  scheduledAt?: number
  repeatInterval?: number
}
```

### 预设间隔映射

| 预设 | 分钟数 |
|------|--------|
| none | null |
| hourly | 60 |
| daily | 1440 |
| weekly | 10080 |
| monthly | 43200 |
| custom | 用户输入 |

## API / IPC 变更

### task:createTask

```typescript
createTask(params: {
  title: string
  detail?: string
  creatorType?: ActorType    // 默认 'user'
  creatorId?: string         // 默认当前用户 id
  assigneeType?: ActorType   // 默认 'user'
  assigneeId?: string        // 默认当前用户 id
  scheduledAt?: number
  repeatInterval?: number
})
```

### task:updateTask

新增可更新字段：`assigneeType`, `assigneeId`, `scheduledAt`, `repeatInterval`。

`creatorType` / `creatorId` 创建后不可修改。

### TaskServer HTTP

`POST /tasks` body 增加新字段，`GET /tasks` 返回值包含新字段。

## CLI 变更

```bash
task add <描述> --creator-type <user|agent> --creator-id <id> [--assignee-type <user|agent>] [--assignee-id <id>] [--scheduled-at <timestamp>] [--repeat <minutes>]
```

### 校验规则

- `--creator-type`：必填，仅接受 `user` | `agent`
- `--creator-id`：必填，校验是否为已存在的用户 id 或 agent id
- `--assignee-type`：可选，仅接受 `user` | `agent`
- `--assignee-id`：可选，传入时校验是否存在；留空表示暂无归属
- 校验失败：打印错误信息并退出，不创建任务

## UI 变更

### TaskItem 列表展示

- 归属人标签（头像 + 名称）
- 定时任务：时钟图标 + 执行时间
- 定时循环任务：时钟图标 + 循环图标 + 下次执行时间
- 普通任务：无额外标识

### TaskDetailDialog 编辑扩展

1. **归属人选择器**：下拉列表，选项为"我"+ 所有已注册 Agent（头像+名称）
2. **定时设置区**（可选开关）：
   - 日期时间选择器（首次执行时间，精确到分钟）
   - 循环开关
   - 循环开启后：间隔周期选择器（预设按钮组 + 自定义输入小时/分钟）
   - 预览区：显示接下来三次执行时间（`yyyy/mm/dd HH:MM` 格式）
3. **创建人信息**：只读展示（头像 + 名称 + 类型标签）

### 手动创建默认行为

- 创建人：固定为当前用户
- 归属人：默认为当前用户，可手动切换

## 计算逻辑

### 下次执行时间（纯展示）

```typescript
function getNextExecutions(scheduledAt: number, repeatInterval: number | null, count = 3): number[] {
  if (!scheduledAt) return []
  if (!repeatInterval) return [scheduledAt]
  const now = Date.now()
  const intervalMs = repeatInterval * 60_000
  let next = scheduledAt
  while (next < now) next += intervalMs
  return Array.from({ length: count }, (_, i) => next + i * intervalMs)
}
```

### 归属人数据获取

TaskDetailDialog 打开时调用 `agentConfigPresenter.listAgents()` 获取 Agent 列表，合并当前用户信息组成归属人选项。

### 创建人 ID 来源

- UI 手动创建：从 `configPresenter.get('app.userProfile')` 取用户 id/name
- CLI 创建：显式传入 `--creator-type` + `--creator-id`

## 事件推送

不变，仍用 `TASK_EVENTS.TASKS_CHANGED` 通知刷新，新字段随 Task 对象一起返回。

## 不在本次范围

- 定时触发机制（后续实现）
- 任务到期通知
- 归属人权限控制
