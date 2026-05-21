# AGENTS.md — AI Agent 协作文档

## 项目概述

Slime 是一个自我进化的 Electron 桌面应用。v0.1 (egg) 验证核心假设：软件可以通过 AI Agent 实现自我迭代进化。v0.2 (brave) 引入内置 LLM Gateway，统一多供应商路由、负载均衡、熔断、协议转换和统计。v0.3 (brave) 引入 Agent 对话系统，Chatroom 为默认视图，EvoLab 隐藏。

## 项目结构

- `src/main/`: Electron 主进程
  - `presenter/`: Presenter 单例 + 子 Presenter（通过 `presenter:call` IPC 分发）
  - `db/`: better-sqlite3 数据库（gateway 表：channels, channel*keys, groups*, group_items, api_keys, model_prices, models, relay_logs, stats_hourly, stats_daily；agent 表：agents, agent_sessions, agent_session_configs, agent_messages；mcp 表：mcp_servers, mcp_tools, session_mcp_state；schedule 表：tasks, notes, timeline_entries, attachments；group_chat 表：group_chat_sessions, group_chat_messages）
  - `gateway/`: LLM Gateway 核心（router, balancer, circuit, keypool, relay, server, outbound adapters, inbound handlers, stats, auth）
  - `presenter/agentChat/`: Agent 对话引擎（agentChatPresenter, contextBuilder, compaction, subagentPresenter, tools/subagentTool, agentInvoker, agentInvokerRegistry）
  - `agents/`: Agent 加载（agentLoader.ts 通用加载 + index.ts BUILTIN_AGENTS 注册表），定义文件在 `resources/agents/<id>/AGENT.json` + `PROMPT.md`
  - `skills/`: 全局 Skill 目录（`<name>/manifest.json` + 实现文件）
  - `mcp/`: MCP Client（types, transport/stdio+SSE, mcpClient, healthChecker）
  - `tasks/`: Schedule 任务系统（taskDao, taskServer/Fastify HTTP, attachmentService）
  - `browser/`: 浏览器自动化（browserSession.ts 封装 playwright-core，browserTools.ts 定义 10 个工具）
  - `eventbus.ts`: EventBus 单例（主进程事件 + 渲染进程推送）
  - `utils/`: 工具模块（logger, paths, errors, cliWrapper）
  - `window.ts`: 窗口管理
  - `tray.ts`: macOS 状态栏托盘（隐藏窗口到托盘、左键恢复、右键菜单退出）
  - `index.ts`: 入口，bootstrap 流程
- `src/cli/`: 独立 CLI 工具（不依赖 Electron 运行时，打包为 `resources/slime-cli.js`）
  - `index.ts`: 入口，解析 argv，分发命令
  - `auth.ts`: 解析 SLIME_ROLE/SLIME_USER_ID/SLIME_DATA_DIR，返回 CallerContext
  - `registry.ts`: CommandDef 类型 + canAccess() 鉴权
  - `commands/help.ts`: help 命令（按角色过滤可见命令）
  - `commands/logs.ts`: logs 命令（查看/过滤/清空当日日志）
  - `commands/agent.ts`: agent 命令（list/get）
  - `commands/skill.ts`: skill 命令（list）
  - `commands/config.ts`: config 命令（list/get/set，白名单写保护）
  - `commands/task.ts`: task 命令（add/start/done/cancel/list/get）
  - `commands/user.ts`: user 命令（get）
  - `utils/logReader.ts`: 日志读取/格式化工具
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

## UI 设计系统规范（Codex-style）

Slime 渲染层必须使用统一的 Codex-like 设计语言：深色、低噪声、桌面工具感、清晰层级、克制动效。视觉基准和实施计划已固化：

- 设计规范: `docs/superpowers/specs/2026-05-15-codex-style-ui-system-design.md`
- 视觉样张: `docs/superpowers/prototypes/codex-style-ui-preview.html`
- 实现计划: `docs/superpowers/plans/2026-05-15-codex-style-ui-system.md`

### 全局视觉原则

- 整体风格参考 Codex，但不做像素级复制；优先保持 Slime 自己的 Agent / Gateway / Schedule 产品语义。
- 背景使用近黑主画布 + 半透明左侧栏 + 低对比边框；不要使用大面积紫色、蓝色渐变或装饰性光斑。
- 字体使用系统栈：`Inter`, `SF Pro Text`, `PingFang SC`, `Microsoft YaHei`, `system-ui`, `sans-serif`。
- 中文常规正文保持 13-14px；密集元信息 11-12px；业务页标题按容器控制在 18-24px。
- 紫色只作为焦点、选中、主操作和主指标的 accent，不作为页面底色。
- 所有颜色、边框、半径、阴影优先来自 `src/renderer/src/assets/main.css` 的 semantic tokens；不要在业务组件里散落 raw hex。
- 卡片只用于重复项、弹窗、真正需要框住的工具区；不要卡片套卡片。
- App 内不要做营销式 hero；空状态可以居中，但必须服务实际工作流，例如 composer、创建入口、选择 Agent。
- 图标按钮优先使用 lucide/iconify 图标，并提供 `title` 或 tooltip；不要用文本按钮表达明显有标准图标的工具动作。

### 组件分层与目录

后续新增 UI 必须优先复用共享组件，只有共享组件无法表达明确需求时才新增组件。

- `src/renderer/src/components/ui/`: 基础 UI primitives，不允许导入业务 store。
  - `SlimeButton`: 主按钮、次按钮、幽灵按钮、危险按钮；用于明确命令。
  - `SlimeIconButton`: icon-only 工具按钮；用于刷新、返回、关闭、展开、复制、设置等高频小动作。
  - `SlimeBadge`: 状态、能力标签、元信息胶囊；用于 `healthy`, `retry`, `reasoning`, `tool_call` 等。
  - `SlimeInput`: 搜索、路径、表单输入；支持普通/紧凑密度。
  - `SlimeTextarea`: 多行文本和配置输入；需要稳定尺寸和自动扩展时使用。
  - `SlimeSelect`: 单选/多选下拉框；trigger 宽度跟随父容器，多选 chip 可换行，菜单用 `max-height` 内部滚动。
  - `SlimePanel`: 业务页的低对比面板容器；用于非重复的大块内容区。
  - `SlimeListItem`: 会话、任务、Agent、日志、导航等可选列表行。
  - `SlimeTabs`: 低对比紧凑 tab；用于工具/预览、Gateway tab、Settings tab。
  - `SlimeChecklist`: checkbox / switch 列表；用于 MCP 工具、能力标签、开关配置。
  - `SlimeComposer`: Chat / GroupChat 的统一输入器；支持 toolbar slot、附件、发送/停止、禁用态。
- `src/renderer/src/components/layout/`: 应用壳和页面布局。
  - `AppShell`: 全窗口外壳，负责左侧栏与右侧圆角主画布。
  - `AppSidebarNav`: Codex-like 展开侧栏，包含窗口控制、主导航、项目/会话区、底部设置。
  - `WorkspaceCanvas`: 右侧主画布容器。
  - `SplitWorkspace`: 左/中/右分栏布局，主要用于 Chatroom + FunctionPanel。
  - `PageHeader`: Gateway / Agents / Schedule / Settings 等业务页的紧凑标题和操作区。
- `src/renderer/src/components/slime/`: Slime 业务通用组件，不绑定具体 store。
  - `SlimeAgentCard`: Agent 选择、Agent 管理列表、群聊成员选择。
  - `SlimeProfileCard`: 用户资料、Agent 资料、身份摘要。
  - `SlimeRealtimeChart`: Gateway 实时指标，多指标通过 chips 切换，主图只展示当前指标。
  - `SlimeRankBoard`: Gateway 排名组件，请求量/成功率/延迟/成本排行。
  - `SlimeResourceCard`: Gateway 分组、密钥、渠道等资源卡片；一项资源一张卡，宽度跟随网格，事实指标自适应换行。
  - `SlimeLogCard`: Gateway 日志行，展示状态码、请求摘要、耗时、重试/熔断状态。
  - `SlimeWeekCalendar`: Schedule 顶部周日历，支持左右滑动、日期选择和任务点。
  - `SlimeTaskList`: Schedule 任务列表，支持完成态、优先级、时间和状态 badge。
  - `SlimeTimeline`: Schedule 右侧时间线，展示笔记、任务事件、附件事件。

### 组件使用规则

- 业务组件负责取 store / 调 Presenter；共享 UI 组件只接收 props、slots，向上 emit 事件。
- 表单组件统一使用 `modelValue` / `update:modelValue`；列表和卡片使用 `selected` / `active` 表示选中态。
- 命令按钮使用 `variant` 和 `size` 控制视觉，不在业务组件里重新拼按钮样式。
- 组件库预览必须直接渲染真实 Vue 组件，不能用静态 HTML/CSS 仿制组件效果。预览页只允许提供组件挂载点、fixture 数据和外层演示布局；组件的视觉结构、样式、状态必须来自 `components/ui`、`components/layout`、`components/slime` 中的真实组件。
- 整体布局和组件预览必须在多个 PC 窗口尺寸下检查：标准窗口、最小窗口、全屏参考，以及至少一个不低于 app 最小尺寸的手动调整尺寸。每个尺寸下都必须完整显示应展示的信息，不允许出现非预期换行、重叠、截断/省略/line-clamp、横向滚动条或组件内部滚动条；若做不到，应调整组件密度、信息层级、网格布局或最小尺寸，不得用隐藏信息糊过去。
- 业务页面使用共享组件时只能通过组件 props、slots、`variant`、`size`、`selected`、`modelValue` 等公开模板参数表达内容和状态，不得在页面里复制组件内部 DOM 结构或重写同类视觉样式。组件需要新视觉状态时先扩展共享组件，再更新预览。
- 共享组件默认必须自适应父容器，不允许随意写死宽高。只有图标按钮、头像、switch、checkbox、日历日期格、棋盘格、图表视窗等天然固定形态的元素可以声明固定尺寸；其他组件优先使用 `width: 100%`、`min-width: 0`、`minmax(0, 1fr)`、`auto-fit`、`clamp()`、`min()`、`max()`、`max-width`、`aspect-ratio` 等响应式约束。
- 组件高度应优先由内容自然决定，只用 `min-height` 保证操作目标和视觉密度。资源卡片、列表行、下拉触发器、多选 chip 容器、表单说明等内容增多时可以自然长高，不应通过固定高度造成遮挡、重叠或截断关键操作。
- 组件内部的长文本、路径、模型名、密钥、标签和中英混排内容必须能安全收缩：使用 `min-width: 0` 和布局感知的响应式网格。支持尺寸内的必要标签、数值、badge、操作、路径、模型名和密钥必须完整可读，不得依赖省略、截断、line-clamp 或非预期换行通过评审。
- 滚动边界必须清晰：重复卡片本身不内嵌滚动条，由父页面区域滚动；下拉菜单、日志列表、表格和固定图表视窗等天然有边界的内容可以设置 `max-height` 并在内部滚动。
- 新增组件的预览必须覆盖受限 PC 窗口或响应式网格场景；会出现在侧栏、弹窗、卡片网格中的组件，预览里必须证明信息完整显示，且没有非预期换行、重叠、截断和滚动条。
- 禁用态必须保留布局尺寸，但撤掉行动感：低对比文本、低对比边框、无 hover 强反馈、`disabled` 属性真实生效。
- 危险操作使用 `danger` 语义，不在禁用态保留红色危险暗示；删除、清空、撤销等高风险动作需要明确上下文或确认。
- 多指标图表不要把多条强色线堆在同一张图上；使用指标 chip 切换主图，其他指标显示当前值和趋势。
- Gateway、Agents、Schedule 这类操作页优先使用 `PageHeader + SlimePanel + SlimeListItem/SlimeTabs`，避免独立视觉体系。
- Chatroom / GroupChat 的空状态优先使用居中标题 + `SlimeComposer` + 必要上下文选择，不使用大面积说明文字。
- 周日历、任务列表、Timeline 必须复用 Schedule Kit 组件，保持任务管理页面密度一致。
- 新增业务卡片前先判断是否可由 `SlimePanel`、`SlimeListItem`、`SlimeAgentCard`、`SlimeProfileCard` 组合完成。

### 页面迁移要求

- `App.vue` 应保持薄壳：onboarding、detached window routing、active view selection、shell composition；不要把页面样式逻辑堆回 App。
- `ChatroomPanel` / `GroupChatPanel` 保留现有 store 和 IPC 行为，只替换外观和共享组件。
- Gateway 页面迁移时注意已有性能优化改动；不得 revert 非本任务改动。
- Settings 和 FunctionPanel 只做视觉统一，不改变设置 key、MCP 工具状态、tool call 选择和 preview 渲染契约。

### 验证要求

- 视觉系统相关变更完成后必须运行 `pnpm run format` 和 `pnpm run lint`。
- 触及共享组件、Chatroom、GroupChat、Schedule、Gateway 时，至少运行相关 renderer 测试和 `pnpm run typecheck:web`。
- 前端测试优先覆盖行为契约，例如 composer Enter 提交、Shift+Enter 换行、禁用态不提交、checklist toggle、周日历切换事件；不要只断言 class 名。
- 有明显视觉改动时，启动应用或本地预览并截图检查桌面宽屏下的 Chatroom、Gateway、Agents、Schedule、Settings。

## 测试要求

- 框架: Vitest + jsdom + Vue Test Utils
- 测试位置: `test/main/**` 和 `test/renderer/**`
- 命名: `*.test.ts` / `*.spec.ts`
- 覆盖率: `pnpm run test:coverage`
- **重要规则**: 每一次代码变更都必须确保所有测试通过。若变更删除或废弃某些功能，必须同步删除或更新对应测试；若变更新增功能或行为，必须同步新增或更新测试覆盖该行为。不得以“已有测试失败”为理由忽略本次变更引入的回归，除非已明确记录失败测试、根因和与本次变更无关的证据。
- **测试价值规则**: 优先编写覆盖用户可见契约、跨模块边界、数据持久化、协议转换、错误处理和核心业务流程的测试。避免新增只验证组件能 mount、静态文案存在、CSS class、图标、简单 emit、mock 函数被调用、Pinia 初始值或内部实现细节的低价值测试；这类测试通常维护成本高、回归信号弱，只有在它们代表明确的产品契约或历史高风险回归时才保留。
- **前端测试规则**: Renderer 单测应尽量覆盖真实交互结果和状态变化，例如用户操作后可见内容、可访问入口、IPC/Presenter 契约、关键 store 行为。不要为了提高数量而给每个展示组件补“显示正确内容/按钮/入口”的快照式或浅层断言。
- **合并精简规则**: 当多个 case 断言同一行为的轻微变体时，优先合并为一个覆盖 good case 与 bad case 的契约测试；当更高层级的集成测试已经覆盖同一风险时，删除重复的低层实现细节测试。

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

| Presenter                 | 职责                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AppPresenter              | 应用信息                                                                                                                                                                                                          |
| ConfigPresenter           | 配置持久化                                                                                                                                                                                                        |
| SessionPresenter          | 会话/消息管理                                                                                                                                                                                                     |
| FilePresenter             | 文件读写+目录列表（resolveSafe 路径安全）                                                                                                                                                                         |
| GitPresenter              | Git 操作（spawn，tag/commit/rollback/diff）                                                                                                                                                                       |
| AgentPresenter            | AI 对话、工具调用、阶段感知 systemPrompt；通过 Gateway 本地代理调用 LLM                                                                                                                                           |
| ToolPresenter             | 19 built-in tools（read/write/edit/exec/ask*user/preview + 3 evolution + 9 browser*_ + web*fetch）+ MCP tools 动态合并；browser*_ 基于 playwright-core + 系统 Chrome（auto-detect）；web_fetch 基于 Node.js fetch |
| EvolutionPresenter        | 进化状态机（idle→discuss→coding→applying）+ CHANGELOG + apply(打包+自替换) + archive CRUD + AI 语义回滚 + build verification                                                                                      |
| ContentPresenter          | 内容预览管理（Interaction/MD/Progress/HTML）                                                                                                                                                                      |
| WorkspacePresenter        | 源码工作区初始化                                                                                                                                                                                                  |
| GatewayPresenter          | LLM Gateway 生命周期管理：供应商/分组/API Key/价格/模型 CRUD、Router/Balancer/Circuit/Server init/destroy、Capability 选择、内部密钥                                                                              |
| AgentConfigPresenter      | Agent CRUD（listAgents/create/update/delete）+ 头像管理（pickAvatar/getAvatarUrl/cleanup）                                                                                                                        |
| AgentChatPresenterAdapter | Agent 会话 CRUD + 对话控制（委托 AgentChatPresenter 引擎）                                                                                                                                                        |
| MCPServerPresenter        | MCP Server 生命周期管理：连接/发现工具/健康检查/CRUD + 会话工具状态；客户端 Map 管理                                                                                                                              |
| TaskPresenter             | Schedule 任务系统 IPC：task CRUD + 状态流转 + 附件 + timeline + notes；委托 taskDao/taskServer                                                                                                                    |
| DevPresenter              | 开发模式专用：内置 Agent 源码读写（JSON+MD）、Skill 安装/卸载、可用工具/CLI 命令查询                                                                                                                              |
| GroupChatPresenter        | 群聊会话 CRUD + AgentInvoker 调度（@ 指定 / 主持人路由）+ 独立窗口 IPC；委托 groupChatSessionDao/groupChatMessageDao                                                                                              |

### 自研 LLM 客户端

- 位置: `src/main/llm/`，替代 AI SDK v6 依赖
- **核心接口** (`core/types.ts`): `LLMClient.chat(messages, tools, options, signal?)` 返回 `AsyncGenerator<StreamEvent>`
- **StreamEvent 类型**: `text` / `tool_call_start` / `tool_call_delta` / `tool_call_end` / `usage` / `error` / `done`
- **Tool 定义**: `{ description?, parameters: Record<string, unknown> }`（JSON Schema 格式，`parameters` 字段，不是 `inputSchema`）
- **工厂函数**: `createLLMClient(provider, { baseURL, apiKey })` — 目前支持 `"anthropic"` provider
- **AnthropicClient**: 直接 HTTP 调用，SSE 流解析（`sseParser.ts` + `streamParser.ts`），无第三方 SDK 依赖
- **集成**: AgentChatPresenter 通过 `createLLMClient("anthropic", { baseURL: gatewayUrl, apiKey })` 获取客户端

### MCP Client 架构 (v0.4)

- **位置**: `src/main/mcp/`，自研 MCP Client 实现（JSON-RPC 2.0 手工实现，无 `@modelcontextprotocol/sdk` 依赖）
- **传输层** (`transport.ts`): stdio（child_process.spawn + 行分隔 JSON） + SSE HTTP（fetch POST + GET /sse EventSource）
- **MCPClient** (`mcpClient.ts`): 连接生命周期（initialize → initialized notification → tools/list → tools/call），60s 超时，AbortSignal 支持
- **HealthChecker** (`healthChecker.ts`): 每 30s ping（tools/list），指数退避重试（1s → 2s → 4s → ... → max 60s）
- **MCPServerPresenter**: 启动时加载所有 enabled Server + 逐一 connect + 发现工具写入 mcp_tools 表；CRUD + 会话工具状态管理
- **MCPToolBridge**: Agent（config.mcpTools 白名单） + 会话级（session_mcp_state）工具过滤，`getMcpTools(sessionId)` → `Record<name, Tool>`
- **工具命名**: `mcp_{sanitized_server_name}_{tool_name}`（如 `mcp_github_search_issues`），ToolPresenter.callTool 按 `mcp_` 前缀路由
- **ToolPresenter 集成**: `getToolSet(sessionId)` → `{ ...builtinTools, ...mcpTools }`，AgentChatPresenter 零感知
- **数据库**: 3 张新表（mcp_servers, mcp_tools, session_mcp_state），联动删除（ON DELETE CASCADE + AgentConfigPresenter 检测 mcpTools 变更清理）
- **UI**: Settings MCP tab（Server CRUD + 状态）+ AgentEditDialog MCP tab（工具勾选）+ 会话 MCP 工具禁用对话框
- **三级配置**: 全局（Server 接入）→ Agent（mcpTools 白名单）→ 会话（session_mcp_state 临时禁用）
- **事件**: `MCP_EVENTS.SERVERS_CHANGED` / `SERVER_STATUS` / `TOOLS_CHANGED` 推送到渲染进程
- **Pinia Store**: `useMcpStore()` 管理 servers/serverTools + session 工具状态

### Evolution Workflow

- 状态机: idle → discuss → coding → applying → idle
- Agent 工具: evolution_start / evolution_plan / evolution_complete(summary + rollback_description)
- 用户操作（IPC）: cancel / rollback:start(AI 语义回滚) / restart(app.relaunch)
- CHANGELOG.slime.md 记录进化节点，tag 格式: `egg-{branch}.{seq}`（branch 为当前 git 分支名）
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
- AddChannelStep: 选择供应商类型（anthropic/openai/gemini/deepseek/volcengine/custom），输入 baseUrl + API Key，testChannel 验证
- CapabilityTagStep: 为供应商模型标记能力标签（reasoning/vision/image_gen/tool_call）
- 完成后写入: `app.userProfile`（含 name/avatar），`app.onboarded`；供应商/分组/Slot 通过 GatewayPresenter 持久化到 SQLite
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
- **Gateway UI**: GatewayPanel（4 tab: 供应商/分组/渠道/日志）+ SettingsDialog Gateway tab（端口/熔断/保留）
- **Pinia Store**: `useGatewayStore()` 管理 channels/groups/apiKeys/stats/logs

### Agent 对话系统 (v0.3)

- **数据层**: 5 张表（agents, agent_sessions, agent_session_configs, agent_messages），整数时间戳（Date.now() ms）
- **Agent**: id=TEXT PK, name, type(builtin/custom), enabled, protected, config_json(AgentConfig), avatar_json(AgentAvatar)
- **双层 Session**: agent_sessions(会话元数据) + agent_session_configs(1:1 LLM 参数)，session_kind(regular/subagent)
- **JSON Block 消息**: assistant content 存为 `AssistantMessageBlock[]` JSON，types: content/reasoning_content/tool_call/error/image
- **AgentChatPresenter**: 核心对话引擎，128-step agentic loop，streamText + tool call + tool execution
- **CHAT_STREAM_EVENTS**: 独立于 evolution 的 STREAM_EVENTS（chat:stream:response/end/error），避免事件冲突
- **SubagentPresenter**: fork-inherit(继承父上下文摘要) / fork-new(干净上下文)，最大深度 1，5 分钟超时
- **AgentConfigPresenter**: Agent CRUD + 头像管理，委托 agentRegistry 管理 agent 列表
- **AgentChatPresenterAdapter**: 封装 session CRUD + 委托 chat 控制给 AgentChatPresenter
- **Context Builder**: token 估算(len/4)，summary 注入，turn history 裁剪，4096 reserve
- **视图切换**: App.vue 五视图（chatroom/groupchat/gateway/agents/evolab），默认 chatroom，EvoLab 隐藏(v-if="false")
- **Pinia Stores**: `useAgentStore` + `useAgentSessionStore` + `useAgentChatStore` + `setupAgentChatIpc`
- **Chat UI**: ChatroomPanel(SessionList + split pane(ChatView + ChatFunctionPanel))、AgentAvatar、ChatInput、ChatMessageList/User/Assistant
- **AgentPanel**: AgentManageTab（内置/用户 Agent 列表 + AgentEditForm 编辑）+ SkillManageTab（Skill 安装/卸载）
- **ChatFunctionPanel**: 工具/预览两 Tab（无历史），与 evolab/FunctionPanel 完全独立；tool_call block 点击高亮，interaction submit 走 agentChatStore.answerQuestion；agent 类型 block 在 ChatroomPanel.toolCallBlocks computed 中转换为 chat 格式再传给 ToolPanel
- **AGENT_EVENTS.CHANGED**: Agent 变更时推送，渲染进程监听刷新列表

### 群聊系统 (brave)

- **数据层**: 2 张独立表（group_chat_sessions, group_chat_messages），与单聊完全隔离
- **AgentInvoker**: per-agent 独立执行单元，fire-and-forget，支持 groupContext（参与者列表 + 行为规则 + 轮次标记）
- **AgentInvokerRegistry**: 注册表单例，管理活跃 invoker，支持 stop 单个/全部
- **GroupChatPresenter**: 会话 CRUD + sendMessage（@ 路由 / 主持人路由）+ detached window IPC
- **主持人路由**: 轻量模型（chat capability）分析用户意图，返回目标 agentId 列表；moderator_enabled 开关
- **独立窗口**: detached BrowserWindow，session init IPC（`group-chat:detached:init`），主窗口 `DETACHED_CLOSED` 事件
- **行为规则注入**: groupContext system-reminder 追加 3 条规则（只回答本轮、只回答自己部分、历史仅作背景）
- **轮次标记**: 历史消息加 `[Round N]` 前缀，用户消息递增 roundIndex，agent 消息跟随当前轮次
- **禁止越界 @**: 多 target 回复时，agent 不能 @mention 其他参与者
- **Pinia Stores**: `useGroupChatSessionStore` + `useGroupChatStore` + `setupGroupChatIpc`
- **Group UI**: GroupChatPanel（GroupSessionList + GroupChatView(GroupMessageList + GroupChatInput)），GroupMessageItem（markdown 渲染 + 头像）
- **GROUP_CHAT_EVENTS**: `SESSION_CREATED/UPDATED/DELETED` + `MESSAGE_CREATED/UPDATED` + `AGENT_TYPING/DONE`

## 安全

- 禁止在代码中硬编码密钥
- 使用 .env 管理敏感配置，.env 不纳入版本控制
- `child_process.spawn()` 禁用 `shell: true`，防止命令注入
