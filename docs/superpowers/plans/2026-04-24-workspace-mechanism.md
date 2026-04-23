# Workspace 源码工作区机制实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让打包后的 Slime 能够 clone 和操作自己的源码，实现自我进化。首次打开进化实验室时显示引导界面进行初始化。

**Architecture:**

- 新增 WorkspacePresenter 负责源码工作区管理
- 打包模式下 `effectiveProjectRoot` 指向 workspace 源码目录
- 进化实验室首次打开时检测 workspace 状态，未初始化则显示引导 UI
- 引导 UI 展示 clone 进度，完成后自动进入正常界面

**Tech Stack:** Node.js fs/child_process, Electron IPC, Vue 3 Composition API

---

## 文件结构

| 文件                                                       | 职责                                               |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `src/main/utils/paths.ts`                                  | 新增 workspaceDir, sourceDir, effectiveProjectRoot |
| `src/main/presenter/workspacePresenter.ts`                 | 新建：workspace 初始化/clone/状态查询              |
| `src/main/presenter/index.ts`                              | 注入 WorkspacePresenter                            |
| `src/shared/types/presenters/workspace.presenter.d.ts`     | 新建：IWorkspacePresenter 接口                     |
| `src/shared/types/presenters/index.d.ts`                   | 导出 IWorkspacePresenter                           |
| `src/shared/events.ts`                                     | 新增 workspace 事件常量                            |
| `src/renderer/src/views/EvolutionCenter.vue`               | 根据 workspace 状态切换引导/正常界面               |
| `src/renderer/src/components/workspace/WorkspaceSetup.vue` | 新建：初始化引导组件                               |
| `test/main/workspacePresenter.test.ts`                     | WorkspacePresenter 单元测试                        |

---

## Task 1: 扩展 paths.ts 路径配置

**Files:**

- Modify: `src/main/utils/paths.ts`
- Test: `test/main/paths.test.ts`

- [x] **Step 1: 编写 paths 扩展的测试**

创建 `test/main/paths.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/userData"),
    isPackaged: false,
    getAppPath: vi.fn(() => "/mock/app.asar"),
  },
}));

describe("paths", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("workspaceDir points to userData/.slime/workspace", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.workspaceDir).toBe("/mock/userData/.slime/workspace");
  });

  it("sourceDir points to workspace/slime-src", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.sourceDir).toBe("/mock/userData/.slime/workspace/slime-src");
  });

  it("workspaceReadyFile points to workspace/.ready", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.workspaceReadyFile).toBe("/mock/userData/.slime/workspace/.ready");
  });

  it("effectiveProjectRoot returns cwd when not packaged", async () => {
    const { paths } = await import("@/utils/paths");
    expect(paths.effectiveProjectRoot).toBe(process.cwd());
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/paths.test.ts`
Expected: FAIL - workspaceDir/sourceDir/effectiveProjectRoot 属性不存在

- [x] **Step 3: 实现 paths 扩展**

修改 `src/main/utils/paths.ts`，在现有 paths 对象中添加：

```typescript
// === 新增 workspace 相关路径 ===

get workspaceDir() {
  return join(this.slimeDir, "workspace");
},

get sourceDir() {
  return join(this.workspaceDir, "slime-src");
},

get workspaceReadyFile() {
  return join(this.workspaceDir, ".ready");
},

/** 实际操作的项目根目录：打包后用 sourceDir，开发时用 cwd */
get effectiveProjectRoot() {
  return app.isPackaged ? this.sourceDir : process.cwd();
},
```

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test test/main/paths.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add src/main/utils/paths.ts test/main/paths.test.ts
git commit -m "feat(paths): add workspace directory paths"
```

---

## Task 2: 添加 workspace 事件常量

**Files:**

- Modify: `src/shared/events.ts`

- [x] **Step 1: 添加 WORKSPACE_EVENTS**

在 `src/shared/events.ts` 末尾添加：

```typescript
export const WORKSPACE_EVENTS = {
  STATUS_CHANGED: "workspace:status-changed",
  INIT_PROGRESS: "workspace:init-progress",
} as const;
```

- [x] **Step 2: 提交**

```bash
git add src/shared/events.ts
git commit -m "feat(events): add workspace event constants"
```

---

## Task 3: 定义 IWorkspacePresenter 接口

**Files:**

- Create: `src/shared/types/presenters/workspace.presenter.d.ts`
- Modify: `src/shared/types/presenters/index.d.ts`

- [x] **Step 1: 创建 workspace.presenter.d.ts**

```typescript
export interface WorkspaceStatus {
  ready: boolean;
  sourceDir: string;
  gitRemote: string;
  currentBranch?: string;
  lastError?: string;
}

export interface InitProgress {
  stage: "clone" | "install" | "done" | "error";
  message: string;
  percent?: number;
}

export interface IWorkspacePresenter {
  /** 是否需要初始化（仅打包模式且未初始化时返回 true） */
  needsInit(): Promise<boolean>;
  /** 检查 workspace 是否已初始化 */
  isReady(): Promise<boolean>;
  /** 初始化 workspace（clone + pnpm install），通过事件推送进度 */
  initialize(remote?: string): Promise<boolean>;
  /** 获取 workspace 状态 */
  getStatus(): Promise<WorkspaceStatus>;
  /** 获取当前 effectiveProjectRoot */
  getProjectRoot(): string;
}
```

- [x] **Step 2: 更新 index.d.ts**

在 `src/shared/types/presenters/index.d.ts` 添加导入和导出：

```typescript
import type { IWorkspacePresenter } from "./workspace.presenter";
export type { IWorkspacePresenter, WorkspaceStatus, InitProgress } from "./workspace.presenter";
```

在 `IPresenter` 接口中添加：

```typescript
workspacePresenter: IWorkspacePresenter;
```

- [x] **Step 3: 类型检查**

Run: `pnpm run typecheck`
Expected: 失败（Presenter 类未实现）— 预期行为

- [x] **Step 4: 提交**

```bash
git add src/shared/types/presenters/
git commit -m "feat(types): add IWorkspacePresenter interface"
```

---

## Task 4: 实现 WorkspacePresenter

**Files:**

- Create: `src/main/presenter/workspacePresenter.ts`
- Test: `test/main/workspacePresenter.test.ts`

- [x] **Step 1: 编写基础测试**

创建 `test/main/workspacePresenter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/userData"),
    isPackaged: true,
    getAppPath: vi.fn(() => "/mock/app.asar"),
  },
}));

vi.mock("@/utils", () => ({
  paths: {
    workspaceDir: "/mock/workspace",
    sourceDir: "/mock/workspace/slime-src",
    workspaceReadyFile: "/mock/workspace/.ready",
    effectiveProjectRoot: "/mock/workspace/slime-src",
  },
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

describe("WorkspacePresenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("isReady", () => {
    it("returns true when .ready file exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.isReady()).toBe(true);
    });

    it("returns false when .ready file missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.isReady()).toBe(false);
    });
  });

  describe("needsInit", () => {
    it("returns true when packaged and not ready", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { WorkspacePresenter } = await import("@/presenter/workspacePresenter");
      const wp = new WorkspacePresenter();
      expect(await wp.needsInit()).toBe(true);
    });
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test test/main/workspacePresenter.test.ts`
Expected: FAIL - 模块不存在

- [x] **Step 3: 实现 WorkspacePresenter**

创建 `src/main/presenter/workspacePresenter.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { app } from "electron";
import type { IWorkspacePresenter, WorkspaceStatus, InitProgress } from "@shared/types/presenters";
import { WORKSPACE_EVENTS } from "@shared/events";
import { logger, paths } from "@/utils";
import { eventBus } from "@/eventbus";

const DEFAULT_REMOTE = "https://github.com/hexueyuan/Slime.git";

export class WorkspacePresenter implements IWorkspacePresenter {
  private lastError?: string;

  async needsInit(): Promise<boolean> {
    if (!app.isPackaged) return false;
    return !(await this.isReady());
  }

  async isReady(): Promise<boolean> {
    return existsSync(paths.workspaceReadyFile);
  }

  getProjectRoot(): string {
    return paths.effectiveProjectRoot;
  }

  async initialize(remote: string = DEFAULT_REMOTE): Promise<boolean> {
    if (!app.isPackaged) {
      logger.info("workspace: dev mode, skip init");
      return true;
    }

    if (await this.isReady()) {
      logger.info("workspace: already initialized");
      return true;
    }

    try {
      logger.info("workspace: initializing...", { remote });
      mkdirSync(paths.workspaceDir, { recursive: true });

      // Clone
      this.sendProgress({ stage: "clone", message: "正在克隆源码仓库...", percent: 0 });
      await this.runCommand("git", ["clone", "--depth", "1", "--progress", remote, "slime-src"], {
        cwd: paths.workspaceDir,
        onProgress: (msg) => {
          this.sendProgress({ stage: "clone", message: msg, percent: 30 });
        },
      });

      // Install
      this.sendProgress({ stage: "install", message: "正在安装依赖...", percent: 50 });
      await this.runCommand("pnpm", ["install"], {
        cwd: paths.sourceDir,
        onProgress: (msg) => {
          this.sendProgress({ stage: "install", message: msg, percent: 70 });
        },
      });

      // Done
      writeFileSync(paths.workspaceReadyFile, new Date().toISOString());
      this.sendProgress({ stage: "done", message: "初始化完成", percent: 100 });
      logger.info("workspace: initialized successfully");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      this.sendProgress({ stage: "error", message: msg });
      logger.error("workspace: init failed", { error: msg });
      return false;
    }
  }

  async getStatus(): Promise<WorkspaceStatus> {
    const ready = await this.isReady();
    let currentBranch: string | undefined;

    if (ready && existsSync(paths.sourceDir)) {
      try {
        currentBranch = await this.runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: paths.sourceDir,
          capture: true,
        });
        currentBranch = currentBranch.trim();
      } catch {
        // ignore
      }
    }

    return {
      ready,
      sourceDir: paths.sourceDir,
      gitRemote: DEFAULT_REMOTE,
      currentBranch,
      lastError: this.lastError,
    };
  }

  private sendProgress(progress: InitProgress): void {
    eventBus.sendToRenderer(WORKSPACE_EVENTS.INIT_PROGRESS, progress);
  }

  private runCommand(
    cmd: string,
    args: string[],
    opts: { cwd: string; onProgress?: (msg: string) => void; capture?: boolean },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd: opts.cwd, shell: true });
      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const str = data.toString();
        stdout += str;
        opts.onProgress?.(str.trim());
      });

      proc.stderr?.on("data", (data) => {
        const str = data.toString();
        stderr += str;
        opts.onProgress?.(str.trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(opts.capture ? stdout : "");
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test test/main/workspacePresenter.test.ts`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add src/main/presenter/workspacePresenter.ts test/main/workspacePresenter.test.ts
git commit -m "feat(workspace): implement WorkspacePresenter"
```

---

## Task 5: 集成到 Presenter 单例

**Files:**

- Modify: `src/main/presenter/index.ts`

- [x] **Step 1: 导入 WorkspacePresenter**

在 imports 区添加：

```typescript
import { WorkspacePresenter } from "./workspacePresenter";
```

- [x] **Step 2: 添加 workspacePresenter 属性**

在 Presenter 类中添加：

```typescript
workspacePresenter: WorkspacePresenter;
```

在 constructor 中（最前面）添加：

```typescript
this.workspacePresenter = new WorkspacePresenter();
```

- [x] **Step 3: 添加到 DISPATCHABLE 集合**

```typescript
static readonly DISPATCHABLE = new Set<DispatchableKey>([
  // ... existing
  "workspacePresenter",
]);
```

- [x] **Step 4: 修改 FilePresenter 使用 effectiveProjectRoot**

```typescript
// 原：this.filePresenter = new FilePresenter(paths.projectRoot);
this.filePresenter = new FilePresenter(paths.effectiveProjectRoot);
```

- [x] **Step 5: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 6: 提交**

```bash
git add src/main/presenter/index.ts
git commit -m "feat(presenter): integrate WorkspacePresenter"
```

---

## Task 6: ToolPresenter exec 使用 effectiveProjectRoot

**Files:**

- Modify: `src/main/presenter/toolPresenter.ts`

- [x] **Step 1: 修改 exec 工具的 cwd**

在 exec tool 的 execute 中：

```typescript
// 原：const cwd = paths.projectRoot;
const cwd = paths.effectiveProjectRoot;
```

- [x] **Step 2: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: 提交**

```bash
git add src/main/presenter/toolPresenter.ts
git commit -m "fix(tools): exec uses effectiveProjectRoot"
```

---

## Task 7: 创建 WorkspaceSetup 引导组件

**Files:**

- Create: `src/renderer/src/components/workspace/WorkspaceSetup.vue`

- [x] **Step 1: 创建组件目录**

Run: `mkdir -p src/renderer/src/components/workspace`

- [x] **Step 2: 实现 WorkspaceSetup.vue**

创建 `src/renderer/src/components/workspace/WorkspaceSetup.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Icon } from "@iconify/vue";
import type { InitProgress } from "@shared/types/presenters";
import { WORKSPACE_EVENTS } from "@shared/events";
import { usePresenter } from "@/composables/usePresenter";

const emit = defineEmits<{
  ready: [];
}>();

const workspacePresenter = usePresenter("workspacePresenter");

const stage = ref<InitProgress["stage"]>("clone");
const message = ref("准备初始化...");
const percent = ref(0);
const error = ref<string | null>(null);
const initializing = ref(false);

function onProgress(_event: unknown, progress: InitProgress) {
  stage.value = progress.stage;
  message.value = progress.message;
  if (progress.percent !== undefined) {
    percent.value = progress.percent;
  }
  if (progress.stage === "error") {
    error.value = progress.message;
    initializing.value = false;
  }
  if (progress.stage === "done") {
    setTimeout(() => emit("ready"), 500);
  }
}

async function startInit() {
  error.value = null;
  initializing.value = true;
  const ok = await workspacePresenter.initialize();
  if (!ok && !error.value) {
    error.value = "初始化失败，请检查网络连接";
  }
  initializing.value = false;
}

onMounted(() => {
  window.electron.ipcRenderer.on(WORKSPACE_EVENTS.INIT_PROGRESS, onProgress);
});

onUnmounted(() => {
  window.electron.ipcRenderer.removeListener(WORKSPACE_EVENTS.INIT_PROGRESS, onProgress);
});
</script>

<template>
  <div class="flex h-full items-center justify-center bg-background">
    <div class="w-full max-w-md space-y-6 p-8">
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
        >
          <Icon icon="lucide:dna" class="h-8 w-8 text-primary" />
        </div>
        <h1 class="text-2xl font-semibold">进化实验室初始化</h1>
        <p class="mt-2 text-sm text-muted-foreground">首次使用需要克隆源码仓库</p>
      </div>

      <div v-if="!initializing && !error" class="space-y-4">
        <div class="rounded-lg border border-border bg-muted/50 p-4 text-sm">
          <p class="font-medium">即将执行：</p>
          <ul class="mt-2 space-y-1 text-muted-foreground">
            <li>• 克隆 Slime 源码仓库</li>
            <li>• 安装项目依赖</li>
          </ul>
        </div>
        <button
          class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
          @click="startInit"
        >
          开始初始化
        </button>
      </div>

      <div v-else-if="initializing" class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span>{{ message }}</span>
            <span class="text-muted-foreground">{{ percent }}%</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{ width: percent + '%' }"
            />
          </div>
        </div>
        <p class="text-center text-xs text-muted-foreground">这可能需要几分钟，请耐心等待...</p>
      </div>

      <div v-else-if="error" class="space-y-4">
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p class="text-sm text-destructive">{{ error }}</p>
        </div>
        <button
          class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
          @click="startInit"
        >
          重试
        </button>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 3: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 4: 提交**

```bash
git add src/renderer/src/components/workspace/
git commit -m "feat(ui): add WorkspaceSetup component"
```

---

## Task 8: 集成到 EvolutionCenter

**Files:**

- Modify: `src/renderer/src/views/EvolutionCenter.vue`

- [x] **Step 1: 添加 workspace 状态检测**

在 `<script setup>` 中添加：

```typescript
import { ref, computed, onMounted } from "vue";
import WorkspaceSetup from "../components/workspace/WorkspaceSetup.vue";
import { usePresenter } from "@/composables/usePresenter";

const workspacePresenter = usePresenter("workspacePresenter");
const needsWorkspaceInit = ref<boolean | null>(null); // null = loading

onMounted(async () => {
  needsWorkspaceInit.value = await workspacePresenter.needsInit();
});

function onWorkspaceReady() {
  needsWorkspaceInit.value = false;
}
```

- [x] **Step 2: 修改 template 条件渲染**

```vue
<template>
  <!-- Loading state -->
  <div
    v-if="needsWorkspaceInit === null"
    class="flex h-full items-center justify-center bg-background"
  >
    <div class="text-muted-foreground">加载中...</div>
  </div>

  <!-- Workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" @ready="onWorkspaceReady" />

  <!-- Normal evolution center -->
  <div v-else class="flex h-full flex-col bg-sidebar">
    <!-- existing content -->
  </div>
</template>
```

- [x] **Step 3: 完整的修改后文件**

`src/renderer/src/views/EvolutionCenter.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import AppSidebar from "../components/AppSidebar.vue";
import ChatPanel from "../components/chat/ChatPanel.vue";
import FunctionPanel from "../components/function/FunctionPanel.vue";
import WorkspaceSetup from "../components/workspace/WorkspaceSetup.vue";
import { useSplitPane } from "../composables/useSplitPane";
import { useMessageStore } from "@/stores/chat";
import { usePresenter } from "@/composables/usePresenter";
import type { AssistantMessageBlock } from "@shared/types/chat";

// Workspace init check
const workspacePresenter = usePresenter("workspacePresenter");
const needsWorkspaceInit = ref<boolean | null>(null);

onMounted(async () => {
  needsWorkspaceInit.value = await workspacePresenter.needsInit();
});

function onWorkspaceReady() {
  needsWorkspaceInit.value = false;
}

// Split pane
const mainRef = ref<HTMLElement | null>(null);
const { leftWidth, onMouseDown, resetToDefault } = useSplitPane({
  containerRef: mainRef,
  defaultRatio: 0.35,
  minLeftPx: 280,
  minRightPx: 320,
});

// Chat & tools
const messageStore = useMessageStore();
const activeTab = ref<"workflow" | "tools">("workflow");
const selectedToolCallId = ref<string | null>(null);

const toolCallBlocks = computed<AssistantMessageBlock[]>(() => {
  const blocks =
    messageStore.streamingBlocks.length > 0
      ? messageStore.streamingBlocks
      : getLastAssistantBlocks();
  return blocks.filter((b) => b.type === "tool_call");
});

function getLastAssistantBlocks(): AssistantMessageBlock[] {
  const ids = messageStore.messageIds;
  for (let i = ids.length - 1; i >= 0; i--) {
    const msg = messageStore.getMessage(ids[i]);
    if (msg?.role === "assistant") {
      try {
        return JSON.parse(msg.content);
      } catch {
        return [];
      }
    }
  }
  return [];
}

function onSelectToolCall(id: string | null) {
  if (id) {
    selectedToolCallId.value = id;
    activeTab.value = "tools";
  } else {
    selectedToolCallId.value = null;
  }
}
</script>

<template>
  <!-- Loading -->
  <div
    v-if="needsWorkspaceInit === null"
    class="flex h-full items-center justify-center bg-background"
  >
    <div class="text-muted-foreground">加载中...</div>
  </div>

  <!-- Workspace setup -->
  <WorkspaceSetup v-else-if="needsWorkspaceInit" @ready="onWorkspaceReady" />

  <!-- Evolution center -->
  <div v-else class="flex h-full flex-col bg-sidebar">
    <div class="h-9 shrink-0" style="-webkit-app-region: drag" />
    <div class="flex min-h-0 flex-1">
      <AppSidebar />
      <div
        ref="mainRef"
        class="flex min-w-0 flex-1 overflow-hidden rounded-tl-xl border-l border-t border-border bg-background"
      >
        <div class="shrink-0 overflow-hidden" :style="{ width: leftWidth + 'px' }">
          <ChatPanel
            :selected-tool-call-id="selectedToolCallId"
            @select-tool-call="onSelectToolCall"
          />
        </div>
        <div
          class="group relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border"
          @mousedown="onMouseDown"
          @dblclick="resetToDefault"
        >
          <div class="absolute inset-y-0 -left-1 -right-1" />
        </div>
        <div class="min-w-[320px] flex-1 overflow-hidden">
          <FunctionPanel
            :active-tab="activeTab"
            :tool-call-blocks="toolCallBlocks"
            :selected-tool-call-id="selectedToolCallId"
            @update:active-tab="activeTab = $event"
            @select-tool-call="onSelectToolCall"
          />
        </div>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 4: 类型检查 + lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: PASS

- [x] **Step 5: 提交**

```bash
git add src/renderer/src/views/EvolutionCenter.vue
git commit -m "feat(ui): integrate workspace init into EvolutionCenter"
```

---

## Task 9: 端到端验证

**Files:**

- None (manual verification)

- [x] **Step 1: 开发模式验证**

Run: `pnpm run dev`
Expected: 正常启动，直接进入进化实验室（不显示初始化引导）

- [x] **Step 2: format + lint + typecheck**

Run: `pnpm run format && pnpm run lint && pnpm run typecheck`
Expected: PASS

- [x] **Step 3: 运行全部测试**

Run: `pnpm test`
Expected: PASS

- [x] **Step 4: 打包测试（可选）**

Run: `pnpm run build:mac`
然后运行打包后的 app，首次打开进化实验室应显示初始化引导

---

## 后续优化（不在本计划范围）

1. **更细粒度的进度** — git clone --progress 解析百分比
2. **取消初始化** — 支持用户中断 clone
3. **版本管理** — 支持切换分支/tag、git pull 更新
4. **自定义 remote** — 允许用户配置私有 fork
