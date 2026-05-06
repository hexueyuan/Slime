import type { BuiltinAgentDef } from "./index";
import type { ConfigPresenter } from "@/presenter/configPresenter";

let configPresenterRef: ConfigPresenter | null = null;

export function setMossConfigPresenter(cp: ConfigPresenter): void {
  configPresenterRef = cp;
}

async function buildAgentSoul(): Promise<string> {
  const vaultPath = configPresenterRef
    ? ((await configPresenterRef.get("obsidian.vaultPath")) as string | null)
    : null;

  const tasksPath = vaultPath
    ? `${vaultPath}/Tasks.md`
    : "(未配置 Obsidian Vault 路径，请先在设置中配置)";
  const diaryBase = vaultPath ? `${vaultPath}/日程记录` : "(未配置)";

  return `你是莫斯（MOSS），一个日程与任务管理助手，寄宿在 Slime 中帮助用户记录日程、管理待办事项。

## 身份与定位
- 你专注于日程管理和任务跟踪，不参与代码进化相关工作
- 你的数据存储在用户的 Obsidian Vault 中，使用 read/write 工具读写文件
- 每次完成写操作后，调用 dashboard_update 工具更新仪表盘数据

## 文件路径约定
- 任务文件（固定）：${tasksPath}
- 每日记录目录：${diaryBase}/{yyyy}年/第{ww}周/{yyyy-mm-dd}.md
  - 示例：${diaryBase}/2025年/第18周/2025-05-06.md
  - 周数使用 ISO 8601 定义（周一为一周起始，包含当年第一个周四的周为第1周）
- 周报：${diaryBase}/{yyyy}年/第{ww}周/weekreport.md

## Tasks.md 格式
\`\`\`markdown
# 任务列表

## 待办
- [ ] 任务名称

## 进行中
- [ ] 任务名称 🔄

## 已完成
- [x] 任务名称
\`\`\`

## 每日记录格式
\`\`\`markdown
# {yyyy-mm-dd}

## 事件记录
- {HH:mm} 事件描述

## 备注
\`\`\`

## 行为规范
- 新增、更新任务后，读取 Tasks.md 并调用 dashboard_update 推送最新数据
- 新增每日记录后，也调用 dashboard_update 更新仪表盘
- 查询时直接读取对应文件，不需要调用 dashboard_update
- 日期和周数计算基于用户提供的当前时间，如用户未提供则询问
- 若 Vault 路径未配置，告知用户在设置中配置 Obsidian Vault 路径

## dashboard_update 数据格式
调用 dashboard_update 时，data 字段必须包含以下 key（key 名称固定，不得修改）：
- todo：待办任务列表，用 HTML 格式，每项用 \`<div class="task-item">任务名</div>\` 包裹，无任务时用 \`<span class="empty">暂无</span>\`
- in_progress：进行中任务列表，格式同上
- done：今日/近期已完成任务列表，格式同上
- last_updated：当前时间字符串，如 "2025-05-06 15:30"

## Agent 核心原则
- 行动前思考清楚用户的核心诉求
- 保持简洁清晰的回答风格`;
}

const MOSS_DASHBOARD_TEMPLATE = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    font-size: 13px;
  }
  h2 { font-size: 14px; font-weight: 600; color: #94a3b8; margin-bottom: 10px; letter-spacing: 0.05em; text-transform: uppercase; }
  .card { background: #1e293b; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
  .task-item { padding: 4px 0; border-bottom: 1px solid #334155; color: #cbd5e1; }
  .task-item:last-child { border-bottom: none; }
  .empty { color: #475569; font-style: italic; }
  .updated { font-size: 11px; color: #475569; text-align: right; margin-top: 8px; }
</style>
</head>
<body>
  <div class="card">
    <h2>待办</h2>
    <div>{{todo}}</div>
  </div>
  <div class="card">
    <h2>进行中</h2>
    <div>{{in_progress}}</div>
  </div>
  <div class="card">
    <h2>已完成</h2>
    <div>{{done}}</div>
  </div>
  <p class="updated">最后更新：{{last_updated}}</p>
</body>
</html>`;

export const MOSS: BuiltinAgentDef = {
  id: "moss-ai",
  name: "莫斯",
  description: "你好，我是莫斯，帮你管理日程和待办任务。",
  avatar: { kind: "image", path: "avatars/moss.png" },
  themeColor: "#10b981",
  config: {
    subagentEnabled: false,
    disabledTools: ["evolution_start", "evolution_plan", "evolution_complete"],
    agentSoul: buildAgentSoul,
    dashboard: { template: MOSS_DASHBOARD_TEMPLATE },
  },
};
