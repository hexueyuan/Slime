# 待办日程侧边栏设计文档

## 概述

为 Slime 新增"日程"视图（AppSidebar 新 tab），提供任务看板、时间线日志、周日历、随笔四个模块的一体化面板。完全替代现有 MOSS Markdown 任务方案，统一使用 SQLite 存储。附件存储复用 Obsidian Vault 的 `_Assets/` 目录。

---

## 布局

左右分栏：

```
┌──────────────────────────────┬───────────────┐
│  左列 (~70%)                  │  右列 (~30%)   │
│  ┌────────────────────────┐  │               │
│  │  周日历 (固定 ~80px)    │  │  时间线       │
│  │  ← 一 二 三 四 五 六 日 →│  │  (全高滚动)  │
│  └────────────────────────┘  │               │
│  ┌────────────────────────┐  │  09:00        │
│  │  任务看板 (flex:1 滚动)  │  │  ┃ 任务A开始 │
│  │                        │  │  10:30        │
│  │  待办（展开）           │  │  ┃ 开会      │
│  │  进行中（展开）         │  │  12:00        │
│  │  已完成（折叠）         │  │  ┃ 随笔:...  │
│  │  已取消（折叠）         │  │  14:00        │
│  │                        │  │  ┃ 编码      │
│  └────────────────────────┘  │               │
│  ┌────────────────────────┐  │               │
│  │  随笔输入 (固定 ~100px) │  │               │
│  └────────────────────────┘  │               │
└──────────────────────────────┴───────────────┘
```

- 左列最小宽度 400px
- 右列默认宽度 280px，分割线可拖拽
- 入口：AppSidebar 新增 `schedule` 按钮（位于 chatroom 和 gateway 之间）

---

## 数据模型

### SQLite 表

#### tasks

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 17位时间戳ID（YYYYMMDDHHmmssSSS） |
| title | TEXT NOT NULL | 任务标题 |
| detail | TEXT | 任务详情（Markdown，支持链接/图片引用） |
| status | TEXT NOT NULL | todo / in_progress / done / cancelled |
| created_at | INTEGER NOT NULL | 创建时间 ms |
| started_at | INTEGER | 开始时间 ms |
| finished_at | INTEGER | 完成/取消时间 ms |

索引：`idx_tasks_status`

#### task_attachments

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 自增 |
| task_id | TEXT NOT NULL FK → tasks.id ON DELETE CASCADE | 关联任务 |
| file_name | TEXT NOT NULL | 原始文件名 |
| file_path | TEXT NOT NULL | 相对于 Vault 根的路径（如 `_Assets/image/xxx.png`） |
| file_type | TEXT NOT NULL | image / doc / video |
| created_at | INTEGER NOT NULL | 添加时间 ms |

#### timeline_entries

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 自增 |
| date | TEXT NOT NULL | 日期 YYYY-MM-DD |
| start_time | TEXT NOT NULL | 开始时间 HH:mm |
| end_time | TEXT | 结束时间 HH:mm（空=时间点事件） |
| content | TEXT NOT NULL | 描述文本 |
| source | TEXT NOT NULL | manual / task_auto / note |
| source_id | TEXT | 关联的 task_id 或 note_id |
| created_at | INTEGER NOT NULL | 创建时间 ms |

索引：`idx_timeline_date`

#### notes

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 自增 |
| content | TEXT NOT NULL | 随笔内容 |
| created_at | INTEGER NOT NULL | 创建时间 ms |

---

## 主进程架构

### 文件结构

```
src/main/tasks/
├── taskDao.ts              — SQLite CRUD（tasks, task_attachments, timeline_entries, notes）
├── attachmentService.ts    — 文件复制到 Vault _Assets/{type}/ + 路径管理
├── taskServer.ts           — 保留 HTTP 接口，底层改为调 taskDao
└── taskPresenter.ts        — IPC 方法 + 事件推送
```

删除：`taskManager.ts`（Markdown 解析逻辑不再需要）

### TaskPresenter IPC 方法

| 方法 | 说明 |
|------|------|
| `getTasks(filter?)` | 按状态筛选任务列表 |
| `createTask(title, detail?)` | 新建任务 |
| `updateTask(id, fields)` | 更新任务（标题/详情/状态） |
| `addAttachment(taskId, filePath)` | 添加附件（复制到 Vault，写入 DB） |
| `removeAttachment(attachmentId)` | 删除附件引用（不删文件） |
| `getTimeline(date)` | 获取某天的时间线条目 |
| `addTimelineEntry(entry)` | 手动添加时间线条目 |
| `updateTimelineEntry(id, fields)` | 更新时间线条目 |
| `removeTimelineEntry(id)` | 删除时间线条目 |
| `getNotes(limit?)` | 获取随笔列表 |
| `addNote(content)` | 添加随笔（同时写入 timeline_entries） |
| `deleteNote(id)` | 删除随笔（同时删关联 timeline entry） |

### TaskServer HTTP（MOSS CLI 用）

保留现有路由，底层改调 taskDao：

```
POST   /tasks              body: { title, detail? }    → taskDao.create()
PATCH  /tasks/:id/start                                → updateStatus + 自动写 timeline
PATCH  /tasks/:id/done                                 → updateStatus + 自动写 timeline
PATCH  /tasks/:id/cancel                               → updateStatus + 自动写 timeline
GET    /tasks              query: ?status=<status>      → taskDao.list()
GET    /tasks/:id                                      → taskDao.get()
```

### 事件推送

| 事件 | 触发时机 |
|------|---------|
| `TASK_EVENTS.TASKS_CHANGED` | 任务 CRUD 后 |
| `TASK_EVENTS.TIMELINE_CHANGED` | 时间线变更（含任务自动写入、随笔归入） |

---

## 渲染进程 UI

### 组件结构

```
src/renderer/src/views/SchedulePanel.vue         — 顶层（左右分栏）
src/renderer/src/components/schedule/
├── WeekCalendar.vue        — 可翻页周视图
├── TaskBoard.vue           — 任务看板容器
├── TaskGroup.vue           — 状态分组（可折叠）
├── TaskItem.vue            — 任务卡片
├── TaskDetailDialog.vue    — 模态对话框（详情/附件）
├── TimelinePanel.vue       — 右列时间线
├── TimelineEntry.vue       — 单条时间线条目
├── NoteInput.vue           — 随笔输入框
└── TimelineAddDialog.vue   — 手动添加时间线条目对话框
```

### Pinia Store

```typescript
// src/renderer/src/stores/schedule.ts
interface ScheduleState {
  selectedDate: string          // YYYY-MM-DD，默认今天
  tasks: Task[]                 // 任务列表
  timeline: TimelineEntry[]     // 当前选中日期的时间线
  notes: Note[]                 // 近期随笔
}
```

### AppSidebar 变更

新增 `schedule` 视图（图标 `calendar-check`），位于 chatroom 和 gateway 之间。

---

## 关键交互

### 日历联动时间线

1. 点击日历某天 → `selectedDate` 更新
2. watch 触发 → `TaskPresenter.getTimeline(date)` 刷新右列
3. 翻页：整周日期更新，`selectedDate` 跳到新周同一星期几（若为当前周则选中今天）

### 任务状态变更 → 自动写时间线

- todo → in_progress：写入 timeline（start_time=当前, content="开始: {title}", source=task_auto）
- in_progress → done/cancelled：找到对应 task_auto 条目填入 end_time；若无则新建

### 随笔提交

1. Enter 或按钮提交
2. 写入 notes 表 + timeline_entries（start_time=当前, source=note, source_id=note.id）
3. 时间线实时更新

### 附件管理

1. 拖拽/粘贴/文件选择器 → 判断类型
2. 复制到 Vault `_Assets/{image|doc|video}/{filename}`（重名加时间戳后缀）
3. 写入 task_attachments（存相对路径）
4. 图片：对话框内预览；其他：文件名+链接

### 时间线重叠

- 按 start_time 排序渲染
- 同时段多条目纵向堆叠
- 颜色区分来源：task_auto（主题色）、manual（灰色）、note（绿色）

---

## MOSS 迁移

### 删除项

- `taskManager.ts`
- `Tasks.md` / `Tasks-dev.md` 方案
- `MOSS_DASHBOARD_TEMPLATE` 仪表盘模板
- `AgentDashboardPanel.vue` 及 dashboard tab
- `dashboardData` 相关 store/IPC/事件代码
- `dashboardProviders` 注册表

### 保留项

- `taskServer.ts`（改底层为 taskDao）
- `task.ts` CLI 命令（适配新字段）
- MOSS Agent 定义（删 dashboard 配置）

### 不做数据迁移

现有 Tasks.md 中的任务不自动导入 SQLite。

### MOSS agentSoul 更新

CLI 操作不变，agentSoul 删除仪表盘描述，补充"任务详情可在日程面板中查看编辑"。

---

## 附件存储

- 路径：Obsidian Vault `_Assets/{type}/` 目录（type = image/doc/video）
- Vault 路径：复用 ConfigPresenter 已有的 vault 配置
- 重名策略：`{原名}-{timestamp}.{ext}`
- 数据库仅存相对路径引用，不存文件内容

---

## 环境隔离

| 维度 | prod | dev |
|------|------|-----|
| HTTP 端口 | 40001 | 40002 |
| 数据库 | 共用主 SQLite（已有 better-sqlite3 实例） | 同左 |
| 判断方式 | `app.isPackaged` | `!app.isPackaged` |
