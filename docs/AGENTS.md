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
- **注意**: 渲染进程监听事件时，data 在 `args[0]`（preload 已剥离 IpcRendererEvent）

### paths.ts 路径配置

- `projectRoot`: app 资源定位（打包时为 app.asar 上级）
- `effectiveProjectRoot`: 源码操作目录（打包时为 workspace/slime-src，开发时为 cwd）
- FilePresenter 和 ToolPresenter exec 都使用 `effectiveProjectRoot`

### 已实现 Presenter

| Presenter          | 职责                             |
| ------------------ | -------------------------------- |
| AppPresenter       | 应用信息                         |
| ConfigPresenter    | 配置持久化                       |
| SessionPresenter   | 会话/消息管理                    |
| FilePresenter      | 文件读写（resolveSafe 路径安全） |
| GitPresenter       | Git 操作（stub，实际用 exec）    |
| AgentPresenter     | AI 对话、工具调用                |
| ToolPresenter      | 10 tools 定义                    |
| WorkflowPresenter  | 进化流程步骤管理                 |
| ContentPresenter   | 内容预览管理（Quiz/MD/Progress/HTML） |
| WorkspacePresenter | 源码工作区初始化                 |

### AI SDK v6 类型约定

- `tool()` 用 `inputSchema`（不是 `parameters`）
- `ToolCallPart` 用 `input` 字段（不是 `args`）
- `ToolResultPart.output` 必须是 `{ type: "text"|"json", value: ... }`

## 安全

- 禁止在代码中硬编码密钥
- 使用 .env 管理敏感配置，.env 不纳入版本控制
- `child_process.spawn()` 禁用 `shell: true`，防止命令注入
