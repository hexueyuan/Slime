# Research Agents 设计文档

日期：2026-05-09

## 概述

在 `~/.slime/slime-market/agents/` 下新增三个 market agent，配套一个 market skill：

| 角色 | ID | 中文名 | 职责 |
|------|----|--------|------|
| 信息搜集 | `hunter-ai` | 猎手 | 根据关键词从可信源搜集资料，写入本地并维护索引 |
| 信息整理 | `weaver-ai` | 织者 | 读取原始资料，整理为结构清晰的知识文档/调研报告 |
| 幻灯片生成 | `narrator-ai` | 演者 | 基于报告生成 HTML 幻灯片并预览 |
| 百度搜索 | `baidu-search` | — | 用浏览器工具抓取百度搜索前3页结果并下载正文 |

## Session 目录约定

```
~/.slime/sessions/<session_id>/
├── sources/          # 猎手写入：每条资料一个 .md 文件
├── index.md          # 猎手维护：资料索引
├── report.md         # 织者输出：整理报告
└── slides.html       # 演者输出：HTML 幻灯片
```

**session_id 来源：**
- 群聊时：由系统 system-reminder 注入（需修改群聊 system-reminder，追加"当前群聊ID：`<id>`"）
- 单聊时：用户在对话中手动告知目录路径

## Agent：猎手（hunter-ai）

### AGENT.json

```json
{
  "name": "猎手",
  "description": "信息搜集 Agent，根据关键词从多个可信来源搜集资料，保存到本地并生成索引。",
  "mbti": "ISTP",
  "gender": "male",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": [
    "read", "write", "exec", "ask_user", "skill", "web_fetch",
    "browser_navigate", "browser_snapshot", "browser_get_text",
    "browser_click", "browser_type"
  ],
  "enabledSkills": ["baidu-search"],
  "enableThinking": true
}
```

### 行为规范（PROMPT.md）

1. 收到关键词后，根据关键词性质判断适合的来源（技术/代码类 → github-search；生活/消费类 → xiaohongshu-search；通用 → baidu-search），只调用合适的 skill，不滥用无关来源
2. 调用 skill 搜集资料，每条结果存为 `sources/<序号>-<slug>.md`（slug 为标题的小写连字符形式）
3. 全部完成后维护 `index.md`，格式：关键词、搜集时间、来源列表、每条资料的标题+相对路径+一句话摘要
4. 群聊时从 system-reminder 读取群聊 ID 作为 session_id；单聊时等待用户告知目录路径

## Agent：织者（weaver-ai）

### AGENT.json

```json
{
  "name": "织者",
  "description": "信息整理 Agent，根据用户提供的主题和重点，将原始资料整理为结构清晰的知识文档或调研报告。",
  "mbti": "INFJ",
  "gender": "female",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": ["read", "write", "edit", "ask_user", "skill", "preview"],
  "enabledSkills": [],
  "enableThinking": true
}
```

### 行为规范（PROMPT.md）

1. 用户提供主题、重点和资料路径（sources 目录或 index.md）
2. 逐一读取资料，按主题聚类、去重、提炼关键信息
3. 输出 `report.md`，结构：摘要 → 目录 → 各章节正文 → 参考资料列表
4. 写完后用 `preview` 展示报告供用户审阅
5. 群聊时从 system-reminder 读取群聊 ID 确定输出路径；单聊时等待用户告知

## Agent：演者（narrator-ai）

### AGENT.json

```json
{
  "name": "演者",
  "description": "幻灯片生成 Agent，基于整理好的报告生成 HTML 幻灯片并预览展示。",
  "mbti": "ENFP",
  "gender": "female",
  "capabilityRequirements": ["tool_call", "reasoning"],
  "enabledTools": ["read", "write", "ask_user", "skill", "preview"],
  "enabledSkills": [],
  "enableThinking": false
}
```

### 行为规范（PROMPT.md）

1. 用户提供 `report.md` 路径
2. 调用幻灯片生成 skill（用户挂载）生成 `slides.html`
3. 用 `preview` 打开展示
4. 若无幻灯片 skill，告知用户需要先安装对应 skill

## Skill：baidu-search

**路径：** `~/.slime/slime-market/skills/baidu-search/SKILL.md`

### 实现逻辑

1. 用 `browser_navigate` 打开 `https://www.baidu.com/s?wd=<关键词>`
2. 用 `browser_snapshot` / `browser_get_text` 提取当前页搜索结果链接列表
3. 翻页到第2页（`pn=10`）、第3页（`pn=20`），重复提取链接
4. 对所有链接逐一 `browser_navigate` 访问，`browser_get_text` 提取正文
5. 将正文转为 Markdown 格式，写入调用方指定的 `sources/` 目录

## 主进程修改：群聊 system-reminder

在 `GroupChatPresenter` 的 groupContext system-reminder 中追加一行：

```
当前群聊ID：<group_chat_session_id>
```

使 Agent 能从 system-reminder 直接读取 session_id 构造本地路径。

## 文件清单

| 文件 | 说明 |
|------|------|
| `~/.slime/slime-market/agents/hunter-ai/AGENT.json` | 猎手配置 |
| `~/.slime/slime-market/agents/hunter-ai/PROMPT.md` | 猎手行为规范 |
| `~/.slime/slime-market/agents/weaver-ai/AGENT.json` | 织者配置 |
| `~/.slime/slime-market/agents/weaver-ai/PROMPT.md` | 织者行为规范 |
| `~/.slime/slime-market/agents/narrator-ai/AGENT.json` | 演者配置 |
| `~/.slime/slime-market/agents/narrator-ai/PROMPT.md` | 演者行为规范 |
| `~/.slime/slime-market/skills/baidu-search/SKILL.md` | 百度搜索 skill |
| `src/main/presenter/groupChatPresenter.ts` | 追加 group_chat_session_id 到 system-reminder |
