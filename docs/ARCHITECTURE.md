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
│  - Presenter 单例（动态反射分发）              │
│  - EventBus（主进程内部 + 渲染进程推送）       │
│  - 5 个子 Presenter (app/config/agent/       │
│    file/git)                                 │
│  - 单一 IPC 通道: presenter:call             │
└──────────────┬──────────────────────────────┘
               │ IPC (contextIsolation: true)
┌──────────────┴──────────────────────────────┐
│ Preload Script                              │
│  - contextBridge 暴露 window.electron       │
│  - ipcRenderer.invoke / on / removeAll      │
└──────────────┬──────────────────────────────┘
               │ window.electron.ipcRenderer
┌──────────────┴──────────────────────────────┐
│ Renderer Process (Chromium)                  │
│  - Vue 3 应用                                │
│  - Pinia 状态管理 + @pinia/colada           │
│  - usePresenter (ES6 Proxy → IPC)           │
│  - shadcn/vue UI 组件                        │
│  - TailwindCSS 样式                          │
└─────────────────────────────────────────────┘
```

## 目录职责

- `src/main/`: Electron 主进程，Node.js 环境
  - `presenter/`: Presenter 单例 + 子 Presenter（app/config/agent/file/git）
  - `eventbus.ts`: EventBus 单例（主进程事件 + 渲染进程推送）
  - `utils/`: 工具模块（logger, paths, errors）
  - `window.ts`: 窗口创建与管理
  - `index.ts`: 入口，bootstrap 流程
- `src/preload/`: 安全桥接层，暴露 `window.electron.ipcRenderer`
- `src/renderer/`: Vue 3 SPA，用户界面
  - `components/`: UI 组件（chat/ChatPanel, function/FunctionPanel）
  - `composables/`: usePresenter, useIpcQuery, useIpcMutation, useSplitPane
  - `stores/`: Pinia stores (chat, evolution, config)
  - `views/`: 页面组件（EvolutionCenter 左右分栏布局）
  - `utils/`: 工具函数（safeSerialize 等）
- `src/shared/`: 进程间共享的 TypeScript 类型
  - `types/presenters/`: Presenter 接口定义
  - `events.ts`: 事件常量
- `src/shadcn/`: UI 组件库（基于 reka-ui）
- `test/`: 单元测试和集成测试
- `docs/`: 项目文档
- `resources/`: 应用图标等资源
- `build/`: 构建配置资源

## 构建流程

1. `electron-vite build` 分别编译 main/preload/renderer
2. 输出到 `out/` 目录
3. `electron-builder` 打包为 macOS DMG/ZIP
