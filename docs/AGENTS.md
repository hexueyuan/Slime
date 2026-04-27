# AGENTS.md — AI Agent 协作文档

## 项目概述

Slime 是一个自我进化的 Electron 桌面应用。v0.1 (egg) 验证核心假设：软件可以通过 AI Agent 实现自我迭代进化。v0.2 (brave) 引入内置 LLM Gateway，统一多渠道路由、负载均衡、熔断、协议转换和统计。v0.3 (brave) 引入 Agent 对话系统，Chatroom 为默认视图，EvoLab 隐藏。

## 项目结构

- `src/main/`: Electron 主进程
  - `presenter/`: Presenter 单例 + 子 Presenter（通过 `presenter:call` IPC 分发）
  - `db/`: better-sqlite3 数据库（gateway 表：channels, channel*keys, groups*, group_items, api_keys, model_prices, models, relay_logs, stats_hourly, stats_daily；agent 表：agents, agent_sessions, agent_session_configs, agent_messages, agent_usage_stats）
  - `gateway/`: LLM Gateway 核心（router, balancer, circuit, keypool, relay, server, outbound adapters, inbound handlers, stats, auth）
  - `presenter/agentChat/`: Agent 对话引擎（agentChatPresenter, contextBuilder, compaction, subagentPresenter, tools/subagentTool）
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
- 独立 IPC: `recovery:check` / `recovery:continue` / `recovery:abandon` — 启动恢复（检测/继续/放弃未完成进化）
- 独立 IPC: `evolution:retry-package` / `evolution:skip-package` — apply 阶段打包失败后重试或跳过
- **注意**: 渲染进程监听事件时，data 在 `args[0]`（preload 已剥离 IpcRendererEvent）

### paths.ts 路径配置

- `projectRoot`: app 资源定位（打包时为 app.asar 上级）
- `effectiveProjectRoot`: 源码操作目录（打包时为 workspace/slime-src，开发时为 cwd）
- FilePresenter 和 ToolPresenter exec 都使用 `effectiveProjectRoot`

### 已实现 Presenter

| Presenter                 | 职责                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| AppPresenter              | 应用信息                                                                                                                           |
| ConfigPresenter           | 配置持久化                                                                                                                         |
| SessionPresenter          | 会话/消息管理                                                                                                                      |
| FilePresenter             | 文件读写+目录列表（resolveSafe 路径安全）                                                                                          |
| GitPresenter              | Git 操作（spawn，tag/commit/rollback/diff）                                                                                        |
| AgentPresenter            | AI 对话、工具调用、阶段感知 systemPrompt；通过 Gateway 本地代理调用 LLM                                                            |
| ToolPresenter             | 9 tools（read/write/edit/exec/ask_user/open + 3 evolution）                                                                        |
| EvolutionPresenter        | 进化状态机（idle→discuss→coding→applying）+ CHANGELOG + apply(打包+自替换) + archive CRUD + AI 语义回滚 + build verification       |
| ContentPresenter          | 内容预览管理（Interaction/MD/Progress/HTML）                                                                                       |
| WorkspacePresenter        | 源码工作区初始化                                                                                                                   |
| GatewayPresenter          | LLM Gateway 生命周期管理：渠道/分组/API Key/价格/模型 CRUD、Router/Balancer/Circuit/Server init/destroy、Capability 选择、内部密钥 |
| AgentConfigPresenter      | Agent CRUD（listAgents/create/update/delete），ensureBuiltin 创建 HalAI                                                            |
| AgentChatPresenterAdapter | Agent 会话 CRUD + 对话控制（委托 AgentChatPresenter 引擎）                                                                         |

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
- Build verification: `evolution_complete` 工具执行前自动运行 `pnpm run typecheck` + `pnpm run build`，失败返回错误给 Agent 自修复
- Apply 阶段: finalizeEvolution(commit/tag/archive) → applyEvolution() → packaged 模式: runPackage(electron-builder) → selfReplace(detached shell 脚本替换 .app) / dev 模式: reset()
- Apply 进度: `EVOLUTION_EVENTS.APPLY_PROGRESS` 推送 `{ step, message, error? }`，StatusBar 显示进度+错误重试/跳过
- restart: `app.relaunch()` + `app.quit()`，dev/packaged 通用

### State Persistence & Recovery

- `context.json` at `paths.contextFile` (`{userData}/.slime/state/context.json`) stores active evolution state
- Saved on every `setStage()` (non-idle) and `submitPlan()`; cleared on `reset()`
- `restoreState()` called in `Presenter.init()` — restores EvolutionPresenter fields without emitting events
- Recovery IPC: `recovery:check` / `recovery:continue` / `recovery:abandon`
- Renderer shows recovery banner when `evolutionStore.recoveryContext` is set
- discuss recovery: user continues chatting; coding recovery: auto-triggers `agentPresenter.chat()` with hidden resume prompt

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

### Onboarding Wizard

- 条件渲染链: `loading → onboarding → WorkspaceSetup → main layout`
- 判断: `configPresenter.get("app.onboarded")` 为 falsy 显示向导
- 4 步: Welcome → AddChannelStep → CapabilityTagStep → IdentityCompleteStep
- AddChannelStep: 选择渠道类型（anthropic/openai/gemini/deepseek/volcengine/custom），输入 baseUrl + API Key，testChannel 验证
- CapabilityTagStep: 为渠道模型标记能力标签（reasoning/vision/image_gen/tool_call）
- 完成后写入: `evolution.user`, `app.onboarded`；渠道/分组/Slot 通过 GatewayPresenter 持久化到 SQLite
- 组件: `src/renderer/src/components/onboarding/`

### 聊天区 Streaming 状态

- MessageList 底部: isGenerating 时显示紫色细胞膜呼吸动画 + "进化中..."
- MessageToolbar: disabled 时隐藏复制/重试按钮
- isStreaming 传递链: ChatPanel → MessageList → MessageItemAssistant → MessageToolbar

### 文件安全层

- FilePresenter: `FORBIDDEN_WRITE_PATTERNS` 阻止写入 .git/, node_modules/, dist/, .slime/, .secret., .key
- ToolPresenter exec: `EXEC_BLOCKED_PATTERNS` 阻止绝对路径、rm .git/node_modules、curl|sh、wget

### LLM Gateway 架构 (v0.2)

- **数据层**: better-sqlite3 WAL 模式，9 张表（channels, channel*keys, groups*, group_items, api_keys, model_prices, models, relay_logs, stats_hourly, stats_daily）
- **注意**: 分组表名为 `groups_`（避免 SQL 保留字），对外类型名仍为 `Group`
- **Router**: 内存 Map 缓存 group→items 映射，`reload(db)` 刷新，`resolve(model)` 返回 GroupRoute
- **Balancer**: 4 策略（round_robin, random, failover, weighted），`pick(items)` 返回 GroupItem
- **CircuitBreaker**: per-channel 三态（closed/open/half_open），指数退避冷却，`getHealthScore()`
- **KeyPool**: per-channel 多密钥，`selectKey()` 过滤 disabled/429/tripped，`mark429()` 标记限流
- **Outbound Adapters**: 协议转换 InternalRequest → 各厂商格式（Anthropic/OpenAI/Gemini/DeepSeek/Volcengine/Custom）
- **Inbound Handlers**: Fastify HTTP Server，支持 Anthropic Messages API (`/v1/messages`) 和 OpenAI Responses API (`/v1/responses`)
- **Relay**: 完整转发链（router→balancer→circuit→keypool→outbound），retry 逻辑，stats 回调
- **Auth**: Bearer/x-api-key 认证，检查 key 存在+启用+过期
- **Stats**: 内存缓冲 30s flush → relay_logs → 每小时聚合 stats_hourly → 每日聚合 stats_daily，定时清理
- **Capability Selection**: 基于能力的模型选择（ModelType: chat; Capability: reasoning/vision/image_gen/tool_call），`select(requirements)` 按 CapabilityRequirement 匹配 models 表中的注册模型，"chat" 作为特殊分组从 model.type 填充
- **AgentPresenter 集成**: 通过 `createAnthropic({ baseURL: "http://127.0.0.1:{port}/" })` 连接本地 Gateway，selector.select 获取模型名
- **Gateway UI**: GatewayPanel（4 tab: 渠道/分组/接入/日志）+ SettingsDialog Gateway tab（端口/熔断/保留）
- **Pinia Store**: `useGatewayStore()` 管理 channels/groups/apiKeys/stats/logs

### Agent 对话系统 (v0.3)

- **数据层**: 5 张新表（agents, agent_sessions, agent_session_configs, agent_messages, agent_usage_stats），整数时间戳（Date.now() ms）
- **Agent**: id=TEXT PK, name, type(builtin/custom), enabled, protected, config_json(AgentConfig), avatar_json(AgentAvatar)
- **双层 Session**: agent_sessions(会话元数据) + agent_session_configs(1:1 LLM 参数)，session_kind(regular/subagent)
- **JSON Block 消息**: assistant content 存为 `AssistantMessageBlock[]` JSON，types: content/reasoning_content/tool_call/error/image
- **AgentChatPresenter**: 核心对话引擎，128-step agentic loop，streamText + tool call + tool execution
- **CHAT_STREAM_EVENTS**: 独立于 evolution 的 STREAM_EVENTS（chat:stream:response/end/error），避免事件冲突
- **SubagentPresenter**: fork-inherit(继承父上下文摘要) / fork-new(干净上下文)，最大深度 1，5 分钟超时
- **AgentConfigPresenter**: Agent CRUD + ensureBuiltin（HalAI, id='hal-ai', protected, capabilityRequirements=['reasoning']）
- **AgentChatPresenterAdapter**: 封装 session CRUD + 委托 chat 控制给 AgentChatPresenter
- **Context Builder**: token 估算(len/4)，summary 注入，turn history 裁剪，4096 reserve
- **视图切换**: App.vue 三视图（chatroom/gateway/evolab），默认 chatroom，EvoLab 隐藏(v-if="false")
- **Pinia Stores**: `useAgentStore` + `useAgentSessionStore` + `useAgentChatStore` + `setupAgentChatIpc`
- **Chat UI**: ChatroomPanel(SessionList + NewThread/ChatView)、AgentEditDialog、AgentAvatar、ChatInput、ChatMessageList/User/Assistant
- **AGENT_EVENTS.CHANGED**: Agent 变更时推送，渲染进程监听刷新列表

## 安全

- 禁止在代码中硬编码密钥
- 使用 .env 管理敏感配置，.env 不纳入版本控制
- `child_process.spawn()` 禁用 `shell: true`，防止命令注入
