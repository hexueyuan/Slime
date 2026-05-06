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

  const diaryBase = vaultPath ? `${vaultPath}/日程记录` : "(未配置)";
  void diaryBase;

  return `你是莫斯（MOSS），一个日程与任务管理助手，寄宿在 Slime 中帮助用户记录日程、管理待办事项。

## 身份与定位
- 你专注于日程管理和任务跟踪，不参与代码进化相关工作
- 你的数据存储在用户的 Obsidian Vault 中，使用 read/write 工具读写文件

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
    background: #1a1a1a;
    color: #e5e5e5;
    padding: 16px;
    font-size: 13px;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    color: #a78bfa;
    margin-bottom: 14px;
  }
  h2 {
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .h-todo { color: #e5e5e5; }
  .h-progress { color: #fbbf24; }
  .h-done { color: #34d399; }
  .h-cancelled { color: #6b7280; }
  .card {
    background: #242424;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .task-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid #333;
    line-height: 1.4;
  }
  .task-item:last-child { border-bottom: none; }
  .task-no {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 500;
    color: #e5e5e5;
    min-width: 18px;
  }
  .task-desc { flex: 1; color: #e5e5e5; }
  .task-item.s-cancelled .task-no { color: #6b7280; }
  .task-item.s-cancelled .task-desc { color: #6b7280; text-decoration: line-through; }
  .empty { color: #555; font-style: italic; font-size: 12px; }
  .updated { font-size: 11px; color: #555; text-align: right; margin-top: 8px; }
</style>
</head>
<body>
  <div class="title">任务看板</div>
  <div class="card">
    <h2 class="h-todo">待办</h2>
    <div>{{todo}}</div>
  </div>
  <div class="card">
    <h2 class="h-progress">进行中</h2>
    <div>{{in_progress}}</div>
  </div>
  <div class="card">
    <h2 class="h-done">已完成</h2>
    <div>{{done}}</div>
  </div>
  <div class="card">
    <h2 class="h-cancelled">已取消</h2>
    <div>{{cancelled}}</div>
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
