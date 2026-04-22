# TASK-003: 搭建渲染进程基础框架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Slime 从当前的 ipc/handlers 架构迁移到 deepchat 风格的 Presenter 模式，建立渲染进程的 composables + stores + 目录结构。

**Architecture:** 主进程用 Presenter 单例 + EventBus 替代独立 IPC handler，通过统一 `presenter:call` 通道和 ES6 Proxy 实现端到端类型安全调用。渲染进程用 @pinia/colada 查询缓存层 + 3 个 Pinia store 管理状态。

**Tech Stack:** Electron + Vue 3 + Pinia + @pinia/colada + TypeScript + TailwindCSS + shadcn/vue

---

## File Map

### Create

| File | Responsibility |
|------|----------------|
| `src/shared/types/presenters/index.d.ts` | IPresenter 总接口 |
| `src/shared/types/presenters/app.presenter.d.ts` | IAppPresenter 接口 |
| `src/shared/types/presenters/config.presenter.d.ts` | IConfigPresenter 接口 |
| `src/shared/types/presenters/agent.presenter.d.ts` | IAgentPresenter + Message 类型 |
| `src/shared/types/presenters/file.presenter.d.ts` | IFilePresenter 接口 |
| `src/shared/types/presenters/git.presenter.d.ts` | IGitPresenter 接口 |
| `src/shared/events.ts` | 事件常量 |
| `src/main/eventbus.ts` | EventBus 单例 |
| `src/main/presenter/index.ts` | Presenter 单例 + IPC handler |
| `src/main/presenter/appPresenter.ts` | AppPresenter 实现 |
| `src/main/presenter/configPresenter.ts` | ConfigPresenter 实现 (stub) |
| `src/main/presenter/agentPresenter.ts` | AgentPresenter 实现 (stub) |
| `src/main/presenter/filePresenter.ts` | FilePresenter 实现 (stub) |
| `src/main/presenter/gitPresenter.ts` | GitPresenter 实现 (stub) |
| `src/renderer/src/utils/serialize.ts` | safeSerialize 工具 |
| `src/renderer/src/composables/usePresenter.ts` | Proxy 封装 |
| `src/renderer/src/composables/useIpcQuery.ts` | @pinia/colada 查询层 |
| `src/renderer/src/composables/useIpcMutation.ts` | @pinia/colada 变更层 |
| `src/renderer/src/stores/chat.ts` | 对话消息 store |
| `src/renderer/src/stores/evolution.ts` | 进化状态 store |
| `src/renderer/src/stores/config.ts` | 配置 store |
| `src/renderer/src/views/EvolutionCenter.vue` | 占位页 |
| `src/preload/index.d.ts` | Window 全局类型声明 |
| `test/main/eventbus.test.ts` | EventBus 测试 |
| `test/main/presenter.test.ts` | Presenter 单例测试 |
| `test/renderer/composables/usePresenter.test.ts` | usePresenter 测试 |
| `test/renderer/stores/chat.test.ts` | chatStore 测试 |
| `test/renderer/stores/evolution.test.ts` | evolutionStore 测试 |
| `test/renderer/stores/config.test.ts` | configStore 测试 |

### Modify

| File | Change |
|------|--------|
| `src/main/index.ts` | 替换 registerAllHandlers 为 Presenter 初始化 |
| `src/main/window.ts` | 导出 mainWindow 供 EventBus 使用 |
| `src/preload/index.ts` | 从 window.slime 改为 window.electron |
| `src/renderer/src/main.ts` | 添加 PiniaColada 插件 |
| `src/renderer/src/App.vue` | 引入 EvolutionCenter |
| `src/renderer/src/env.d.ts` | 添加 @shared 路径声明 |
| `test/renderer/App.test.ts` | 适配新的 App.vue |
| `package.json` | 添加 @pinia/colada 依赖 |

### Delete

| File | Reason |
|------|--------|
| `src/main/ipc/index.ts` | 迁移到 presenter |
| `src/main/ipc/types.ts` | 不再需要 |
| `src/main/ipc/handlers/app.ts` | 迁移到 appPresenter |
| `src/main/ipc/handlers/agent.ts` | 迁移到 agentPresenter |
| `src/main/ipc/handlers/config.ts` | 迁移到 configPresenter |
| `src/main/ipc/handlers/file.ts` | 迁移到 filePresenter |
| `src/main/ipc/handlers/git.ts` | 迁移到 gitPresenter |
| `src/shared/types.ts` | 拆分到 shared/types/presenters/ |

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 @pinia/colada**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm add @pinia/colada
```

- [ ] **Step 2: 验证安装**

Run: `pnpm ls @pinia/colada`
Expected: 显示 @pinia/colada 版本号

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @pinia/colada dependency"
```

---

### Task 2: 创建共享类型 (Presenter 接口)

**Files:**
- Create: `src/shared/types/presenters/app.presenter.d.ts`
- Create: `src/shared/types/presenters/config.presenter.d.ts`
- Create: `src/shared/types/presenters/agent.presenter.d.ts`
- Create: `src/shared/types/presenters/file.presenter.d.ts`
- Create: `src/shared/types/presenters/git.presenter.d.ts`
- Create: `src/shared/types/presenters/index.d.ts`
- Create: `src/shared/events.ts`

- [ ] **Step 1: 创建 app.presenter.d.ts**

```typescript
// src/shared/types/presenters/app.presenter.d.ts
export interface IAppPresenter {
  getVersion(): string
}
```

- [ ] **Step 2: 创建 config.presenter.d.ts**

```typescript
// src/shared/types/presenters/config.presenter.d.ts
export interface IConfigPresenter {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<boolean>
}
```

- [ ] **Step 3: 创建 agent.presenter.d.ts**

```typescript
// src/shared/types/presenters/agent.presenter.d.ts
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface IAgentPresenter {
  chat(params: { messages: Message[]; stream?: boolean }): Promise<{ content: string }>
}
```

- [ ] **Step 4: 创建 file.presenter.d.ts**

```typescript
// src/shared/types/presenters/file.presenter.d.ts
export interface IFilePresenter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<boolean>
}
```

- [ ] **Step 5: 创建 git.presenter.d.ts**

```typescript
// src/shared/types/presenters/git.presenter.d.ts
export interface IGitPresenter {
  tag(name: string, message: string): Promise<boolean>
}
```

- [ ] **Step 6: 创建 index.d.ts（IPresenter 总接口）**

```typescript
// src/shared/types/presenters/index.d.ts
import type { IAppPresenter } from './app.presenter'
import type { IConfigPresenter } from './config.presenter'
import type { IAgentPresenter } from './agent.presenter'
import type { IFilePresenter } from './file.presenter'
import type { IGitPresenter } from './git.presenter'

export type { IAppPresenter } from './app.presenter'
export type { IConfigPresenter } from './config.presenter'
export type { IAgentPresenter, Message } from './agent.presenter'
export type { IFilePresenter } from './file.presenter'
export type { IGitPresenter } from './git.presenter'

export interface IPresenter {
  appPresenter: IAppPresenter
  configPresenter: IConfigPresenter
  agentPresenter: IAgentPresenter
  filePresenter: IFilePresenter
  gitPresenter: IGitPresenter
  init(): void
  destroy(): Promise<void>
}
```

- [ ] **Step 7: 创建 events.ts（事件常量）**

```typescript
// src/shared/events.ts
export const CONFIG_EVENTS = {
  CHANGED: 'config:changed',
} as const

export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: 'evolution:stage-changed',
  PROGRESS: 'evolution:progress',
} as const

export const CHAT_EVENTS = {
  MESSAGE: 'chat:message',
  STREAM_CHUNK: 'chat:stream-chunk',
} as const
```

- [ ] **Step 8: 运行 typecheck 验证类型**

Run: `pnpm run typecheck:node`
Expected: 编译成功（shared/ 被 tsconfig.node.json 包含）

注意：此时 `src/shared/types.ts`（旧文件）仍存在，会在 Task 5 删除。typecheck 可能因旧文件中的 `declare global` 产生冲突——如果报错，先忽略，Task 5 会解决。

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/presenters/ src/shared/events.ts
git commit -m "feat(shared): add presenter interfaces and event constants"
```

---

### Task 3: 实现 EventBus

**Files:**
- Create: `src/main/eventbus.ts`
- Test: `test/main/eventbus.test.ts`

- [ ] **Step 1: 编写 EventBus 测试**

```typescript
// test/main/eventbus.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus } from '@/eventbus'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus()
  })

  it('should emit and receive main events via sendToMain', () => {
    const handler = vi.fn()
    bus.on('test:event', handler)
    bus.sendToMain('test:event', 'payload1', 42)
    expect(handler).toHaveBeenCalledWith('payload1', 42)
  })

  it('should send to renderer via webContents.send', () => {
    const mockSend = vi.fn()
    const mockWin = { webContents: { send: mockSend } } as any
    bus.setWindow(mockWin)
    bus.sendToRenderer('test:event', 'data')
    expect(mockSend).toHaveBeenCalledWith('test:event', 'data')
  })

  it('should not throw if no window set when sendToRenderer', () => {
    expect(() => bus.sendToRenderer('test:event', 'data')).not.toThrow()
  })

  it('should send to both main and renderer via send', () => {
    const mainHandler = vi.fn()
    const mockSend = vi.fn()
    const mockWin = { webContents: { send: mockSend } } as any
    bus.on('test:event', mainHandler)
    bus.setWindow(mockWin)
    bus.send('test:event', 'both')
    expect(mainHandler).toHaveBeenCalledWith('both')
    expect(mockSend).toHaveBeenCalledWith('test:event', 'both')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run test/main/eventbus.test.ts`
Expected: FAIL — 模块 `@/eventbus` 不存在

- [ ] **Step 3: 实现 EventBus**

```typescript
// src/main/eventbus.ts
import { EventEmitter } from 'events'
import type { BrowserWindow } from 'electron'

export class EventBus extends EventEmitter {
  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow): void {
    this.win = win
  }

  sendToMain(event: string, ...args: unknown[]): void {
    this.emit(event, ...args)
  }

  sendToRenderer(event: string, ...args: unknown[]): void {
    this.win?.webContents.send(event, ...args)
  }

  send(event: string, ...args: unknown[]): void {
    this.sendToMain(event, ...args)
    this.sendToRenderer(event, ...args)
  }
}

export const eventBus = new EventBus()
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test -- --run test/main/eventbus.test.ts`
Expected: PASS — 4 个测试全部通过

- [ ] **Step 5: Commit**

```bash
git add src/main/eventbus.ts test/main/eventbus.test.ts
git commit -m "feat(main): implement EventBus with main/renderer event dispatch"
```

---

### Task 4: 实现 Presenter 单例 + 子 Presenter

**Files:**
- Create: `src/main/presenter/appPresenter.ts`
- Create: `src/main/presenter/configPresenter.ts`
- Create: `src/main/presenter/agentPresenter.ts`
- Create: `src/main/presenter/filePresenter.ts`
- Create: `src/main/presenter/gitPresenter.ts`
- Create: `src/main/presenter/index.ts`
- Test: `test/main/presenter.test.ts`

- [ ] **Step 1: 编写 Presenter 测试**

```typescript
// test/main/presenter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock ipcMain.handle before importing Presenter
const mockHandle = vi.fn()
vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.1.0') },
  ipcMain: { handle: mockHandle },
}))

describe('Presenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton between tests
    const mod = require('@/presenter/index')
    if (mod.Presenter._resetForTest) mod.Presenter._resetForTest()
  })

  it('should register presenter:call handler on import', async () => {
    await import('@/presenter/index')
    expect(mockHandle).toHaveBeenCalledWith('presenter:call', expect.any(Function))
  })

  it('should dispatch to appPresenter.getVersion', async () => {
    const { Presenter } = await import('@/presenter/index')
    const presenter = Presenter.getInstance()
    const result = presenter.appPresenter.getVersion()
    expect(result).toBe('0.1.0')
  })

  it('should reject non-dispatchable presenter names', async () => {
    await import('@/presenter/index')
    const handler = mockHandle.mock.calls[0][1]
    await expect(handler({}, 'notReal', 'method')).rejects.toThrow('not dispatchable')
  })

  it('should reject non-existent methods', async () => {
    await import('@/presenter/index')
    const handler = mockHandle.mock.calls[0][1]
    await expect(handler({}, 'appPresenter', 'noSuchMethod')).rejects.toThrow('not found')
  })

  it('should call correct presenter method via handler', async () => {
    await import('@/presenter/index')
    const handler = mockHandle.mock.calls[0][1]
    const result = await handler({}, 'appPresenter', 'getVersion')
    expect(result).toBe('0.1.0')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run test/main/presenter.test.ts`
Expected: FAIL — 模块 `@/presenter/index` 不存在

- [ ] **Step 3: 创建 appPresenter.ts**

```typescript
// src/main/presenter/appPresenter.ts
import { app } from 'electron'
import type { IAppPresenter } from '@shared/types/presenters'

export class AppPresenter implements IAppPresenter {
  getVersion(): string {
    return app.getVersion()
  }
}
```

- [ ] **Step 4: 创建 configPresenter.ts**

```typescript
// src/main/presenter/configPresenter.ts
import type { IConfigPresenter } from '@shared/types/presenters'
import { logger } from '@/utils'

export class ConfigPresenter implements IConfigPresenter {
  async get(key: string): Promise<unknown> {
    logger.debug('config:get called', { key })
    // TODO: 实现配置读取
    return null
  }

  async set(key: string, value: unknown): Promise<boolean> {
    logger.debug('config:set called', { key, value })
    // TODO: 实现配置写入
    return false
  }
}
```

- [ ] **Step 5: 创建 agentPresenter.ts**

```typescript
// src/main/presenter/agentPresenter.ts
import type { IAgentPresenter, Message } from '@shared/types/presenters'
import { logger } from '@/utils'

export class AgentPresenter implements IAgentPresenter {
  async chat(params: { messages: Message[]; stream?: boolean }): Promise<{ content: string }> {
    logger.debug('agent:chat called', { messageCount: params.messages.length })
    // TODO: 实现 Claude API 调用
    return { content: 'Agent chat not implemented yet' }
  }
}
```

- [ ] **Step 6: 创建 filePresenter.ts**

```typescript
// src/main/presenter/filePresenter.ts
import type { IFilePresenter } from '@shared/types/presenters'
import { logger } from '@/utils'

export class FilePresenter implements IFilePresenter {
  async read(path: string): Promise<string> {
    logger.debug('file:read called', { path })
    // TODO: 实现文件读取
    return ''
  }

  async write(path: string, content: string): Promise<boolean> {
    logger.debug('file:write called', { path, contentLength: content.length })
    // TODO: 实现文件写入
    return false
  }
}
```

- [ ] **Step 7: 创建 gitPresenter.ts**

```typescript
// src/main/presenter/gitPresenter.ts
import type { IGitPresenter } from '@shared/types/presenters'
import { logger } from '@/utils'

export class GitPresenter implements IGitPresenter {
  async tag(name: string, message: string): Promise<boolean> {
    logger.debug('git:tag called', { name })
    // TODO: 实现 Git tag
    return false
  }
}
```

- [ ] **Step 8: 创建 Presenter 单例 (presenter/index.ts)**

```typescript
// src/main/presenter/index.ts
import { ipcMain } from 'electron'
import type { IPresenter } from '@shared/types/presenters'
import { AppPresenter } from './appPresenter'
import { ConfigPresenter } from './configPresenter'
import { AgentPresenter } from './agentPresenter'
import { FilePresenter } from './filePresenter'
import { GitPresenter } from './gitPresenter'
import { logger } from '@/utils'

type DispatchableKey = Exclude<keyof IPresenter, 'init' | 'destroy'>

export class Presenter implements IPresenter {
  appPresenter: AppPresenter
  configPresenter: ConfigPresenter
  agentPresenter: AgentPresenter
  filePresenter: FilePresenter
  gitPresenter: GitPresenter

  private static instance: Presenter | null = null

  private constructor() {
    this.appPresenter = new AppPresenter()
    this.configPresenter = new ConfigPresenter()
    this.agentPresenter = new AgentPresenter()
    this.filePresenter = new FilePresenter()
    this.gitPresenter = new GitPresenter()
  }

  static getInstance(): Presenter {
    if (!Presenter.instance) {
      Presenter.instance = new Presenter()
    }
    return Presenter.instance
  }

  /** Test only: reset singleton */
  static _resetForTest(): void {
    Presenter.instance = null
  }

  static readonly DISPATCHABLE = new Set<DispatchableKey>([
    'appPresenter',
    'configPresenter',
    'agentPresenter',
    'filePresenter',
    'gitPresenter',
  ])

  init(): void {
    logger.info('Presenter initialized')
  }

  async destroy(): Promise<void> {
    logger.info('Presenter destroyed')
  }
}

ipcMain.handle(
  'presenter:call',
  async (_event, name: string, method: string, ...args: unknown[]) => {
    if (!Presenter.DISPATCHABLE.has(name as DispatchableKey)) {
      throw new Error(`Presenter '${name}' is not dispatchable`)
    }
    const presenter = Presenter.getInstance()
    const target = presenter[name as DispatchableKey] as Record<string, unknown>
    if (typeof target[method] !== 'function') {
      throw new Error(`Method '${method}' not found on '${name}'`)
    }
    return (target[method] as Function)(...args)
  },
)
```

- [ ] **Step 9: 运行测试确认通过**

Run: `pnpm test -- --run test/main/presenter.test.ts`
Expected: PASS — 5 个测试全部通过

- [ ] **Step 10: Commit**

```bash
git add src/main/presenter/ test/main/presenter.test.ts
git commit -m "feat(main): implement Presenter singleton with sub-presenters"
```

---

### Task 5: 迁移主进程入口 + 删除旧 IPC 代码

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/window.ts`
- Delete: `src/main/ipc/` (entire directory)
- Delete: `src/shared/types.ts`
- Modify: `test/main/main.test.ts`

- [ ] **Step 1: 修改 src/main/index.ts**

将 `registerAllHandlers()` 替换为 Presenter 初始化 + EventBus 绑定：

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { createMainWindow } from './window'
import { Presenter } from './presenter'
import { eventBus } from './eventbus'
import { logger, paths } from './utils'

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function ensureDirectories(): void {
  const dirs = [paths.slimeDir, paths.stateDir, paths.configDir]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

async function bootstrap(): Promise<void> {
  logger.info('Slime starting...', { version: app.getVersion() })

  electronApp.setAppUserModelId('com.slime.app')

  ensureDirectories()

  const presenter = Presenter.getInstance()
  presenter.init()

  const mainWindow = createMainWindow()
  eventBus.setWindow(mainWindow)

  logger.info('Slime ready')
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) })
})
```

- [ ] **Step 2: 删除旧 IPC 目录和旧 shared/types.ts**

```bash
rm -rf src/main/ipc/
rm src/shared/types.ts
```

- [ ] **Step 3: 更新 test/main/main.test.ts**

现有测试只是硬编码断言，不依赖旧 IPC 代码，保持不变即可。确认测试仍能通过：

Run: `pnpm test -- --run test/main/main.test.ts`
Expected: PASS

- [ ] **Step 4: 运行全部主进程测试**

Run: `pnpm test -- --run --project main`
Expected: PASS — main.test.ts, eventbus.test.ts, presenter.test.ts 全部通过

- [ ] **Step 5: Commit**

```bash
git add -A src/main/index.ts src/main/ipc/ src/shared/types.ts test/main/main.test.ts
git commit -m "refactor(main): migrate from ipc/handlers to Presenter pattern"
```

---

### Task 6: 改造 Preload 桥接

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`

- [ ] **Step 1: 重写 src/preload/index.ts**

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const electronApi = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args),

    on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
        listener(...args)
      ipcRenderer.on(channel, wrappedListener)
      return () => ipcRenderer.removeListener(channel, wrappedListener)
    },

    removeAllListeners: (channel: string): void => {
      ipcRenderer.removeAllListeners(channel)
    },
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronApi)
  } catch (error) {
    console.error('Preload: Failed to expose API via contextBridge:', error)
  }
} else {
  window.electron = electronApi as any
}
```

- [ ] **Step 2: 创建 src/preload/index.d.ts**

```typescript
// src/preload/index.d.ts
export interface ElectronIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (...args: unknown[]) => void): () => void
  removeAllListeners(channel: string): void
}

export interface ElectronApi {
  ipcRenderer: ElectronIpcRenderer
}

declare global {
  interface Window {
    electron: ElectronApi
  }
}
```

- [ ] **Step 3: 运行 typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS（preload 在 tsconfig.node.json 的 include 中）

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "refactor(preload): expose window.electron.ipcRenderer for Presenter pattern"
```

---

### Task 7: 实现渲染进程 composables

**Files:**
- Create: `src/renderer/src/utils/serialize.ts`
- Create: `src/renderer/src/composables/usePresenter.ts`
- Create: `src/renderer/src/composables/useIpcQuery.ts`
- Create: `src/renderer/src/composables/useIpcMutation.ts`
- Test: `test/renderer/composables/usePresenter.test.ts`

- [ ] **Step 1: 编写 usePresenter 测试**

```typescript
// test/renderer/composables/usePresenter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePresenter } from '@/composables/usePresenter'

// mock window.electron
const mockInvoke = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: {
    electron: {
      ipcRenderer: {
        invoke: mockInvoke,
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      },
    },
  },
  writable: true,
})

describe('usePresenter', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('should return a proxy that calls ipcRenderer.invoke', async () => {
    mockInvoke.mockResolvedValue('0.1.0')
    const appPresenter = usePresenter('appPresenter')
    const result = await appPresenter.getVersion()
    expect(mockInvoke).toHaveBeenCalledWith('presenter:call', 'appPresenter', 'getVersion')
    expect(result).toBe('0.1.0')
  })

  it('should pass arguments through', async () => {
    mockInvoke.mockResolvedValue(null)
    const configPresenter = usePresenter('configPresenter')
    await configPresenter.get('theme')
    expect(mockInvoke).toHaveBeenCalledWith('presenter:call', 'configPresenter', 'get', 'theme')
  })

  it('should handle multiple arguments', async () => {
    mockInvoke.mockResolvedValue(true)
    const configPresenter = usePresenter('configPresenter')
    await configPresenter.set('theme', 'dark')
    expect(mockInvoke).toHaveBeenCalledWith(
      'presenter:call',
      'configPresenter',
      'set',
      'theme',
      'dark',
    )
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- --run test/renderer/composables/usePresenter.test.ts`
Expected: FAIL — 模块 `@/composables/usePresenter` 不存在

- [ ] **Step 3: 创建 serialize.ts**

```typescript
// src/renderer/src/utils/serialize.ts
import { toRaw } from 'vue'

/**
 * Recursively serialize a value for safe IPC transport.
 * Strips functions, symbols; converts Vue reactive proxies to raw.
 */
export function safeSerialize(value: unknown): unknown {
  if (value === null || value === undefined) return value

  const raw = toRaw(value)

  if (typeof raw === 'function' || typeof raw === 'symbol') return undefined

  if (raw instanceof Date) return raw.toISOString()

  if (Array.isArray(raw)) return raw.map(safeSerialize)

  if (typeof raw === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(raw as Record<string, unknown>)) {
      const v = safeSerialize((raw as Record<string, unknown>)[key])
      if (v !== undefined) result[key] = v
    }
    return result
  }

  return raw
}
```

- [ ] **Step 4: 创建 usePresenter.ts**

```typescript
// src/renderer/src/composables/usePresenter.ts
import type { IPresenter } from '@shared/types/presenters'
import { safeSerialize } from '../utils/serialize'

export function usePresenter<T extends keyof IPresenter>(name: T): IPresenter[T] {
  return new Proxy({} as IPresenter[T], {
    get(_target, method: string) {
      return async (...args: unknown[]) => {
        const rawArgs = args.map(safeSerialize)
        return window.electron.ipcRenderer.invoke('presenter:call', name, method, ...rawArgs)
      }
    },
  })
}
```

- [ ] **Step 5: 创建 useIpcQuery.ts**

```typescript
// src/renderer/src/composables/useIpcQuery.ts
import { useQuery, type EntryKey } from '@pinia/colada'
import { usePresenter } from './usePresenter'
import type { IPresenter } from '@shared/types/presenters'

export interface UseIpcQueryOptions<T extends keyof IPresenter> {
  key: () => EntryKey
  presenter: T
  method: string & keyof IPresenter[T]
  args?: () => unknown[]
  staleTime?: number
  enabled?: () => boolean
}

export function useIpcQuery<T extends keyof IPresenter>(options: UseIpcQueryOptions<T>) {
  const p = usePresenter(options.presenter)
  return useQuery({
    key: options.key,
    query: () => {
      const fn = p[options.method] as unknown as (...a: unknown[]) => Promise<unknown>
      return fn(...(options.args?.() ?? []))
    },
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled,
  })
}
```

- [ ] **Step 6: 创建 useIpcMutation.ts**

```typescript
// src/renderer/src/composables/useIpcMutation.ts
import { useMutation } from '@pinia/colada'
import { usePresenter } from './usePresenter'
import type { IPresenter } from '@shared/types/presenters'

export interface UseIpcMutationOptions<T extends keyof IPresenter> {
  presenter: T
  method: string & keyof IPresenter[T]
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

export function useIpcMutation<T extends keyof IPresenter>(options: UseIpcMutationOptions<T>) {
  const p = usePresenter(options.presenter)
  return useMutation({
    mutation: async (...args: unknown[]) => {
      const fn = p[options.method] as unknown as (...a: unknown[]) => Promise<unknown>
      return fn(...args)
    },
    onSuccess: options.onSuccess,
    onError: options.onError,
  })
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm test -- --run test/renderer/composables/usePresenter.test.ts`
Expected: PASS — 3 个测试全部通过

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/utils/serialize.ts src/renderer/src/composables/ test/renderer/composables/
git commit -m "feat(renderer): implement usePresenter, useIpcQuery, useIpcMutation composables"
```

---

### Task 8: 实现 3 个 Pinia Stores

**Files:**
- Create: `src/renderer/src/stores/chat.ts`
- Create: `src/renderer/src/stores/evolution.ts`
- Create: `src/renderer/src/stores/config.ts`
- Test: `test/renderer/stores/chat.test.ts`
- Test: `test/renderer/stores/evolution.test.ts`
- Test: `test/renderer/stores/config.test.ts`

- [ ] **Step 1: 编写 chatStore 测试**

```typescript
// test/renderer/stores/chat.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore } from '@/stores/chat'

describe('chatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start with empty messages', () => {
    const store = useChatStore()
    expect(store.messages).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('should add a message', () => {
    const store = useChatStore()
    store.addMessage({ role: 'user', content: 'hello' })
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].role).toBe('user')
    expect(store.messages[0].content).toBe('hello')
    expect(store.messages[0].id).toBeDefined()
    expect(store.messages[0].timestamp).toBeGreaterThan(0)
  })

  it('should compute lastMessage', () => {
    const store = useChatStore()
    store.addMessage({ role: 'user', content: 'first' })
    store.addMessage({ role: 'assistant', content: 'second' })
    expect(store.lastMessage?.content).toBe('second')
  })

  it('should clear messages', () => {
    const store = useChatStore()
    store.addMessage({ role: 'user', content: 'hello' })
    store.clearMessages()
    expect(store.messages).toEqual([])
  })
})
```

- [ ] **Step 2: 编写 evolutionStore 测试**

```typescript
// test/renderer/stores/evolution.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEvolutionStore } from '@/stores/evolution'

describe('evolutionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start idle', () => {
    const store = useEvolutionStore()
    expect(store.stage).toBe('idle')
    expect(store.progress).toBe(0)
    expect(store.context).toBeNull()
  })

  it('should set stage', () => {
    const store = useEvolutionStore()
    store.setStage('discuss')
    expect(store.stage).toBe('discuss')
  })

  it('should clamp progress 0-100', () => {
    const store = useEvolutionStore()
    store.setProgress(150)
    expect(store.progress).toBe(100)
    store.setProgress(-10)
    expect(store.progress).toBe(0)
  })

  it('should reset to initial state', () => {
    const store = useEvolutionStore()
    store.setStage('coding')
    store.setProgress(50)
    store.reset()
    expect(store.stage).toBe('idle')
    expect(store.progress).toBe(0)
    expect(store.context).toBeNull()
  })
})
```

- [ ] **Step 3: 编写 configStore 测试**

```typescript
// test/renderer/stores/config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from '@/stores/config'

// mock window.electron for usePresenter
const mockInvoke = vi.fn()
Object.defineProperty(globalThis, 'window', {
  value: {
    electron: {
      ipcRenderer: {
        invoke: mockInvoke,
        on: vi.fn(() => vi.fn()),
        removeAllListeners: vi.fn(),
      },
    },
  },
  writable: true,
})

describe('configStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockInvoke.mockReset()
  })

  it('should start with empty cache', () => {
    const store = useConfigStore()
    expect(store.cache).toEqual({})
  })

  it('should get config via presenter', async () => {
    mockInvoke.mockResolvedValue('dark')
    const store = useConfigStore()
    const value = await store.get('theme')
    expect(mockInvoke).toHaveBeenCalledWith('presenter:call', 'configPresenter', 'get', 'theme')
    expect(value).toBe('dark')
    expect(store.cache['theme']).toBe('dark')
  })

  it('should set config via presenter', async () => {
    mockInvoke.mockResolvedValue(true)
    const store = useConfigStore()
    const result = await store.set('theme', 'dark')
    expect(mockInvoke).toHaveBeenCalledWith(
      'presenter:call',
      'configPresenter',
      'set',
      'theme',
      'dark',
    )
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm test -- --run test/renderer/stores/`
Expected: FAIL — stores 模块不存在

- [ ] **Step 5: 实现 chatStore**

```typescript
// src/renderer/src/stores/chat.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref(false)

  const lastMessage = computed(() => messages.value[messages.value.length - 1] ?? null)

  function addMessage(msg: { role: ChatMessage['role']; content: string }): void {
    messages.value.push({
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  }

  function clearMessages(): void {
    messages.value = []
  }

  return {
    messages,
    isLoading,
    lastMessage,
    addMessage,
    clearMessages,
  }
})
```

- [ ] **Step 6: 实现 evolutionStore**

```typescript
// src/renderer/src/stores/evolution.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type EvolutionStage =
  | 'idle'
  | 'discuss'
  | 'design'
  | 'coding'
  | 'build'
  | 'apply'
  | 'completed'
  | 'failed'

export interface EvolutionContext {
  request: string
  requirements: Record<string, unknown>
  stage: EvolutionStage
  progress: number
  error?: string
}

export const useEvolutionStore = defineStore('evolution', () => {
  const stage = ref<EvolutionStage>('idle')
  const progress = ref(0)
  const context = ref<EvolutionContext | null>(null)

  function setStage(newStage: EvolutionStage): void {
    stage.value = newStage
  }

  function setProgress(value: number): void {
    progress.value = Math.min(100, Math.max(0, value))
  }

  function reset(): void {
    stage.value = 'idle'
    progress.value = 0
    context.value = null
  }

  return {
    stage,
    progress,
    context,
    setStage,
    setProgress,
    reset,
  }
})
```

- [ ] **Step 7: 实现 configStore**

```typescript
// src/renderer/src/stores/config.ts
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { usePresenter } from '@/composables/usePresenter'

export const useConfigStore = defineStore('config', () => {
  const cache = reactive<Record<string, unknown>>({})
  const configPresenter = usePresenter('configPresenter')

  async function get(key: string): Promise<unknown> {
    const value = await configPresenter.get(key)
    cache[key] = value
    return value
  }

  async function set(key: string, value: unknown): Promise<boolean> {
    const result = (await configPresenter.set(key, value)) as boolean
    if (result) {
      cache[key] = value
    }
    return result
  }

  return {
    cache,
    get,
    set,
  }
})
```

- [ ] **Step 8: 运行测试确认通过**

Run: `pnpm test -- --run test/renderer/stores/`
Expected: PASS — 所有 store 测试通过

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/stores/ test/renderer/stores/
git commit -m "feat(renderer): implement chatStore, evolutionStore, configStore"
```

---

### Task 9: 改造渲染进程入口 + App.vue

**Files:**
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/App.vue`
- Create: `src/renderer/src/views/EvolutionCenter.vue`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `test/renderer/App.test.ts`

- [ ] **Step 1: 更新 env.d.ts，添加路径声明**

```typescript
// src/renderer/src/env.d.ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
```

无需变更（`@shared` 路径已在 tsconfig.app.json 的 paths 中配置）。

- [ ] **Step 2: 创建 EvolutionCenter.vue 占位页**

```vue
<!-- src/renderer/src/views/EvolutionCenter.vue -->
<script setup lang="ts">
// TASK-004 will implement the actual layout
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <div class="text-center">
      <h1 class="text-4xl font-bold">Slime v0.1</h1>
      <p class="mt-2 text-lg text-muted-foreground">(egg) - Evolution Center</p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 更新 main.ts，添加 PiniaColada**

```typescript
// src/renderer/src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import App from './App.vue'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(PiniaColada)
app.mount('#app')
```

- [ ] **Step 4: 更新 App.vue**

```vue
<!-- src/renderer/src/App.vue -->
<script setup lang="ts">
import EvolutionCenter from './views/EvolutionCenter.vue'
</script>

<template>
  <div class="h-screen w-screen bg-background text-foreground">
    <EvolutionCenter />
  </div>
</template>
```

- [ ] **Step 5: 更新 test/renderer/App.test.ts**

```typescript
// test/renderer/App.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

describe('Renderer', () => {
  it('should render evolution center placeholder', () => {
    const Wrapper = defineComponent({
      setup() {
        return () =>
          h('div', { class: 'h-screen w-screen' }, [
            h('div', { class: 'text-center' }, 'Slime v0.1'),
          ])
      },
    })
    const wrapper = mount(Wrapper)
    expect(wrapper.text()).toContain('Slime v0.1')
  })
})
```

- [ ] **Step 6: 运行渲染进程测试**

Run: `pnpm test -- --run --project renderer`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/main.ts src/renderer/src/App.vue src/renderer/src/views/ src/renderer/src/env.d.ts test/renderer/App.test.ts
git commit -m "feat(renderer): setup PiniaColada, App.vue with EvolutionCenter"
```

---

### Task 10: 全局验证

**Files:** None (verification only)

- [ ] **Step 1: 运行全部测试**

Run: `pnpm test -- --run`
Expected: 全部通过（main + renderer 两个 project）

- [ ] **Step 2: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: 无错误

- [ ] **Step 3: 运行 format + lint**

```bash
pnpm run format && pnpm run lint
```

Expected: 无错误

- [ ] **Step 4: 启动开发模式验证**

Run: `pnpm run dev`
Expected:
- 窗口正常显示 "Slime v0.1 (egg) - Evolution Center"
- 控制台无错误
- DevTools 中可见 Pinia stores（chat, evolution, config）

- [ ] **Step 5: 验证 IPC 通信**

在 DevTools console 中执行：
```javascript
window.electron.ipcRenderer.invoke('presenter:call', 'appPresenter', 'getVersion')
```
Expected: 返回 `"0.1.0"`

- [ ] **Step 6: 如有 format/lint 修复，最终 commit**

```bash
git add -A
git commit -m "chore: format and lint fixes for TASK-003"
```
