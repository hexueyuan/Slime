# 进化工作流最小闭环设计

## 目标

实现 discuss → coding → apply 三阶段进化闭环 + rollback 回滚能力，验证"软件可以通过 AI Agent 实现自我迭代进化"的核心假设。

最小闭环范围：仅支持 dev 模式（`app.isPackaged === false`），打包模式预留接口不实现。

## 架构总览

```
AgentPresenter.chat()
  ↓
buildSystemPrompt(stage)  ← 根据当前进化阶段注入不同指令
  ↓
Agent Loop (最多128步)
  ├── discuss：ask_user（Quiz/Preview 统一交互面板）
  ├── coding：read/write/edit/exec 自主工作
  └── apply：evolution_complete 触发自动流程
  ↓
EvolutionPresenter              GitPresenter（新实现）
├── stage 状态机 (idle→discuss→coding→applying)
├── CHANGELOG 读写              ├── tag / listTags
├── 进化节点管理                ├── rollbackToRef
└── cancel / rollback           └── getCurrentCommit
```

### 改造点

| 组件 | 变更 |
|------|------|
| WorkflowPresenter → EvolutionPresenter | 管理进化阶段 + CHANGELOG + 节点 |
| workflow_*/step_* 工具 | 删除 |
| 新增 evolution_start/plan/complete 工具 | Agent 进化流程控制 |
| GitPresenter | 从 stub 实现为真实 git 操作 |
| systemPrompt.ts | 阶段感知，不同阶段注入不同行为指令 |
| ask_user 工具 | 改造，对接功能区统一交互面板 |
| QuizRenderer + PreviewRenderer | 合并为统一交互组件 |
| WorkflowPanel（流程 Tab） | 改为显示进化阶段状态 |

## 进化阶段状态机

```
idle ──evolution_start──> discuss ──evolution_plan──> coding ──evolution_complete──> applying ──成功──> idle
  ↑                          |                          |                             |
  └────── cancel() ──────────┴──────────────────────────┘                             |
  ↑                                                                                   |
  └────── 失败，用户取消 ─────────────────────────────────────────────────────────────┘
```

阶段定义：

| 阶段 | 说明 | 进入条件 | 退出条件 |
|------|------|----------|----------|
| idle | 无进化任务 | 初始 / 进化完成 / 取消 / 回滚 | evolution_start |
| discuss | 需求澄清 + 方案确认 | evolution_start 调用 | evolution_plan 调用 |
| coding | Agent 自主修改代码 | evolution_plan 调用 | evolution_complete 调用 |
| applying | 自动执行 apply 流程 | evolution_complete 调用 | apply 成功或失败 |

## Agent 工具设计

### 删除的工具

- workflow_edit / workflow_query / step_query / step_update

### 新增工具

#### evolution_start

开始一次进化，进入 discuss 阶段。

```typescript
evolution_start({
  description: string  // 用户需求描述
})
```

门禁：当前阶段必须为 idle。

#### evolution_plan

提交进化方案，从 discuss 进入 coding 阶段。

```typescript
evolution_plan({
  plan: {
    scope: string[],    // 影响的文件/模块
    changes: string[],  // 具体变更描述
    risks?: string[],   // 风险点
  }
})
```

门禁：当前阶段必须为 discuss。

#### evolution_complete

进化完成，触发 apply 流程。

```typescript
evolution_complete({
  summary: string  // 本次进化摘要
})
```

门禁：当前阶段必须为 coding。
触发 apply 自动流程（CHANGELOG → commit → tag → 提示重启）。

### 改造工具

#### ask_user

改造为对接功能区统一交互面板。

```typescript
ask_user({
  question: string,
  options: Array<{
    label: string,
    value: string,
    recommended?: boolean,
  }>,
  multiple?: boolean,     // 默认 false 单选，true 多选
  html_file?: string,     // 可选，有则在选项上方显示 HTML 预览
})
```

返回值：

```typescript
{
  selected: string | string[],  // 单选 string，多选 string[]
  extra_input?: string,          // 额外输入框内容
}
```

## 各阶段详细设计

### discuss 阶段

**目标**：从用户需求到明确的进化方案。

**Agent 行为**（由 system prompt 引导）：
1. 用 `read` 探索相关代码，理解当前状态
2. 逐个追问澄清歧义（`ask_user` 渲染选择题到功能区）
3. 形成方案后编写 HTML 效果预览（`write` 写 HTML 文件）
4. 用 `ask_user({ html_file: "..." })` 展示预览 + 让用户确认
5. 用户满意 → 调用 `evolution_plan(plan)` 进入 coding

**参考 superpowers brainstorming 模式**：
- 一次一个问题，prefer 选择题
- 增量确认，不一次性 dump
- 先探索代码再提问

**system prompt 指令要点**：
- 角色：产品经理，理解需求，不写代码
- 强调用 ask_user 和 HTML 预览与用户交互
- 禁止在 discuss 阶段修改代码
- 确认方案后必须调用 evolution_plan

### coding 阶段

**目标**：按方案修改代码，确保验证通过。

**Agent 行为**（由 system prompt 引导）：
1. `read` 相关文件，理解当前代码结构
2. `write` / `edit` 按方案逐步修改代码
3. `exec` 运行验证（`pnpm run typecheck && pnpm test && pnpm run lint`）
4. 验证失败 → 自行分析修复，重新验证
5. 全部通过 → 调用 `evolution_complete(summary)`

**用户参与**：不参与，只看结果。

**状态指示**：渲染进程监听 `EVOLUTION_EVENTS.STAGE_CHANGED`，显示"正在执行进化..."。

**失败处理**：
- `evolution_complete` 内部验证失败 → 返回错误信息给 Agent
- Agent 输出错误到对话 → loop 结束
- 用户选择：发消息让 Agent 继续修复 / 点 UI 取消按钮

**system prompt 指令要点**：
- 角色：程序员，按方案修改代码
- 强调修改前先读代码、修改后必须验证
- 不用 ask_user，自主完成
- 验证通过后必须调用 evolution_complete

### apply 阶段（自动流程）

**目标**：版本化 + 提示重启。

由 `evolution_complete` 在代码层自动执行，Agent 不参与：

```
1. 更新 CHANGELOG —— 追加本次进化记录（描述、变更文件、时间等）
2. git add + git commit
3. git tag（tag name 按版本号规则，message 含摘要）
4. 更新 EvolutionPresenter 状态 → idle
5. 推送事件到渲染进程
6. UI 显示"进化完成，重启后生效" + [重启] 按钮
```

打包模式预留：apply 流程中在步骤 3 和 4 之间预留 `if (app.isPackaged)` 分支，后续实现编译打包 + 替换应用逻辑。

**失败处理**：apply 流程任一步骤失败 → 回滚已执行的步骤 → 返回 coding 阶段 → 错误信息返回给 Agent。

**CHANGELOG 格式**（参考 PRD）：

```markdown
## [egg-v0.1-alice.3] - 2026-04-24

### Evolution
- Request: "把进化历史改成可折叠的"
- Status: Success

### Changes
- Added collapsible history list
- Default state: collapsed
- Animation: smooth transition (300ms)

---
```

**版本号规则**：`egg-v0.1-{user}.{seq}`，seq 从 git tag 列表自动递增。

## 统一交互面板（合并 QuizRenderer + PreviewRenderer）

将功能区的 QuizRenderer 和 PreviewRenderer 合并为一个统一组件：

```
┌──────────────────────────────┐
│                              │
│  [HTML 预览区]               │  ← 可选，有 html_file 时显示
│  (iframe sandbox)            │
│                              │
├──────────────────────────────┤
│  问题描述文字                │
│                              │
│  ● 选项 A (推荐)             │  ← options 列表（单选/多选）
│  ○ 选项 B                    │
│  ○ 选项 C                    │
│                              │
│  ┌──────────────────────┐    │  ← 固定的额外输入框
│  │ 补充说明...           │    │
│  └──────────────────────┘    │
│                              │
│  [确认]                      │
└──────────────────────────────┘
```

- 无 html_file → 只渲染问题 + 选项 + 输入框
- 有 html_file → 上方 iframe 预览 + 下方选项 + 输入框
- 额外输入框始终存在
- 选择结果 + 额外输入一起回传给 Agent

## 用户侧操作（EvolutionPresenter IPC 方法）

以下操作由 UI 直接调用，不经过 Agent：

| 方法 | 说明 |
|------|------|
| `getStatus()` | 返回当前阶段、进化信息 |
| `getHistory()` | 从 CHANGELOG 解析进化节点列表 |
| `cancel()` | 取消当前进化，git reset 到进化开始前的 commit |
| `rollback(nodeId)` | 回滚到指定节点的 git_ref，中间节点标记废弃 |
| `restart()` | 重启 dev server（dev 模式） |

## GitPresenter 实现

从 stub 实现为真实 git 操作，使用 `child_process.spawn('git', [...])` 不用 `shell: true`：

| 方法 | git 命令 |
|------|----------|
| `tag(name, message)` | `git tag -a <name> -m <message>` |
| `listTags(pattern?)` | `git tag -l <pattern> --sort=-creatordate` |
| `getCurrentCommit()` | `git rev-parse HEAD` |
| `rollbackToRef(ref)` | `git checkout <ref> -- .` + `git commit` |
| `addAndCommit(message, files?)` | `git add` + `git commit -m` |
| `getChangedFiles(fromRef, toRef?)` | `git diff --name-only <from> <to>` |

## systemPrompt 阶段感知

`buildSystemPrompt(stage)` 根据当前进化阶段拼接不同指令：

- **idle**：通用对话 + 引导用户描述进化需求，识别到进化意图时调用 `evolution_start`
- **discuss**：角色为产品经理，用 ask_user 澄清需求、HTML 预览展示效果、禁止修改代码、确认后调用 evolution_plan
- **coding**：角色为程序员，按方案修改代码、必须验证、不用 ask_user、完成后调用 evolution_complete
- **applying**：无 Agent 行为（自动流程）

基础 prompt（BASE_PROMPT）+ SOUL.md + EVOLUTION.md + 阶段指令拼接。

## 流程 Tab 改造

原 WorkflowPanel 改为显示进化阶段状态：

- idle：显示"等待进化需求"
- discuss：高亮 discuss，显示"需求澄清中"
- coding：高亮 coding，显示"正在执行进化..."
- applying：高亮 applying，显示"正在应用变更..."
- 进化完成：显示"进化完成，重启后生效" + [重启] 按钮

## 不在本次范围

- task_* 子任务工具（coding 阶段细粒度任务管理）
- 打包模式的编译打包 + 应用替换
- 进化历史列表 UI（TASK-008，依赖本次工作完成）
- 进度条展示（ProgressRenderer 保留但本次不集成）
