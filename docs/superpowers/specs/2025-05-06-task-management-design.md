# 任务管理模块设计文档

## 概述

为 Slime 增加任务管理核心模块，支持待办/进行中/已完成/已取消/已归档五种状态。底层存储为 Markdown 文件（Tasks.md），通过独立内部 HTTP 服务暴露给 slime-cli，仪表盘数据通过 IPC + 事件推送实现实时同步。moss agent 通过 slime-cli 完成所有任务操作，不直接操作文件。

---

## 数据模型

### Tasks.md 格式

主列表（非归档任务）按创建顺序排列，状态通过 checkbox + emoji 标识，元数据内联在 HTML 注释中：

```markdown
# 任务列表

- [ ] 设计任务管理模块 <!-- id:20250506143022 created:2025-05-06T14:30:22 -->
- [ ] 实现 taskManager 🔄 <!-- id:20250505090000 created:2025-05-05T09:00:00 started:2025-05-06T10:00:00 -->
- [x] 需求分析 ✅ <!-- id:20250504080000 created:2025-05-04T08:00:00 started:2025-05-04T09:00:00 completed:2025-05-05T18:00:00 -->
- [x] 旧方案调研 ❌ <!-- id:20250503120000 created:2025-05-03T12:00:00 cancelledAt:2025-05-04T08:00:00 -->

## 已归档

- [x] 初始化项目 ✅ <!-- id:20250430100000 created:2025-04-30T10:00:00 started:2025-04-30T10:30:00 completed:2025-05-01T12:00:00 archived:2025-05-08T00:00:00 -->
```

### 状态标识规则

| 状态 | checkbox | emoji | 说明 |
|------|----------|-------|------|
| todo | `- [ ]` | 无 | 待办 |
| in_progress | `- [ ]` | 🔄 | 进行中 |
| done | `- [x]` | ✅ | 已完成 |
| cancelled | `- [x]` | ❌ | 已取消 |
| archived | `- [x]` | ✅/❌ | 已归档（保留原状态 emoji） |

### 任务 ID

时间戳格式：`YYYYMMDDHHmmss`，新增任务时取当前时间生成。

### TypeScript 类型

```typescript
interface Task {
  id: string
  description: string
  status: "todo" | "in_progress" | "done" | "cancelled" | "archived"
  createdAt: string       // ISO 8601
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  archivedAt?: string
}
```

### 自动归档规则

- 触发时机：app 启动时、每次 CLI 写操作完成后
- 条件：`done` 或 `cancelled` 状态，且 `completedAt`/`cancelledAt` 距今超过 7 天
- 归档后移至文件末尾 `## 已归档` 分区，按完成/取消时间升序排列

### 文件初始化

Tasks.md 不存在时自动创建：

```markdown
# 任务列表
```

---

## 模块结构

```
src/main/tasks/
├── taskManager.ts       # 纯逻辑层：解析/序列化 Tasks.md、CRUD、归档检查
└── taskServer.ts        # 内部 HTTP 服务（Fastify），路由调用 taskManager

src/main/presenter/
└── taskPresenter.ts     # IPC 桥接：getDashboardData(agentId)、onTasksChanged 回调

src/cli/commands/
└── task.ts              # CLI task 命令，子命令 HTTP 调 taskServer

resources/skills/moss-tasks/
└── SKILL.md             # 更新为 CLI 调用说明，删除文件格式描述
```

### 职责边界

- `taskManager.ts`：只操作文件，不知道 HTTP/IPC 存在
- `taskServer.ts`：只做路由，调 taskManager，写完后调 `onTasksChanged` 回调
- `taskPresenter.ts`：注册 onTasksChanged 回调，收到通知后推送仪表盘更新事件；实现 `getDashboardData(agentId)` IPC
- `task.ts`：解析子命令，HTTP 调 taskServer，格式化输出

---

## 内部 HTTP 服务

### 端口

| 环境 | 端口 | 判断方式 |
|------|------|----------|
| prod（`app.isPackaged`） | `40001` | `app.isPackaged === true` |
| dev | `40002` | `app.isPackaged === false` |

端口通过 `SLIME_TASK_PORT` env 变量注入到 exec 环境，CLI 从该变量读取。

### 路由

```
POST   /tasks              body: { description }         → 新增任务
PATCH  /tasks/:id/start                                  → 待办 → 进行中
PATCH  /tasks/:id/done                                   → 进行中 → 已完成
PATCH  /tasks/:id/cancel                                 → 任意状态 → 已取消
GET    /tasks              query: ?status=<状态>          → 列表查询
GET    /tasks/:id                                        → 单个任务详情
```

### 生命周期

跟随 app 启动/退出，在 `Presenter.init()` 里启动，app 退出时关闭。

---

## CLI 接口

### 子命令

```
slime-cli task add <描述>
slime-cli task start <id>
slime-cli task done <id>
slime-cli task cancel <id>
slime-cli task list [--status todo|in_progress|done|cancelled|archived]
slime-cli task get <id>
```

`list` 不传 `--status` 时返回所有非归档任务（todo + in_progress + done + cancelled）。

### 权限

```typescript
allowedRoles: ["builtin-agent", "external-agent", "user"],
allowedAgents: ["moss-ai"],  // 其他 agent 暂不开放
```

### 输出格式

```
[20250506143022] 设计任务管理模块 [待办] created:2025-05-06T14:30:22
[20250505090000] 实现 taskManager [进行中] created:2025-05-05T09:00:00 started:2025-05-06T10:00:00
```

错误输出：
```
Error: task 20250506143022 not found
Error: task 20250506143022 cannot transition from done to in_progress
```

---

## 仪表盘同步

### dashboardProviders 注册表

位于 `taskPresenter.ts`，后续新增 agent dashboard 时在此注册：

```typescript
const dashboardProviders: Record<string, () => Promise<Record<string, unknown>>> = {
  "moss-ai": () => taskManager.getDashboardData(),
}
```

### IPC 接口

```
taskPresenter.getDashboardData(agentId)  → Record<string, unknown>
taskPresenter.getServerPort()            → number
```

### 同步链路

**会话打开时（主动拉取）：**
```
ChatroomPanel watch(activeSessionId)
  → agent 有 dashboard 配置
  → ipc taskPresenter.getDashboardData(agentId)
  → agentChatStore.setDashboardData(sessionId, data)
  → AgentDashboardPanel 重渲染
```

**CLI 写入后（实时推送）：**
```
slime-cli task <write op>
  → HTTP PATCH/POST /tasks/...
  → taskManager 写 Tasks.md + 自动归档检查
  → onTasksChanged() 回调
  → TaskPresenter 读取最新数据
  → eventBus.sendToRenderer(AGENT_EVENTS.DASHBOARD_UPDATE, { sessionId, data })
  → agentChatStore.setDashboardData(sessionId, data)
  → AgentDashboardPanel 重渲染
```

### activeMossSessionId 获取

TaskPresenter 持有对 AgentSessionStore（主进程侧）的引用，查找当前活跃的 moss-ai 会话 ID，若无活跃会话则不推送。

---

## moss-tasks skill 更新

删除所有文件格式解析说明，改为 CLI 调用指引：

```markdown
任务管理通过 slime-cli task 命令完成：

- 新增任务：exec slime-cli task add <描述>
- 开始任务：exec slime-cli task start <id>
- 完成任务：exec slime-cli task done <id>
- 取消任务：exec slime-cli task cancel <id>
- 查询列表：exec slime-cli task list [--status todo|in_progress|done|cancelled|archived]
- 查询详情：exec slime-cli task get <id>

仪表盘由系统自动更新，无需任何额外操作。
```

moss agentSoul 不涉及任务管理内容。

---

## 环境隔离

| 维度 | prod | dev |
|------|------|-----|
| HTTP 端口 | 40001 | 40002 |
| Tasks.md 路径 | `{vaultPath}/Tasks.md` | `{vaultPath}/Tasks-dev.md` |
| 判断方式 | `app.isPackaged` | `!app.isPackaged` |
