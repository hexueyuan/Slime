# EvoLab — 进化流程机制

## 概述

用户在 EvoLab 进化实验室中向 Evo 描述进化需求，Evo 分析、规划并执行进化任务。每次进化产生一个可追溯的进化节点，用户可随时回退到任意历史节点。

## 进化流程

```
用户提出需求 → Evo 分析 → 进化规划 → 执行进化 → 用户验证 → 接受/回退
```

### 1. 需求描述

用户用自然语言向 Evo 说明进化要求。Evo 会：

- 解析用户意图，提取关键变更点
- 如有歧义，主动追问澄清
- 评估需求是否符合进化方向（更简单、更易用、更少问题）

### 2. 进化规划

Evo 生成进化方案，包含：

- **变更范围**: 涉及哪些文件和模块
- **变更内容**: 具体做什么修改
- **风险评估**: 可能引入的问题
- **预期效果**: 进化后的改善点

用户确认方案后，Evo 才会执行。

### 3. 执行进化

Evo 按方案逐步执行变更：

- 修改代码
- 运行测试验证
- 格式化和 lint 检查
- 生成进化节点快照

### 4. 用户验证

进化完成后，用户检查结果：

- **接受**: 进化节点被确认，成为正式版本
- **回退**: 撤销本次进化，恢复到之前的节点

## 进化节点

每次成功的进化产生一个节点，记录：

| 字段        | 说明                     |
| ----------- | ------------------------ |
| id          | 节点唯一标识             |
| parent      | 父节点 id                |
| timestamp   | 进化时间                 |
| description | 进化描述（用户需求摘要） |
| changes     | 变更文件列表             |
| git_ref     | 对应的 git commit/tag    |

节点形成一条链式历史，支持任意回退。

## 回退机制

用户对进化效果不满意时，可以回退：

- **AI 语义回滚**: 选择目标进化版本，AI agent 读取进化档案中的语义摘要，智能清理该进化引入的代码变更，保留后续进化的有效修改
- **依赖检测**: 回滚前自动检测后续进化是否修改了相同文件，提醒用户注意
- **归档标记**: 被回滚的进化在档案中标记为 `archived`，在历史面板中半透明展示
- **进化中取消**: 进化进行中取消仍使用 git 快照回滚（`rollbackToRef`），因为此时没有中间 commit 问题

### 进化档案

每次成功进化生成一份结构化档案（`.slime/evolutions/<tag>.json`），包含：

- 版本信息（tag、parentTag、startCommit、endCommit）
- 进化内容（request、summary、plan、changedFiles）
- 回滚指引（semanticSummary：AI 生成的描述如何撤销此进化）
- 状态（active / archived）

档案不纳入 git 版本控制（`.slime/` 在 `.gitignore` 中）。

```
Node-1 → Node-2 → Node-3 (当前)
                     ↓ AI语义回滚 Node-2
Node-1 → Node-2(archived) → Node-3 → Node-4(rollback commit)
```

> 回滚不删除历史节点记录，只将目标节点标记为 archived。归档版本在历史面板中半透明展示。

## 实现机制

### 阶段状态机

```
idle → discuss → coding → applying → idle
```

| 阶段     | 角色     | 可用工具                                            |
| -------- | -------- | --------------------------------------------------- |
| idle     | -        | evolution_start                                     |
| discuss  | 产品经理 | read, ask_user(结构化选项+HTML预览), evolution_plan |
| coding   | 程序员   | read, write, edit, exec, evolution_complete         |
| applying | 自动流程 | -（内部自动: CHANGELOG → commit → tag）             |

### Agent 工具

- `evolution_start(description)` — 开始进化，idle→discuss
- `evolution_plan(scope, changes, risks?)` — 提交计划，discuss→coding
- `evolution_complete(summary, rollback_description)` — 完成进化，coding→applying→idle
- `ask_user(question, options, multiple?, html_file?)` — 结构化提问，渲染到功能面板

### 版本标签

格式: `egg-v0.1-{user}.{seq}`，如 `egg-v0.1-dev.1`

进化记录写入 `CHANGELOG.slime.md`，每个节点包含 tag、日期、请求、摘要、变更文件。

### 用户操作（非 Agent 工具）

- 取消进化 — UI 按钮，重置到 startCommit
- AI 语义回滚 — UI 按钮，通过 `rollback:start` IPC 触发 AI agent 清理代码
- 放弃回滚 — 回滚失败时 UI 按钮，通过 `rollback:abort` 恢复到回滚前状态
- 重启 — 进化完成后 UI 按钮

## 进化约束

- 每次进化只做一件事，避免混合变更
- 进化前必须通过现有测试，确保基线稳定
- 进化后必须通过所有测试，不引入回归
- discuss 阶段禁止修改代码，coding 阶段禁止 ask_user
- 违反进化方向的需求，Evo 会提出警告但不阻止
