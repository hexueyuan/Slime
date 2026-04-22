# AGENTS.md — AI Agent 协作文档

## 项目概述

Slime 是一个自我进化的 Electron 桌面应用。v0.1 (egg) 版本验证核心假设：软件可以通过 AI Agent 实现自我迭代进化。

## 项目结构

- `src/main/`: Electron 主进程
- `src/preload/`: 安全 IPC 桥接（contextIsolation 开启）
- `src/renderer/src/`: Vue 3 渲染进程（components/, stores/, views/）
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

- electron-vite 三进程构建（main/preload/renderer）
- contextIsolation: true，所有 IPC 通过 preload 桥接
- 单窗口应用（v0.1 只有"进化中心"一个页面）

## 安全

- 禁止在代码中硬编码密钥
- 使用 .env 管理敏感配置，.env 不纳入版本控制
