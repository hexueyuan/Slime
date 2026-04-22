# 架构文档

## 技术栈

| 组件     | 技术                        | 版本 |
| -------- | --------------------------- | ---- |
| 桌面框架 | Electron                    | 39+  |
| 前端框架 | Vue 3 + TypeScript          | 3.5+ |
| 构建工具 | electron-vite               | 4+   |
| 包管理   | pnpm                        | 10+  |
| 状态管理 | Pinia                       | 3+   |
| UI 框架  | shadcn/vue + TailwindCSS v4 | -    |
| 测试     | Vitest + Vue Test Utils     | 3+   |
| Lint     | oxlint + oxfmt              | -    |

## 进程架构

```
┌─────────────────────────────────────────────┐
│ Main Process (Node.js)                      │
│  - 应用生命周期管理                           │
│  - BrowserWindow 创建                        │
│  - IPC 通道注册                              │
│  - 文件系统操作                               │
│  - AI Agent 执行环境                          │
└──────────────┬──────────────────────────────┘
               │ IPC (contextIsolation: true)
┌──────────────┴──────────────────────────────┐
│ Preload Script                              │
│  - contextBridge 安全 API 暴露               │
│  - @electron-toolkit/preload                │
└──────────────┬──────────────────────────────┘
               │ Window API
┌──────────────┴──────────────────────────────┐
│ Renderer Process (Chromium)                  │
│  - Vue 3 应用                                │
│  - Pinia 状态管理                            │
│  - shadcn/vue UI 组件                        │
│  - TailwindCSS 样式                          │
└─────────────────────────────────────────────┘
```

## 目录职责

- `src/main/`: Electron 主进程，Node.js 环境
  - `ipc/`: IPC handler 注册（handlers/ 按功能域拆分）
  - `utils/`: 工具模块（logger, paths, errors）
  - `window.ts`: 窗口创建与管理
  - `index.ts`: 入口，bootstrap 流程
- `src/preload/`: 安全桥接层，最小化暴露 API
- `src/renderer/`: Vue 3 SPA，用户界面
- `src/shared/`: 进程间共享的 TypeScript 类型
- `src/shadcn/`: UI 组件库（基于 reka-ui）
- `test/`: 单元测试和集成测试
- `docs/`: 项目文档
- `resources/`: 应用图标等资源
- `build/`: 构建配置资源

## 构建流程

1. `electron-vite build` 分别编译 main/preload/renderer
2. 输出到 `out/` 目录
3. `electron-builder` 打包为 macOS DMG/ZIP
