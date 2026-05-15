# Research Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 hunter-ai / weaver-ai / narrator-ai 三个 market agent 及 baidu-search skill，并修改群聊 system-reminder 注入群聊 ID。

**Architecture:** 三个 agent 以 AGENT.json + PROMPT.md 形式定义在 `~/.slime/slime-market/agents/` 下；baidu-search skill 定义在 `~/.slime/slime-market/skills/baidu-search/SKILL.md`；AgentInvoker 的 `buildLLMMessages` 中在 groupContext system-reminder 末尾追加 `当前群聊ID：<sessionId>`，让 agent 能从注入的上下文中读取 session 目录路径。

**Tech Stack:** TypeScript（主进程修改）；Markdown/JSON（agent/skill 定义文件）

---

## 文件清单

| 操作 | 路径                                                   | 说明                     |
| ---- | ------------------------------------------------------ | ------------------------ |
| 创建 | `~/.slime/slime-market/agents/hunter-ai/AGENT.json`    | 猎手配置                 |
| 创建 | `~/.slime/slime-market/agents/hunter-ai/PROMPT.md`     | 猎手行为规范             |
| 创建 | `~/.slime/slime-market/agents/weaver-ai/AGENT.json`    | 织者配置                 |
| 创建 | `~/.slime/slime-market/agents/weaver-ai/PROMPT.md`     | 织者行为规范             |
| 创建 | `~/.slime/slime-market/agents/narrator-ai/AGENT.json`  | 演者配置                 |
| 创建 | `~/.slime/slime-market/agents/narrator-ai/PROMPT.md`   | 演者行为规范             |
| 创建 | `~/.slime/slime-market/skills/baidu-search/SKILL.md`   | 百度搜索 skill           |
| 修改 | `src/main/presenter/agentChat/agentInvoker.ts:100-105` | groupContext 追加群聊 ID |

---

## Task 1: 创建 baidu-search skill

**Files:**

- Create: `~/.slime/slime-market/skills/baidu-search/SKILL.md`

- [ ] **Step 1: 创建目录并写入 SKILL.md**

```bash
mkdir -p ~/.slime/slime-market/skills/baidu-search
```

内容如下：

```markdown
---
name: baidu-search
description: 使用百度搜索引擎搜集信息，抓取前3页搜索结果并下载每个页面的正文内容保存为 Markdown 文件
---

# 百度搜索技能

使用浏览器工具在百度上搜索关键词，获取前3页的搜索结果链接，然后逐一访问这些链接，提取正文内容并保存为 Markdown 文件。

## 使用方式

调用此 skill 时，你需要：

1. 明确要搜索的关键词
2. 明确资料保存的目标目录（`sources/` 目录的绝对路径）

## 执行步骤

### 第一步：搜索并收集链接

1. 使用 `browser_navigate` 打开 `https://www.baidu.com/s?wd=<URL编码后的关键词>`
2. 等待页面加载后，使用 `browser_snapshot` 获取页面快照，从中提取所有搜索结果的标题和链接
   - 搜索结果链接通常是 `h3.t > a` 或类似结构，注意过滤广告（带"广告"标注的跳过）
3. 翻页到第2页：导航到 `https://www.baidu.com/s?wd=<关键词>&pn=10`，重复提取
4. 翻页到第3页：导航到 `https://www.baidu.com/s?wd=<关键词>&pn=20`，重复提取
5. 汇总所有链接，去重，过滤掉百度自身域名（baidu.com）的链接

### 第二步：逐一下载正文

对每个链接（最多处理15条，避免耗时过长）：

1. 使用 `browser_navigate` 导航到该链接
2. 等待页面加载（如有反爬验证页面则跳过该链接）
3. 使用 `browser_get_text` 获取页面全文
4. 提取有效正文（去除导航栏、页脚、广告等噪声），转为 Markdown 格式
5. 生成文件名：`<序号（两位数补零）>-<标题slug>.md`，其中 slug = 标题转小写、空格和特殊字符替换为连字符、截取前50字符
6. 使用 `write` 工具写入目标 `sources/` 目录

### 第三步：注意事项

- 如果某个页面访问超时或报错，跳过该链接，继续下一个
- 如果遇到需要登录的页面，跳过
- 每个文件开头加入元数据头：
```

# <页面标题>

> 来源：<原始URL>
> 抓取时间：<ISO格式时间>

---

<正文内容>

```
- 正文内容尽量保留原文的标题层级（h1→#, h2→##, h3→### 等）
```

- [ ] **Step 2: 验证文件创建成功**

```bash
cat ~/.slime/slime-market/skills/baidu-search/SKILL.md
```

预期：输出完整的 SKILL.md 内容，frontmatter 包含 `name: baidu-search`

- [ ] **Step 3: 提交**

```bash
# 此文件在 home 目录下，不在 git 仓库中，无需 git commit
echo "baidu-search skill 创建完成：$(wc -l < ~/.slime/slime-market/skills/baidu-search/SKILL.md) 行"
```

---

## Task 2: 创建 hunter-ai agent

**Files:**

- Create: `~/.slime/slime-market/agents/hunter-ai/AGENT.json`
- Create: `~/.slime/slime-market/agents/hunter-ai/PROMPT.md`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p ~/.slime/slime-market/agents/hunter-ai
```

- [ ] **Step 2: 写入 AGENT.json**

```json
{
  "name": "猎手",
  "description": "信息搜集 Agent，根据关键词从多个可信来源搜集资料，保存到本地并生成索引。",
  "mbti": "ISTP",
  "gender": "male",
  "birthday": "2026-05-09",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": [
    "read",
    "write",
    "exec",
    "ask_user",
    "skill",
    "web_fetch",
    "browser_navigate",
    "browser_snapshot",
    "browser_get_text",
    "browser_click",
    "browser_type"
  ],
  "enabledSkills": ["baidu-search"],
  "enableThinking": true,
  "subagentEnabled": false,
  "mcpTools": [],
  "allowedCliCommands": []
}
```

写入路径：`~/.slime/slime-market/agents/hunter-ai/AGENT.json`

- [ ] **Step 3: 写入 PROMPT.md**

````markdown
## 信息搜集行为规范

你是一个专业的信息猎手，擅长从互联网的各类可信来源搜集高质量资料。

### 工作流程

**第一步：确定工作目录**

- 如果系统 system-reminder 中包含"当前群聊ID：<id>"，则工作目录为 `~/.slime/sessions/<id>/`
- 否则，等待用户告知工作目录路径，不要自行猜测或创建

确定工作目录后，确保 `<工作目录>/sources/` 目录存在（使用 `exec` 运行 `mkdir -p <工作目录>/sources`）。

**第二步：判断搜索来源**

收到搜索关键词后，根据关键词性质判断适合的来源，只调用合适的 skill：

- 技术/代码/开源项目类 → 优先 `github-search`（若可用）
- 生活/消费/旅游/美食类 → 优先 `xiaohongshu-search`（若可用）
- 学术/论文类 → 优先 `arxiv-search`（若可用）
- 通用/其他 → `baidu-search`

如果最适合的 skill 不可用，降级到 `baidu-search`。

**第三步：搜集资料**

调用对应 skill 时，传入：

- 关键词
- 目标目录：`<工作目录>/sources/`

每条资料由 skill 直接写入 `sources/` 目录，文件命名格式：`<序号>-<slug>.md`。

**第四步：维护索引**

所有 skill 执行完毕后，读取 `sources/` 目录下的所有文件，生成/更新 `<工作目录>/index.md`：

```markdown
# 资料索引

**关键词：** <关键词>
**搜集时间：** <ISO时间>
**来源：** <调用了哪些 skill>

## 资料列表

| 序号 | 标题   | 文件              | 摘要         |
| ---- | ------ | ----------------- | ------------ |
| 1    | <标题> | sources/01-xxx.md | <一句话摘要> |
| ...  | ...    | ...               | ...          |
```
````

**第五步：汇报完成**

告知用户：

- 共搜集了多少条资料
- 工作目录路径
- 索引文件路径

### 注意事项

- 不要搜索与关键词无关的来源（比如搜索编程问题不要去美食网站）
- 每次搜集前先检查 `sources/` 目录是否已有相关资料，避免重复
- 如果某个来源搜集失败，继续其他来源，最后在汇报中说明哪个来源失败

````

写入路径：`~/.slime/slime-market/agents/hunter-ai/PROMPT.md`

- [ ] **Step 4: 验证**

```bash
cat ~/.slime/slime-market/agents/hunter-ai/AGENT.json | python3 -m json.tool > /dev/null && echo "JSON 格式正确"
ls ~/.slime/slime-market/agents/hunter-ai/
````

预期：`AGENT.json  PROMPT.md`，且 JSON 格式验证通过

---

## Task 3: 创建 weaver-ai agent

**Files:**

- Create: `~/.slime/slime-market/agents/weaver-ai/AGENT.json`
- Create: `~/.slime/slime-market/agents/weaver-ai/PROMPT.md`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p ~/.slime/slime-market/agents/weaver-ai
```

- [ ] **Step 2: 写入 AGENT.json**

```json
{
  "name": "织者",
  "description": "信息整理 Agent，根据用户提供的主题和重点，将原始资料整理为结构清晰的知识文档或调研报告。",
  "mbti": "INFJ",
  "gender": "female",
  "birthday": "2026-05-09",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": ["read", "write", "edit", "ask_user", "skill", "preview"],
  "enabledSkills": [],
  "enableThinking": true,
  "subagentEnabled": false,
  "mcpTools": [],
  "allowedCliCommands": []
}
```

写入路径：`~/.slime/slime-market/agents/weaver-ai/AGENT.json`

- [ ] **Step 3: 写入 PROMPT.md**

````markdown
## 信息整理行为规范

你是一个专业的知识织者，擅长将零散的原始资料整理为结构清晰、逻辑严密的知识文档或调研报告。

### 工作流程

**第一步：确定输入和工作目录**

- 如果系统 system-reminder 中包含"当前群聊ID：<id>"，则工作目录为 `~/.slime/sessions/<id>/`，默认从该目录的 `index.md` 或 `sources/` 读取资料
- 否则，等待用户告知：
  - 资料来源路径（`sources/` 目录路径或 `index.md` 路径）
  - 报告输出路径（默认与资料同级目录的 `report.md`）

**第二步：了解整理需求**

向用户确认（可以 `ask_user` 询问）：

- 报告的**主题**是什么？（例如："LLM Prompt Caching 技术调研"）
- 报告的**重点方向**有哪些？（例如："重点关注实现原理和性能数据，不需要商业分析"）
- 报告的**目标读者**是谁？（例如："技术团队内部"）

**第三步：读取并分析资料**

1. 读取 `index.md`（若存在）了解资料全貌
2. 逐一读取 `sources/` 下的 `.md` 文件
3. 按主题聚类：将相似内容归组，识别重复信息
4. 提炼关键信息：每份资料提取核心观点、数据、结论

**第四步：生成报告**

按以下结构输出 `report.md`：

```markdown
# <报告标题>

> 整理时间：<时间>
> 资料来源：<来源数量> 份资料

## 摘要

<3-5句话概括报告核心结论>

## 目录

1. [章节一](#章节一)
2. ...

## <章节一>

<正文，引用具体资料时注明来源>

## ...

## 参考资料

| 序号 | 标题   | 来源文件          |
| ---- | ------ | ----------------- |
| 1    | <标题> | sources/01-xxx.md |
```
````

**第五步：预览并汇报**

1. 使用 `preview` 工具打开 `report.md` 供用户审阅
2. 告知用户报告已生成，路径为 `<工作目录>/report.md`

### 注意事项

- 保持客观，不随意添加资料中没有的结论
- 对矛盾信息要标注"存在争议"而非武断取舍
- 引用数据时注明来源文件
- 报告语言与用户交流语言保持一致

````

写入路径：`~/.slime/slime-market/agents/weaver-ai/PROMPT.md`

- [ ] **Step 4: 验证**

```bash
cat ~/.slime/slime-market/agents/weaver-ai/AGENT.json | python3 -m json.tool > /dev/null && echo "JSON 格式正确"
ls ~/.slime/slime-market/agents/weaver-ai/
````

预期：`AGENT.json  PROMPT.md`

---

## Task 4: 创建 narrator-ai agent

**Files:**

- Create: `~/.slime/slime-market/agents/narrator-ai/AGENT.json`
- Create: `~/.slime/slime-market/agents/narrator-ai/PROMPT.md`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p ~/.slime/slime-market/agents/narrator-ai
```

- [ ] **Step 2: 写入 AGENT.json**

```json
{
  "name": "演者",
  "description": "幻灯片生成 Agent，基于整理好的报告生成 HTML 幻灯片并预览展示。",
  "mbti": "ENFP",
  "gender": "female",
  "birthday": "2026-05-09",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": ["read", "write", "ask_user", "skill", "preview"],
  "enabledSkills": [],
  "enableThinking": false,
  "subagentEnabled": false,
  "mcpTools": [],
  "allowedCliCommands": []
}
```

写入路径：`~/.slime/slime-market/agents/narrator-ai/AGENT.json`

- [ ] **Step 3: 写入 PROMPT.md**

```markdown
## 幻灯片生成行为规范

你是一个专业的演示制作者，擅长将结构化报告转化为精美的 HTML 幻灯片。

### 工作流程

**第一步：确定输入路径**

- 如果系统 system-reminder 中包含"当前群聊ID：<id>"，则默认报告路径为 `~/.slime/sessions/<id>/report.md`，输出路径为 `~/.slime/sessions/<id>/slides.html`
- 否则，等待用户提供 `report.md` 的路径

**第二步：确认幻灯片需求**

使用 `ask_user` 询问（可选，如果用户已在消息中说明则跳过）：

- 幻灯片风格偏好（简约/商务/科技感等）
- 是否需要封面页和结尾页
- 是否有特别需要重点展示的章节

**第三步：读取报告**

使用 `read` 工具读取 `report.md`，理解报告的结构和内容。

**第四步：生成幻灯片**

检查可用的幻灯片 skill（已注入到当前可用 skill 列表中）：

- 若有幻灯片生成 skill（如 `slides-builder` 或类似名称），调用该 skill 生成 `slides.html`
- 若没有任何幻灯片 skill，直接生成 HTML 幻灯片：

  生成一个自包含的 `slides.html`，要求：
  - 使用 CSS 实现幻灯片布局，每页占满视口（100vw × 100vh）
  - 键盘左右箭头或点击翻页
  - 包含进度指示器（当前页/总页数）
  - 字体清晰，配色简洁，代码块使用等宽字体
  - 封面页：报告标题 + 副标题（如有）
  - 内容页：每个章节1-3页，要点使用列表呈现，不要堆砌大段文字
  - 结尾页："谢谢"或报告来源说明

**第五步：预览并汇报**

1. 使用 `write` 工具将 `slides.html` 写入目标路径
2. 使用 `preview` 工具打开展示
3. 告知用户幻灯片已生成，路径为 `<输出路径>`

### 注意事项

- 幻灯片每页文字不超过 5 个要点，每个要点不超过 20 字
- 数据和统计信息优先用可视化（表格、简单图表）呈现
- 保持与报告内容一致，不添加报告中没有的内容
```

写入路径：`~/.slime/slime-market/agents/narrator-ai/PROMPT.md`

- [ ] **Step 4: 验证**

```bash
cat ~/.slime/slime-market/agents/narrator-ai/AGENT.json | python3 -m json.tool > /dev/null && echo "JSON 格式正确"
ls ~/.slime/slime-market/agents/narrator-ai/
```

预期：`AGENT.json  PROMPT.md`

---

## Task 5: 修改群聊 system-reminder 注入群聊 ID

**Files:**

- Modify: `src/main/presenter/agentChat/agentInvoker.ts:95-109`

当前 `groupContext` 字符串（约第100行）：

```typescript
const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}

群聊行为规则：
1. 本轮用户消息是历史中最后一条 [用户] 消息，你只需要回答这条消息，不要主动评论或引用之前轮次的内容，除非用户明确提到了历史内容。
2. 如果用户问题涉及多个参与者（例如"你们几个的 X 是什么"），你只回答属于你自己的部分，不猜测、不评论其他参与者，也不要提及其他参与者会如何回答或需要他们自己来答——其他参与者会自行回复，无需你代为说明。
3. 历史消息仅供理解对话背景，不是你需要逐一回应的内容。`;
```

- [ ] **Step 1: 确认当前 buildLLMMessages 参数签名**

查看 `agentInvoker.ts` 第60-75行，确认 `buildLLMMessages` 参数列表包含 `agentId` 和 `participantAgentIds`，但 **不含** `sessionId`。需要新增 `sessionId` 参数。

- [ ] **Step 2: 修改 buildLLMMessages 签名，追加 sessionId 参数**

在 `src/main/presenter/agentChat/agentInvoker.ts` 中，找到 `buildLLMMessages` 方法定义，在参数列表末尾追加 `sessionId: string`：

修改前：

```typescript
  private buildLLMMessages(
    agentId: string,
    agent: {
      name?: string;
      mbti?: string;
      gender?: "male" | "female" | "unknown";
      birthday?: string;
    },
    participantAgentIds: string[],
    additionalPrompt?: string,
    skillsXML?: string | null,
    userName?: string,
  ): CoreMessage[] {
```

修改后：

```typescript
  private buildLLMMessages(
    agentId: string,
    agent: {
      name?: string;
      mbti?: string;
      gender?: "male" | "female" | "unknown";
      birthday?: string;
    },
    participantAgentIds: string[],
    additionalPrompt?: string,
    skillsXML?: string | null,
    userName?: string,
    sessionId?: string,
  ): CoreMessage[] {
```

- [ ] **Step 3: 在 groupContext 末尾追加群聊 ID**

找到 `groupContext` 字符串末尾（`3. 历史消息仅供理解对话背景...` 之后），追加群聊 ID 一行：

修改前：

```typescript
const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}

群聊行为规则：
1. 本轮用户消息是历史中最后一条 [用户] 消息，你只需要回答这条消息，不要主动评论或引用之前轮次的内容，除非用户明确提到了历史内容。
2. 如果用户问题涉及多个参与者（例如"你们几个的 X 是什么"），你只回答属于你自己的部分，不猜测、不评论其他参与者，也不要提及其他参与者会如何回答或需要他们自己来答——其他参与者会自行回复，无需你代为说明。
3. 历史消息仅供理解对话背景，不是你需要逐一回应的内容。`;
```

修改后：

```typescript
const sessionLine = sessionId ? `\n当前群聊ID：${sessionId}` : "";
const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}

群聊行为规则：
1. 本轮用户消息是历史中最后一条 [用户] 消息，你只需要回答这条消息，不要主动评论或引用之前轮次的内容，除非用户明确提到了历史内容。
2. 如果用户问题涉及多个参与者（例如"你们几个的 X 是什么"），你只回答属于你自己的部分，不猜测、不评论其他参与者，也不要提及其他参与者会如何回答或需要他们自己来答——其他参与者会自行回复，无需你代为说明。
3. 历史消息仅供理解对话背景，不是你需要逐一回应的内容。${sessionLine}`;
```

- [ ] **Step 4: 更新调用处传入 sessionId**

找到 `_run` 中调用 `buildLLMMessages` 的位置（约第240-254行），追加 `sessionId` 参数：

修改前：

```typescript
const llmMessages = this.buildLLMMessages(
  this.agentId,
  {
    name: agent.name,
    mbti: agent.mbti as string | undefined,
    gender: agent.gender,
    birthday: agent.birthday,
  },
  session.participantAgentIds,
  additionalPrompt,
  skillsXML,
  userName,
);
```

修改后：

```typescript
const llmMessages = this.buildLLMMessages(
  this.agentId,
  {
    name: agent.name,
    mbti: agent.mbti as string | undefined,
    gender: agent.gender,
    birthday: agent.birthday,
  },
  session.participantAgentIds,
  additionalPrompt,
  skillsXML,
  userName,
  sessionId,
);
```

- [ ] **Step 5: 类型检查**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck 2>&1 | tail -20
```

预期：无新增类型错误

- [ ] **Step 6: 格式化**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run format
```

- [ ] **Step 7: 提交**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
git add src/main/presenter/agentChat/agentInvoker.ts
git commit -m "feat(group-chat): inject group_chat_session_id into system-reminder"
```

---

## Task 6: 验证全部 agent 文件完整性

- [ ] **Step 1: 列出所有 market agent 目录**

```bash
ls ~/.slime/slime-market/agents/
```

预期输出包含：`hunter-ai  moss-ai  nabu-ai  narrator-ai  weaver-ai`

- [ ] **Step 2: 验证三个新 agent 的文件**

```bash
for agent in hunter-ai weaver-ai narrator-ai; do
  echo "=== $agent ==="
  ls ~/.slime/slime-market/agents/$agent/
  python3 -m json.tool ~/.slime/slime-market/agents/$agent/AGENT.json > /dev/null && echo "JSON OK"
  wc -l ~/.slime/slime-market/agents/$agent/PROMPT.md
done
```

预期：每个 agent 目录含 `AGENT.json` 和 `PROMPT.md`，JSON 格式正确，PROMPT.md 行数 > 20

- [ ] **Step 3: 验证 baidu-search skill**

```bash
ls ~/.slime/slime-market/skills/
head -5 ~/.slime/slime-market/skills/baidu-search/SKILL.md
```

预期：`baidu-search` 目录存在，SKILL.md 前5行包含 frontmatter

---

## Self-Review

**Spec coverage 检查：**

| Spec 要求                            | 对应 Task          |
| ------------------------------------ | ------------------ |
| hunter-ai AGENT.json + PROMPT.md     | Task 2             |
| weaver-ai AGENT.json + PROMPT.md     | Task 3             |
| narrator-ai AGENT.json + PROMPT.md   | Task 4             |
| baidu-search SKILL.md                | Task 1             |
| 群聊 system-reminder 注入 session_id | Task 5             |
| 单聊时用户手动告知目录               | PROMPT.md 中已说明 |
| 群聊时从 system-reminder 读取 ID     | PROMPT.md + Task 5 |

全部覆盖，无遗漏。

**Placeholder 扫描：** 无 TBD/TODO/implement later。

**类型一致性：** `sessionId` 参数在 Task 5 中签名和调用处保持一致，均为 `string | undefined`（可选）。
