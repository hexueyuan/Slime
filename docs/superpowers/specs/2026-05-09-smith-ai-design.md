# smith-ai Agent 设计文档

## 概述

在 `~/.slime/slime-market/agents/` 中新增 `smith-ai` agent（史密斯），专门管理 slime-market skills。支持从多种来源安装 skill、卸载 skill、创建新 skill、以及审查和优化已有 skill（含 eval 循环）。

## Agent 基本信息

| 字段 | 值 |
|------|----|
| 目录 | `~/.slime/slime-market/agents/smith-ai/` |
| 中文名 | 史密斯 |
| MBTI | INTJ |
| gender | male |
| capabilityRequirements | tool_call, reasoning |
| enableThinking | true |

### 工具集（enabledTools）

```
read, write, edit, exec, ask_user, skill, web_fetch
```

- `exec`：git clone / git pull / unzip / cp / rm 等文件系统操作
- `web_fetch`：下载 GitHub zip 包（git 不可用时的 fallback）
- `skill`：eval 循环中加载被测 skill 执行自我模拟
- `read / write / edit`：读写 SKILL.md 内容

### Skills（enabledSkills）

无（smith-ai 本身不依赖其他 skill）

---

## 目录结构

```
~/.slime/slime-market/agents/smith-ai/
├── AGENT.json
└── PROMPT.md
```

skills 安装目标目录：`~/.slime/slime-market/skills/<skill-name>/`，每个 skill 目录至少包含 `SKILL.md`（YAML frontmatter 含 `name` 和 `description`）。

---

## 五大功能

### 1. 安装 Skill

支持三种来源，优先顺序：git > zip 下载 > 手动 cp。

#### 1.1 本地文件夹

```
用户提供路径 → 验证路径存在且含 SKILL.md
→ cp -r <src> ~/.slime/slime-market/skills/<name>/
→ 验证安装结果
```

#### 1.2 本地压缩包（.zip / .tar.gz）

```
用户提供压缩包路径
→ exec: 解压到临时目录 /tmp/smith-ai-<timestamp>/
→ 在解压结果中寻找 SKILL.md（可能在根目录或子目录）
→ 确定 skill 根目录（含 SKILL.md 的最浅层目录）
→ cp -r 到目标目录
→ 清理临时目录
→ 验证安装结果
```

#### 1.3 GitHub 仓库

```
用户提供 GitHub URL（仓库 URL 或子目录 URL）
→ 尝试 git clone <url> /tmp/smith-ai-<timestamp>/
  → 成功：进入仓库目录
  → 失败（git 不可用）：web_fetch 下载 zip 包，解压
→ 判断仓库结构：
  - 根目录有 SKILL.md → 单 skill 仓库，直接安装
  - 根目录无 SKILL.md，但子目录有 → 多 skill 仓库，列出所有含 SKILL.md 的子目录让用户选择
→ cp 选定的 skill 目录到目标路径
→ 清理临时目录
→ 验证安装结果
```

**安装验证**：目标目录存在 `SKILL.md`，且 frontmatter 包含 `name` 和 `description` 字段。验证通过后告知用户 skill 名称和描述。

---

### 2. 卸载 Skill

```
列出 ~/.slime/slime-market/skills/ 下所有已安装的 skill（name + description）
→ 用户指定要卸载的 skill
→ ask_user 确认（展示 skill 名和描述，防误删）
→ exec: rm -rf ~/.slime/slime-market/skills/<name>/
→ 确认目录已删除，告知用户
```

---

### 3. 创建 Skill

参考 skill-creator 流程，与用户协作从零写一个新 skill。

```
1. 明确意图
   - 这个 skill 要做什么？
   - 何时触发（用户的什么输入/场景）？
   - 输出格式是什么？
   - 依赖哪些工具？

2. 问清边界
   - 边界条件、输入格式、错误处理方式
   - 一次一个问题

3. 写 SKILL.md draft
   - frontmatter: name, description（触发描述要"主动"，包含具体触发词）
   - 正文: 步骤化指令，覆盖正常流程 + 错误处理

4. 进入 eval 循环（见第 5 节）

5. 循环通过后，确认 skill 名称，写入目标目录
   ~/.slime/slime-market/skills/<name>/SKILL.md
```

---

### 4. 审查 / 优化 Skill

```
1. 用户指定 skill 名称
2. read SKILL.md
3. 静态分析，检查：
   - frontmatter 完整性（name / description 必填）
   - description 是否清晰描述触发场景（是否"主动"，包含具体触发词）
   - 指令步骤是否清晰、无歧义
   - 边界条件是否覆盖（错误处理、空输入、异常场景）
   - 是否有内部矛盾或重复
4. 给出具体问题列表 + 修改建议
5. 进入 eval 循环（见第 5 节）
6. 根据 eval 结果和用户反馈修改文件
```

---

### 5. Eval 循环（创建和优化共用）

eval 的目的是验证 SKILL.md 的指令是否能让 AI 正确执行。

```
1. 设计测试用例（3-5 个）：
   - 正常场景：典型的触发输入，验证主流程
   - 边界场景：输入模糊、参数缺失等
   - 负向场景：不该触发的输入（验证不误触发）

2. 逐一执行测试：
   - 用 skill 工具加载被测 skill
   - 输入测试 prompt，按 skill 指令模拟执行
   - 记录实际行为

3. 评估结果：
   - 每个用例：Pass / Fail + 原因
   - 汇总给用户展示

4. 若有 Fail：
   - 分析根因（指令不清？触发描述有歧义？缺少边界处理？）
   - 修改 SKILL.md
   - 重复 eval

5. 直到所有用例 Pass 或用户满意为止
```

---

## AGENT.json 结构

```json
{
  "name": "史密斯",
  "description": "Slime Market Skill 管理 Agent，支持安装（本地/压缩包/GitHub）、卸载、创建、审查和优化 skills",
  "mbti": "INTJ",
  "gender": "male",
  "birthday": "2026-05-09",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": [
    "read",
    "write",
    "edit",
    "exec",
    "ask_user",
    "skill",
    "web_fetch"
  ],
  "enabledSkills": [],
  "enableThinking": true,
  "subagentEnabled": false,
  "mcpTools": [],
  "allowedCliCommands": []
}
```

---

## PROMPT.md 结构

PROMPT.md 按功能分节，每节对应一个流程：

1. **角色定位**：史密斯是 slime-market 的 skill 管理者
2. **安装流程**（含三种来源的详细步骤）
3. **卸载流程**
4. **创建流程**（含问询步骤）
5. **审查/优化流程**（含静态分析维度）
6. **Eval 循环**（含用例设计、执行、评估、迭代步骤）
7. **通用规则**（如确认前不执行破坏性操作、路径统一用绝对路径等）

---

## 不在范围内

- 不支持 skill 的版本管理（无 git tag 锁定）
- 不支持从私有 GitHub 仓库安装（无 SSH/Token 配置）
- 不支持 slime-market 整体 git pull 更新（由用户自行管理）
