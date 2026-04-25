# AGENTS.md — AI Agent 协作文档

## 项目概述

Slime 是一个自我进化的 Electron 桌面应用。v0.1 (egg) 版本验证核心假设：软件可以通过 AI Agent 实现自我迭代进化。

## 项目结构

- `src/main/`: Electron 主进程
  - `presenter/`: Presenter 单例 + 子 Presenter（通过 `presenter:call` IPC 分发）
  - `eventbus.ts`: EventBus 单例（主进程事件 + 渲染进程推送）
  - `utils/`: 工具模块（logger, paths, errors）
  - `window.ts`: 窗口管理
  - `index.ts`: 入口，bootstrap 流程
- `src/preload/`: 安全 IPC 桥接（contextIsolation，暴露 `window.electron.ipcRenderer`）
- `src/renderer/src/`: Vue 3 渲染进程（components/, composables/, stores/, views/）
- `src/shared/`: 主进程与渲染进程共享类型
- `src/shadcn/`: shadcn/vue UI 组件库
- `test/`: Vitest 测试（test/main/, test/renderer/）
- `docs/`: 项目文档

## 开发命令

- 安装: `pnpm install`
- 开发: `pnpm run dev`（HMR）
- 预览: `pnpm start`
- 类型检查: `pnpm run typecheck`
- Lint: `pnpm run lint`
- 格式化: `pnpm run format`, `pnpm run format:check`
- 测试: `pnpm test`, `pnpm run test:coverage`, `pnpm run test:watch`
- 构建: `pnpm run build`, `pnpm run build:mac`

完成功能后务必运行 `pnpm run format` 和 `pnpm run lint` 保持代码质量。

## 代码规范

- TypeScript + Vue 3 Composition API；Pinia 状态管理；TailwindCSS 样式
- oxfmt: 单引号，无分号，行宽 100。运行 `pnpm run format`
- oxLint 用于 JS/TS lint
- 命名: Vue 组件 PascalCase；变量/函数 camelCase；类型/类 PascalCase；常量 SCREAMING_SNAKE_CASE

## 测试要求

- 框架: Vitest + jsdom + Vue Test Utils
- 测试位置: `test/main/**` 和 `test/renderer/**`
- 命名: `*.test.ts` / `*.spec.ts`
- 覆盖率: `pnpm run test:coverage`

## 提交规范

- Conventional commits: `type(scope): subject`
- 类型: feat|fix|docs|style|refactor|perf|test|chore
- pre-commit hook 自动运行 lint-staged

## 架构

### IPC 通信模式

- 渲染进程: `usePresenter("xxx").method()` → Proxy → `ipcRenderer.invoke("presenter:call", name, method, args)`
- 主进程: `Presenter.ipcMain.handle` 分发到对应子 Presenter
- 事件推送: `eventBus.sendToRenderer(event, data)` → `win.webContents.send()`
- 独立 IPC: `agent:reset` — 重建 AgentPresenter 实例（重置流程调用）
- 独立 IPC: `rollback:check-deps` / `rollback:start` / `rollback:abort` — AI 语义回滚（跨 Presenter 协调）
- **注意**: 渲染进程监听事件时，data 在 `args[0]`（preload 已剥离 IpcRendererEvent）

### paths.ts 路径配置

- `projectRoot`: app 资源定位（打包时为 app.asar 上级）
- `effectiveProjectRoot`: 源码操作目录（打包时为 workspace/slime-src，开发时为 cwd）
- FilePresenter 和 ToolPresenter exec 都使用 `effectiveProjectRoot`

### 已实现 Presenter

| Presenter          | 职责                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| AppPresenter       | 应用信息                                                                                   |
| ConfigPresenter    | 配置持久化                                                                                 |
| SessionPresenter   | 会话/消息管理                                                                              |
| FilePresenter      | 文件读写+目录列表（resolveSafe 路径安全）                                                  |
| GitPresenter       | Git 操作（spawn，tag/commit/rollback/diff）                                                |
| AgentPresenter     | AI 对话、工具调用、阶段感知 systemPrompt                                                   |
| ToolPresenter      | 9 tools（read/write/edit/exec/ask_user/open + 3 evolution）                                |
| EvolutionPresenter | 进化状态机（idle→discuss→coding→applying）+ CHANGELOG + apply + archive CRUD + AI 语义回滚 |
| ContentPresenter   | 内容预览管理（Interaction/MD/Progress/HTML）                                               |
| WorkspacePresenter | 源码工作区初始化                                                                           |

### AI SDK v6 类型约定

- `tool()` 用 `inputSchema`（不是 `parameters`）
- `ToolCallPart` 用 `input` 字段（不是 `args`）
- `ToolResultPart.output` 必须是 `{ type: "text"|"json", value: ... }`

### Evolution Workflow

- 状态机: idle → discuss → coding → applying → idle
- Agent 工具: evolution_start / evolution_plan / evolution_complete(summary + rollback_description)
- 用户操作（IPC）: cancel / rollback:start(AI 语义回滚) / restart(app.relaunch)
- CHANGELOG.slime.md 记录进化节点，tag 格式: `egg-v0.1-{user}.{seq}`
- 进化档案: `.slime/evolutions/<tag>.json`（EvolutionArchive，不纳入 git）
- 回滚: AI agent 读取档案 semanticSummary 进行语义级代码清理，typecheck 通过后 commit + 标记 archived
- 依赖检测: checkDependencies 计算 changedFiles 交集，回滚前提醒用户
- restart: `app.relaunch()` + `app.quit()`，dev/packaged 通用

### System Prompt 阶段感知

- `buildSystemPrompt(stage)` 根据阶段注入不同指令
- idle: 引导 evolution_start; discuss: PM 角色用 ask_user; coding: 自主编码; applying: 空
- **在 agentic loop 内每轮调用**，确保 stage 变化后 agent 立即感知
- 仍读取 SOUL.md + EVOLUTION.md

### ask_user 交互面板

- ask_user 参数: `question + options[{label,value,recommended?}] + multiple? + html_file?`
- AgentPresenter 构建 InteractionContent(含 sessionId+toolCallId) → contentPresenter → InteractionRenderer
- FunctionPanel 直接调 agentPresenter.answerQuestion（不经 messageStore）

### FunctionPanel 三 Tab 布局

- 工具(tools): ToolPanel 展示工具调用详情
- 预览(preview): ContentDispatcher 渲染 Interaction/MD/Progress/HTML
- 历史(history): HistoryPanel 展示进化版本时间轴 + 回滚操作

### Evolution StatusBar UI

- EvolutionStatusBar 在 EvolutionCenter 顶部横跨全宽，始终显示
- 视觉风格: 生物细胞膜（28px 膜环容器 + 8px 核心圆 + SVG 有机曲线连线 + 粒子流动）
- 节点状态: dormant(空心) / completed(绿色+膜呼吸) / active(紫色+双层膜) / pending(虚线环)
- 完成徽章: 细胞膜圆点+文字，与节点统一风格
- 重置流程: stopGeneration → cancel() → clearMessages → evolutionStore.reset() → agent:reset

### 聊天区 Streaming 状态

- MessageList 底部: isGenerating 时显示紫色细胞膜呼吸动画 + "进化中..."
- MessageToolbar: disabled 时隐藏复制/重试按钮
- isStreaming 传递链: ChatPanel → MessageList → MessageItemAssistant → MessageToolbar

### 文件安全层

- FilePresenter: `FORBIDDEN_WRITE_PATTERNS` 阻止写入 .git/, node_modules/, dist/, .slime/, .secret., .key
- ToolPresenter exec: `EXEC_BLOCKED_PATTERNS` 阻止绝对路径、rm .git/node_modules、curl|sh、wget

## 安全

- 禁止在代码中硬编码密钥
- 使用 .env 管理敏感配置，.env 不纳入版本控制
- `child_process.spawn()` 禁用 `shell: true`，防止命令注入
