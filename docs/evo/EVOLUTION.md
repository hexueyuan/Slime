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

- **回退到上一节点**: 撤销最近一次进化
- **回退到指定节点**: 跳转到任意历史节点，中间节点标记为废弃
- **回退实现**: 基于 git 版本控制，通过 `git_ref` 恢复对应状态

```
Node-1 → Node-2 → Node-3 (当前)
                     ↓ 回退
Node-1 → Node-2 (当前)
```

> 回退不会删除历史节点记录，只改变当前激活节点。废弃的节点仍可重新激活。

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
- `evolution_complete(summary)` — 完成进化，coding→applying→idle
- `ask_user(question, options, multiple?, html_file?)` — 结构化提问，渲染到功能面板

### 版本标签

格式: `egg-v0.1-{user}.{seq}`，如 `egg-v0.1-dev.1`

进化记录写入 `CHANGELOG.slime.md`，每个节点包含 tag、日期、请求、摘要、变更文件。

### 用户操作（非 Agent 工具）

- 取消进化 — UI 按钮，重置到 startCommit
- 按 tag 回滚 — UI 按钮，git checkout + commit
- 重启 — 进化完成后 UI 按钮

## 进化约束

- 每次进化只做一件事，避免混合变更
- 进化前必须通过现有测试，确保基线稳定
- 进化后必须通过所有测试，不引入回归
- discuss 阶段禁止修改代码，coding 阶段禁止 ask_user
- 违反进化方向的需求，Evo 会提出警告但不阻止
