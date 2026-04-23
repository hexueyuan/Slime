# TASK-008 设计文档：进化实验室（Evolution Lab）

## 概述

将 Slime 的聊天区从通用 Chat 升级为 **进化实验室（Evolution Lab）**。AI 通过 tool calling 自主读写 Slime 自身源码、执行命令、管理进化流程，验证 v0.1 核心假设："软件可以通过 AI Agent 实现自我迭代进化"。

## 设计决策

- 对话即进化 — 不需要额外触发按钮，聊天本身就是进化流程
- 借鉴 DeepChat tool 架构 — ToolPresenter 统一入口 + Zod schema 定义 + processStream 循环
- AI 通过 tool calling 与文件系统/Git/流程管理交互
- 操作范围限定 Slime 项目目录
- exec 命令 v0.1 不做权限限制
- 右侧 FunctionPanel 渲染流程步骤状态

## 工具集（8 个）

### 文件/命令工具（4 个）

#### `read`
读取文件内容。

```typescript
z.object({
  path: z.string().describe('文件路径，相对于项目根目录'),
  offset: z.number().int().min(0).optional().describe('起始行号（0-based）'),
  limit: z.number().int().positive().optional().describe('读取行数'),
})
```

返回：文件内容字符串。路径解析相对于 Slime 项目根目录，禁止 `..` 逃逸。

#### `write`
写入/创建文件（完整覆写）。

```typescript
z.object({
  path: z.string().describe('文件路径，相对于项目根目录'),
  content: z.string().describe('文件完整内容'),
})
```

返回：写入结果（成功/失败）。自动创建中间目录。

#### `edit`
查找替换编辑文件。

```typescript
z.object({
  path: z.string().describe('文件路径，相对于项目根目录'),
  old_text: z.string().describe('要替换的原文本（精确匹配）'),
  new_text: z.string().describe('替换后的新文本'),
})
```

返回：替换结果。old_text 必须在文件中唯一匹配，否则报错。

#### `exec`
执行 shell 命令。

```typescript
z.object({
  command: z.string().min(1).describe('要执行的 shell 命令'),
  timeout_ms: z.number().int().positive().optional().default(30000).describe('超时毫秒数'),
})
```

返回：`{ stdout, stderr, exit_code }`。工作目录固定为 Slime 项目根目录。v0.1 不做命令限制。

### 流程管理工具（4 个）

AI 通过这组工具维护一个有序的进化流程图，前端在 FunctionPanel 中渲染。

#### 数据模型

```typescript
interface WorkflowStep {
  id: string              // 步骤唯一标识
  title: string           // 步骤标题
  description?: string    // 步骤描述
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'
}

interface Workflow {
  steps: WorkflowStep[]   // 有序步骤列表
}
```

每个 session 维护一个 Workflow 实例，内存中持有即可（不需要持久化）。

#### `workflow_edit`
创建或覆盖整个流程（overwrite 语义）。

```typescript
z.object({
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
  })).min(1).describe('有序步骤列表'),
})
```

返回：创建的流程。所有步骤初始状态为 `pending`。

#### `workflow_query`
查询完整流程状态。

```typescript
z.object({})  // 无参数
```

返回：完整 Workflow 对象（所有步骤及其当前状态）。

#### `step_query`
查询单个步骤状态。

```typescript
z.object({
  step_id: z.string().describe('步骤 ID'),
})
```

返回：对应 WorkflowStep 对象。

#### `step_update`
更新步骤状态。

```typescript
z.object({
  step_id: z.string().describe('步骤 ID'),
  status: z.enum(['in_progress', 'completed', 'skipped', 'failed']).describe('新状态'),
})
```

返回：更新后的 WorkflowStep。通过 EventBus 推送 `WORKFLOW_EVENTS.STEP_UPDATED` 到渲染进程。

## 架构

### 新增模块

```
src/main/presenter/
  toolPresenter.ts          # ToolPresenter — 工具定义 + 执行入口
  workflowPresenter.ts      # WorkflowPresenter — 流程状态管理

src/shared/types/
  tool.d.ts                 # 工具相关类型（ToolDefinition, ToolCall, ToolResult）
  workflow.d.ts             # 流程相关类型（Workflow, WorkflowStep）

src/renderer/src/
  stores/workflow.ts        # Workflow store — 监听主进程流程事件
  components/function/
    WorkflowPanel.vue       # 流程步骤渲染组件（替换 FunctionPanel 占位内容）
  components/message/
    ToolCallBlock.vue        # 聊天中 tool call 的 pill 式渲染
```

### ToolPresenter

统一的工具管理入口，职责：
1. 定义所有工具的 Zod schema
2. 转换为 AI SDK ToolSet（`tool({ description, parameters: jsonSchema(...) })`）
3. 执行工具调用，路由到对应 handler

```
ToolPresenter
  ├── getToolSet(): ToolSet          # 返回 AI SDK 格式的工具集
  └── callTool(name, args): result   # 执行工具调用
        ├── read/write/edit → FilePresenter
        ├── exec → child_process.exec
        └── workflow_*/step_* → WorkflowPresenter
```

### WorkflowPresenter

进化流程状态管理，职责：
1. 维护每个 session 的 Workflow（内存 Map<sessionId, Workflow>）
2. 提供 CRUD 操作
3. 状态变更时通过 EventBus 推送到渲染进程

### AgentPresenter 改造

在 `streamText()` 调用中注入 tools 和 system prompt：

```typescript
const result = streamText({
  model,
  system: EVOLUTION_LAB_SYSTEM_PROMPT,
  messages,
  tools: toolPresenter.getToolSet(),
  maxSteps: 128,  // 最大 tool call 轮次
  abortSignal,
})
```

使用 Vercel AI SDK 的 `maxSteps` 参数自动处理 tool call 循环（stream → tool_call → execute → result 回填 → 继续），不需要手动实现 processStream 循环。

### 流式事件处理

AgentPresenter 处理 `fullStream` 新增事件类型：
- `tool-call`：AI 发起工具调用，推送到渲染进程渲染 pill 卡片
- `tool-result`：工具执行结果，更新 pill 卡片状态

### FilePresenter 改造

实现真实的文件读写：
- `read(path)`: `fs.readFile`，支持 offset/limit 按行切片
- `write(path, content)`: `fs.writeFile`，自动 `mkdir -p`
- 新增 `edit(path, oldText, newText)`: 精确查找替换
- 路径安全：`path.resolve(projectRoot, userPath)` 后检查是否仍在 projectRoot 下

### 数据流

```
用户输入 → AgentPresenter.chat()
  → streamText({ model, system, messages, tools, maxSteps: 128 })
  → AI 生成文本 → stream:response 推送到渲染进程
  → AI 调用 tool → onStepFinish 中执行工具
    → read/write/edit → FilePresenter
    → exec → child_process.exec
    → workflow_edit/query → WorkflowPresenter
    → step_query/update → WorkflowPresenter → EventBus → 渲染进程
  → tool 结果自动回填给 AI（maxSteps 机制）
  → AI 继续生成 → 循环直到 AI 不再调用 tool
  → stream:end
```

## System Prompt

```
You are Slime Evolution Lab, an AI agent that evolves the Slime application by modifying its own source code.

You have access to tools for reading, writing, and editing files within the Slime project, executing shell commands, and managing evolution workflow steps.

When the user describes a feature or change:
1. Use workflow_edit to create a clear step-by-step plan
2. Update each step's status as you work through them (in_progress → completed/skipped/failed)
3. Read existing code to understand the current state before making changes
4. Use edit for small changes, write for new files or complete rewrites
5. After coding, use exec to run verification commands (pnpm run typecheck, pnpm test, pnpm run lint)
6. Use exec to commit changes with git (git add + git commit)

The project root is the Slime application directory. All file paths are relative to this root.
Keep your workflow steps concise and actionable.
```

## UI 变更

### 侧栏
- 图标改为 DNA 符号（🧬 或 Lucide `dna` 图标）
- 文字改为"进化实验室"

### FunctionPanel → WorkflowPanel
- 空状态：居中显示"在对话中开始进化，流程将在此展示"
- 有流程时：竖向步骤条，每个步骤显示：
  - 状态图标：⏳ pending / 🔄 in_progress / ✅ completed / ⏭ skipped / ❌ failed
  - 步骤标题 + 描述
  - 当前进行中的步骤高亮

### 聊天区 Tool Call 渲染
- 借鉴 DeepChat 的 pill 式卡片
- 折叠态：图标 + 工具名 + 参数摘要（如 `read src/main/index.ts`）
- 展开态：完整参数 + 返回结果
- 状态指示：running(旋转) / success(绿) / error(红)
- workflow/step 工具调用可以不渲染 pill（因为结果已在 FunctionPanel 展示）

## 事件常量新增

```typescript
export const WORKFLOW_EVENTS = {
  UPDATED: 'workflow:updated',        // 整个流程更新（workflow_edit）
  STEP_UPDATED: 'workflow:step-updated', // 单步状态更新
} as const

export const TOOL_EVENTS = {
  CALL_START: 'tool:call-start',      // tool 开始执行
  CALL_END: 'tool:call-end',          // tool 执行完成
} as const
```

## 依赖变更

- 新增 `zod`（工具参数 schema 定义）
- 新增 `simple-git`（GitPresenter 增强，exec 也可以调 git，但 simple-git 提供更好的 API）

注：`simple-git` 可选。v0.1 MVP 可以只通过 exec 调 git CLI，不引入额外依赖。

## 现有模块处理

- **FilePresenter**: 扩展接口，新增 `edit(path, oldText, newText)` 方法，实现真实 fs 读写
- **GitPresenter**: 保留 stub，不扩展。git 操作通过 `exec` 工具调 CLI 完成
- **Evolution Store**: 重命名为 Workflow Store，监听 `WORKFLOW_EVENTS` 驱动 UI

## 不做的事情（v0.1 scope 外）

- MCP 外部工具支持
- 命令权限控制 / 文件写入确认
- ToolOutputGuard（大输出 offload）
- 子代理编排
- Workflow 持久化
- 进化历史回放
- 右侧 FunctionPanel 展示文件内容/diff
