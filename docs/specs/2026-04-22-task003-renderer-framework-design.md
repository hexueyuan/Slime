# TASK-003: 搭建渲染进程基础框架 — 设计文档

## 概述

搭建 Vue 3 渲染进程基础架构，采用 deepchat 的 Presenter 模式实现主进程与渲染进程通信，包含 EventBus、Presenter 单例、类型安全的 Proxy 调用、@pinia/colada 查询缓存层、3 个 Pinia store。

**技术决策摘要**：

- 样式：保留已有 TailwindCSS + shadcn/vue（不用 TASK-003 原始设计的 UnoCSS）
- 主题：保留已有 oklch 主题系统（不重建 CSS 变量）
- IPC：完整 Presenter 模式（参考 deepchat），为后续扩展打基础
- Store：chatStore + evolutionStore + configStore

## 1. 整体架构

```
渲染进程 (Vue 3)
  ├── composables/usePresenter.ts    → ES6 Proxy，按名称路由到主进程 Presenter
  ├── composables/useIpcQuery.ts     → 查询缓存层（@pinia/colada）
  ├── composables/useIpcMutation.ts  → 变更层（@pinia/colada）
  ├── stores/                        → chatStore, evolutionStore, configStore
  └── components/                    → UI 组件（TASK-004+ 再添加）

         ↕ IPC: 统一通道 'presenter:call'

主进程
  ├── presenter/index.ts             → Presenter 单例，持有所有子 presenter
  ├── presenter/appPresenter.ts      → app 相关（版本等）
  ├── presenter/configPresenter.ts   → 配置管理
  ├── presenter/agentPresenter.ts    → Agent 对话（stub）
  ├── presenter/filePresenter.ts     → 文件操作（stub）
  ├── presenter/gitPresenter.ts      → Git 操作（stub）
  └── eventbus.ts                    → EventBus（EventEmitter 扩展）

共享层
  └── shared/types/presenters/       → 每个 presenter 的接口类型
```

**核心变化**：

1. 废弃现有 `ipc/handlers/` 结构，迁移到 `presenter/` 模式
2. 统一 IPC 通道：单一 `presenter:call` + 动态反射，不再为每个功能注册单独 channel
3. Preload 简化：暴露 `window.electron.ipcRenderer`，不再逐个封装 channel
4. 端到端类型安全：通过 `IPresenter` 接口 + Proxy 泛型

## 2. 主进程 Presenter 层

### 2.1 EventBus

继承 Node.js `EventEmitter`，全局单例。

```typescript
// src/main/eventbus.ts
class EventBus extends EventEmitter {
  private win?: BrowserWindow;

  setWindow(win: BrowserWindow) {
    this.win = win;
  }

  // 主进程内部事件
  sendToMain(event: string, ...args: unknown[]) {
    this.emit(event, ...args);
  }

  // 推送到渲染进程
  sendToRenderer(event: string, ...args: unknown[]) {
    this.win?.webContents.send(event, ...args);
  }

  // 同时发送
  send(event: string, ...args: unknown[]) {
    this.sendToMain(event, ...args);
    this.sendToRenderer(event, ...args);
  }
}

export const eventBus = new EventBus();
```

注：Slime v0.1 是单窗口应用，不需要 deepchat 的多窗口 SendTarget 机制。直接持有 BrowserWindow 引用即可。后续多窗口时再扩展。

### 2.2 事件常量

```typescript
// src/main/events.ts（同时被 shared/ 引用）
export const CONFIG_EVENTS = {
  CHANGED: "config:changed",
} as const;

export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: "evolution:stage-changed",
  PROGRESS: "evolution:progress",
} as const;

export const CHAT_EVENTS = {
  MESSAGE: "chat:message",
  STREAM_CHUNK: "chat:stream-chunk",
} as const;
```

### 2.3 Presenter 单例

```typescript
// src/main/presenter/index.ts
class Presenter implements IPresenter {
  appPresenter: AppPresenter;
  configPresenter: ConfigPresenter;
  agentPresenter: AgentPresenter;
  filePresenter: FilePresenter;
  gitPresenter: GitPresenter;

  private static instance: Presenter | null = null;

  private constructor() {
    this.appPresenter = new AppPresenter();
    this.configPresenter = new ConfigPresenter();
    this.agentPresenter = new AgentPresenter();
    this.filePresenter = new FilePresenter();
    this.gitPresenter = new GitPresenter();
  }

  static getInstance(): Presenter {
    if (!Presenter.instance) Presenter.instance = new Presenter();
    return Presenter.instance;
  }

  static readonly DISPATCHABLE = new Set<keyof IPresenter>([
    "appPresenter",
    "configPresenter",
    "agentPresenter",
    "filePresenter",
    "gitPresenter",
  ]);

  init() {
    /* 生命周期初始化 */
  }
  async destroy() {
    /* 清理 */
  }
}

// 文件底部：注册统一 IPC handler
ipcMain.handle("presenter:call", (event, name: string, method: string, ...args: unknown[]) => {
  if (!Presenter.DISPATCHABLE.has(name as keyof IPresenter)) {
    throw new Error(`Presenter '${name}' is not dispatchable`);
  }
  const presenter = Presenter.getInstance();
  const target = presenter[name];
  if (typeof target[method] !== "function") {
    throw new Error(`Method '${method}' not found on '${name}'`);
  }
  return target[method](...args);
});
```

### 2.4 子 Presenter

每个子 presenter 是一个 class，实现对应的 `I*Presenter` 接口。沿用现有 handler 的 stub 逻辑，迁移到 class 方法。

- `AppPresenter`：getVersion()
- `ConfigPresenter`：get(key), set(key, value)（stub）
- `AgentPresenter`：chat(params)（stub）
- `FilePresenter`：read(path), write(path, content)（stub）
- `GitPresenter`：tag(name, message)（stub）

### 2.5 现有代码迁移

- `src/main/ipc/` 目录删除
- `src/main/ipc/handlers/*.ts` 的逻辑迁移到 `src/main/presenter/*.ts`
- `src/main/index.ts` 中 `registerAllHandlers()` 替换为 `Presenter.getInstance()` + `eventBus.setWindow(mainWindow)`
- `src/main/utils/` 保留不变（logger, paths, errors）

## 3. Preload 桥接

### 改造前

```typescript
// 当前：逐个封装 channel，暴露 window.slime
contextBridge.exposeInMainWorld('slime', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => { ... },
})
```

### 改造后

```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => listener(...args));
      return () => ipcRenderer.removeListener(channel, listener);
    },
    removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
  },
});
```

### Window 全局类型

```typescript
// src/preload/index.d.ts
interface Window {
  electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      on(channel: string, listener: (...args: unknown[]) => void): () => void;
      removeAllListeners(channel: string): void;
    };
  };
}
```

## 4. 共享类型

### 目录结构

```
src/shared/
├── types/
│   └── presenters/
│       ├── index.d.ts              # IPresenter 总接口
│       ├── app.presenter.d.ts      # IAppPresenter
│       ├── config.presenter.d.ts   # IConfigPresenter
│       ├── agent.presenter.d.ts    # IAgentPresenter + Message 类型
│       ├── file.presenter.d.ts     # IFilePresenter
│       └── git.presenter.d.ts      # IGitPresenter
└── events.ts                       # 事件常量（可被主进程和渲染进程引用）
```

旧的 `src/shared/types.ts` 删除，内容迁移到上述文件中。

### IPresenter 总接口

```typescript
// shared/types/presenters/index.d.ts
export interface IPresenter {
  appPresenter: IAppPresenter;
  configPresenter: IConfigPresenter;
  agentPresenter: IAgentPresenter;
  filePresenter: IFilePresenter;
  gitPresenter: IGitPresenter;
  init(): void;
  destroy(): Promise<void>;
}
```

### 子接口示例

```typescript
// shared/types/presenters/agent.presenter.d.ts
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface IAgentPresenter {
  chat(params: { messages: Message[]; stream?: boolean }): Promise<{ content: string }>;
}

// shared/types/presenters/app.presenter.d.ts
export interface IAppPresenter {
  getVersion(): string;
}

// shared/types/presenters/config.presenter.d.ts
export interface IConfigPresenter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<boolean>;
}

// shared/types/presenters/file.presenter.d.ts
export interface IFilePresenter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<boolean>;
}

// shared/types/presenters/git.presenter.d.ts
export interface IGitPresenter {
  tag(name: string, message: string): Promise<boolean>;
}
```

## 5. 渲染进程

### 5.1 目录结构

```
src/renderer/src/
├── App.vue                        # 根组件，引入 EvolutionCenter
├── main.ts                        # 入口，注册 Pinia + PiniaColada
├── env.d.ts
├── assets/
│   └── main.css                   # 已有 TailwindCSS oklch 主题（保留）
├── composables/
│   ├── usePresenter.ts            # Proxy 封装
│   ├── useIpcQuery.ts             # @pinia/colada 查询层
│   └── useIpcMutation.ts          # @pinia/colada 变更层
├── stores/
│   ├── chat.ts                    # 对话消息
│   ├── evolution.ts               # 进化状态
│   └── config.ts                  # 配置
├── views/
│   └── EvolutionCenter.vue        # 占位页
├── components/                    # 空，TASK-004+ 再添加
└── utils/
    └── serialize.ts               # safeSerialize
```

### 5.2 usePresenter

```typescript
// composables/usePresenter.ts
import type { IPresenter } from "@shared/types/presenters";
import { safeSerialize } from "../utils/serialize";

export function usePresenter<T extends keyof IPresenter>(name: T): IPresenter[T] {
  return new Proxy({} as IPresenter[T], {
    get(_target, method: string) {
      return async (...args: unknown[]) => {
        const rawArgs = args.map(safeSerialize);
        return window.electron.ipcRenderer.invoke("presenter:call", name, method, ...rawArgs);
      };
    },
  });
}
```

### 5.3 useIpcQuery / useIpcMutation

依赖 `@pinia/colada`。

```typescript
// composables/useIpcQuery.ts
import { useQuery } from "@pinia/colada";
import { usePresenter } from "./usePresenter";
import type { IPresenter } from "@shared/types/presenters";

export function useIpcQuery<T extends keyof IPresenter>(options: {
  key: () => string[];
  presenter: T;
  method: string;
  args?: () => unknown[];
  staleTime?: number;
}) {
  const p = usePresenter(options.presenter);
  return useQuery({
    key: options.key,
    query: () => (p[options.method] as Function)(...(options.args?.() ?? [])),
    staleTime: options.staleTime ?? 30_000,
  });
}
```

useIpcMutation 类似，基于 `useMutation`，支持 `invalidateQueries` 在 mutation 成功后失效相关 query。

### 5.4 Pinia Stores

**chatStore**：messages 数组、isLoading。通过 `usePresenter('agentPresenter').chat()` 发送消息。监听 `chat:stream-chunk` 事件处理流式响应。

**evolutionStore**：stage（idle/discuss/design/coding/build/apply/completed/failed）、progress、context。监听 `evolution:stage-changed` 和 `evolution:progress` 事件。

**configStore**：通过 `usePresenter('configPresenter')` 读写配置。监听 `config:changed` 事件刷新。

### 5.5 main.ts 改造

```typescript
import { createApp } from "vue";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import App from "./App.vue";
import "./assets/main.css";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(PiniaColada);
app.mount("#app");
```

### 5.6 App.vue

```vue
<script setup lang="ts">
import EvolutionCenter from "./views/EvolutionCenter.vue";
</script>

<template>
  <div class="h-screen w-screen bg-background text-foreground">
    <EvolutionCenter />
  </div>
</template>
```

EvolutionCenter.vue 为占位页，具体布局在 TASK-004 实现。

## 6. 新增依赖

```bash
pnpm add @pinia/colada
```

其余依赖（pinia, @vueuse/core, lucide-vue-next, shadcn/vue 系列）已安装。

## 7. 删除/迁移的文件

| 操作 | 文件                       | 原因                                         |
| ---- | -------------------------- | -------------------------------------------- |
| 删除 | `src/main/ipc/` 整个目录   | 迁移到 presenter/                            |
| 删除 | `src/shared/types.ts`      | 拆分到 shared/types/presenters/              |
| 改造 | `src/main/index.ts`        | 替换 registerAllHandlers 为 Presenter 初始化 |
| 改造 | `src/preload/index.ts`     | 从 window.slime 改为 window.electron         |
| 改造 | `src/renderer/src/main.ts` | 添加 PiniaColada                             |
| 改造 | `src/renderer/src/App.vue` | 引入 EvolutionCenter                         |
| 更新 | `test/`                    | 适配新的 Presenter 结构                      |

## 8. 验收标准

- [ ] Presenter 单例正常初始化，所有子 presenter 可被渲染进程调用
- [ ] EventBus 能在主进程内部传递事件，能向渲染进程推送事件
- [ ] usePresenter 返回类型安全的 Proxy，调用自动路由到主进程
- [ ] useIpcQuery/useIpcMutation 正常工作，缓存生效
- [ ] 3 个 Pinia store 正常工作，能监听主进程事件
- [ ] 应用能正常启动，无控制台错误
- [ ] pnpm run typecheck / lint / format 通过
- [ ] 现有测试适配后通过
