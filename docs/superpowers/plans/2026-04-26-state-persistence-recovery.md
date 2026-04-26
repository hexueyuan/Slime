# State Persistence & Startup Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist EvolutionPresenter state to `context.json` so interrupted evolution tasks can be recovered on restart.

**Architecture:** Add `saveState/loadState/clearState` to EvolutionPresenter, triggered on stage transitions. On startup, `Presenter.init()` calls `restoreState()`. Renderer queries `getStatus()` on mount; if non-idle, main process pushes a recovery InteractionContent for user confirmation. Recovery reuses the saved sessionId and existing ask_user panel.

**Tech Stack:** TypeScript, fs/promises, Electron IPC, Vue 3, Pinia, Vitest

---

### Task 1: Add `EvolutionContext` type and `sessionId` field

**Files:**

- Modify: `src/shared/types/evolution.d.ts`
- Modify: `src/shared/types/presenters/evolution.presenter.d.ts`
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Add `EvolutionContext` type to shared types**

In `src/shared/types/evolution.d.ts`, add at the end of the file:

```typescript
export interface EvolutionContext {
  stage: EvolutionStage;
  description: string;
  plan?: EvolutionPlan;
  startCommit: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add `restoreState` to `IEvolutionPresenter` interface**

In `src/shared/types/presenters/evolution.presenter.d.ts`, add the import and method:

```typescript
import type {
  EvolutionStatus,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
  EvolutionContext,
} from "../evolution";

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  restart(): void;
  checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }>;
  readArchive(tag: string): Promise<EvolutionArchive | null>;
  runBuildVerification(): Promise<{ success: boolean; error?: string }>;
  restoreState(): Promise<EvolutionContext | null>;
}
```

- [ ] **Step 3: Add `sessionId` field and update `startEvolution` signature**

In `src/main/presenter/evolutionPresenter.ts`, add the field after `startCommit`:

```typescript
  private startCommit?: string;
  private sessionId?: string;
```

Update `startEvolution` to accept and store `sessionId`:

```typescript
  async startEvolution(description: string, sessionId?: string): Promise<boolean> {
    if (this.stage !== "idle" || this.rollbackInProgress) return false;
    this.description = description;
    this.sessionId = sessionId;
    this.setStage("discuss");
    this.startCommit = await this.git.getCurrentCommit();
    return true;
  }
```

Add `sessionId` to `getStatus()` return and the `EvolutionStatus` type. In `src/shared/types/evolution.d.ts`, update `EvolutionStatus`:

```typescript
export interface EvolutionStatus {
  stage: EvolutionStage;
  description?: string;
  plan?: EvolutionPlan;
  startCommit?: string;
  sessionId?: string;
}
```

In `evolutionPresenter.ts`, update `getStatus()`:

```typescript
  getStatus(): EvolutionStatus {
    return {
      stage: this.stage,
      description: this.description,
      plan: this.plan,
      startCommit: this.startCommit,
      sessionId: this.sessionId,
    };
  }
```

Add `sessionId` to `reset()`:

```typescript
  private reset(): void {
    this.stage = "idle";
    this.description = undefined;
    this.plan = undefined;
    this.startCommit = undefined;
    this.sessionId = undefined;
    this.pendingFinalize = undefined;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle");
  }
```

- [ ] **Step 4: Update ToolPresenter to pass sessionId to evolution_start**

In `src/main/presenter/toolPresenter.ts`, update the `evolution_start` tool's execute:

```typescript
      evolution_start: createTool({
        description: "Start an evolution. Transitions to discuss stage. Must be in idle stage.",
        parameters: z.object({
          description: z.string().describe("User's evolution request"),
        }),
        execute: async ({ description }) => {
          const ok = await this.evolutionPresenter.startEvolution(description, sessionId);
          return ok
            ? "Evolution started. You are now in discuss stage. Clarify requirements with ask_user before calling evolution_plan."
            : "Cannot start: another evolution is in progress.";
        },
      }),
```

- [ ] **Step 5: Write test for sessionId in startEvolution**

In `test/main/evolutionPresenter.test.ts`, add:

```typescript
it("startEvolution stores sessionId", async () => {
  const result = await evo.startEvolution("test", "session-123");
  expect(result).toBe(true);
  expect(evo.getStatus().sessionId).toBe("session-123");
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`
Expected: All tests pass including the new one.

- [ ] **Step 7: Commit**

```
git add src/shared/types/evolution.d.ts src/shared/types/presenters/evolution.presenter.d.ts src/main/presenter/evolutionPresenter.ts src/main/presenter/toolPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): add EvolutionContext type and sessionId field"
```

---

### Task 2: Implement `saveState`, `loadState`, `clearState`

**Files:**

- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing tests for saveState/loadState/clearState**

In `test/main/evolutionPresenter.test.ts`, update the `paths` mock to include `contextFile`:

```typescript
vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test", contextFile: "/tmp/test-state/context.json" },
}));
```

Add the `unlink` import to the `fs/promises` mock:

```typescript
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));
```

Update the import line:

```typescript
import { readFile, writeFile, readdir, unlink } from "fs/promises";
```

Add tests:

```typescript
// --- State persistence tests ---

it("saveState writes context.json after startEvolution", async () => {
  vi.mocked(writeFile).mockResolvedValue(undefined);
  await evo.startEvolution("test change", "sess-1");

  // setStage("discuss") triggers saveState
  const writeCalls = vi.mocked(writeFile).mock.calls;
  const contextCall = writeCalls.find((c) => (c[0] as string).includes("context.json"));
  expect(contextCall).toBeDefined();
  const saved = JSON.parse(contextCall![1] as string);
  expect(saved.stage).toBe("discuss");
  expect(saved.description).toBe("test change");
  expect(saved.sessionId).toBe("sess-1");
});

it("saveState updates context.json after submitPlan", async () => {
  vi.mocked(writeFile).mockResolvedValue(undefined);
  await evo.startEvolution("test", "sess-1");
  vi.mocked(writeFile).mockClear();

  evo.submitPlan({ scope: ["a.ts"], changes: ["modify a"] });

  const writeCalls = vi.mocked(writeFile).mock.calls;
  const contextCall = writeCalls.find((c) => (c[0] as string).includes("context.json"));
  expect(contextCall).toBeDefined();
  const saved = JSON.parse(contextCall![1] as string);
  expect(saved.stage).toBe("coding");
  expect(saved.plan).toEqual({ scope: ["a.ts"], changes: ["modify a"] });
});

it("clearState deletes context.json on reset", async () => {
  vi.mocked(writeFile).mockResolvedValue(undefined);
  vi.mocked(unlink).mockResolvedValue(undefined);
  await evo.startEvolution("test", "sess-1");
  await evo.cancel();

  expect(unlink).toHaveBeenCalledWith("/tmp/test-state/context.json");
});

it("loadState returns parsed context when file exists", async () => {
  const context = {
    stage: "coding",
    description: "test",
    startCommit: "abc123",
    sessionId: "sess-1",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
  };
  vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

  const result = await evo.restoreState();
  expect(result).not.toBeNull();
  expect(result!.stage).toBe("coding");
  expect(result!.sessionId).toBe("sess-1");
  expect(evo.getStatus().stage).toBe("coding");
});

it("loadState returns null and cleans up when file is corrupted", async () => {
  vi.mocked(readFile).mockResolvedValue("not valid json{{{");
  vi.mocked(unlink).mockResolvedValue(undefined);

  const result = await evo.restoreState();
  expect(result).toBeNull();
  expect(unlink).toHaveBeenCalledWith("/tmp/test-state/context.json");
  expect(evo.getStatus().stage).toBe("idle");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`
Expected: New tests fail (saveState/loadState/clearState not implemented yet).

- [ ] **Step 3: Implement saveState, loadState, clearState, restoreState**

In `src/main/presenter/evolutionPresenter.ts`, add `unlink` to imports:

```typescript
import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises";
```

Add the private methods before the `// --- Archive CRUD ---` section:

```typescript
  // --- State persistence ---

  private async saveState(): Promise<void> {
    const context: EvolutionContext = {
      stage: this.stage,
      description: this.description || "",
      plan: this.plan,
      startCommit: this.startCommit || "",
      sessionId: this.sessionId || "",
      createdAt: this._createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._createdAt = context.createdAt;
    try {
      await writeFile(paths.contextFile, JSON.stringify(context, null, 2), "utf-8");
    } catch (err) {
      logger.error("Failed to save evolution state", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async loadState(): Promise<EvolutionContext | null> {
    try {
      const raw = await readFile(paths.contextFile, "utf-8");
      return JSON.parse(raw as string) as EvolutionContext;
    } catch {
      return null;
    }
  }

  private async clearState(): Promise<void> {
    try {
      await unlink(paths.contextFile);
    } catch {
      // file doesn't exist, that's fine
    }
  }
```

Add the import for `EvolutionContext`:

```typescript
import type {
  EvolutionStage,
  EvolutionStatus,
  EvolutionPlan,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
  EvolutionContext,
} from "@shared/types/evolution";
```

Add `_createdAt` field:

```typescript
  private _createdAt?: string;
```

Add public `restoreState`:

```typescript
  async restoreState(): Promise<EvolutionContext | null> {
    const context = await this.loadState();
    if (!context) return null;

    try {
      if (!context.stage || context.stage === "idle") {
        await this.clearState();
        return null;
      }
      this.stage = context.stage;
      this.description = context.description;
      this.plan = context.plan;
      this.startCommit = context.startCommit;
      this.sessionId = context.sessionId;
      this._createdAt = context.createdAt;
      logger.info("Evolution state restored", { stage: context.stage });
      return context;
    } catch {
      await this.clearState();
      return null;
    }
  }
```

- [ ] **Step 4: Wire saveState into setStage and submitPlan**

Update `setStage`:

```typescript
  private setStage(stage: EvolutionStage): void {
    this.stage = stage;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, stage);
    if (stage !== "idle") {
      this.saveState();
    }
  }
```

Update `submitPlan` to save after plan is set:

```typescript
  submitPlan(plan: EvolutionPlan): boolean {
    if (this.stage !== "discuss") return false;
    this.plan = plan;
    this.setStage("coding");
    return true;
  }
```

Note: `setStage("coding")` already triggers `saveState()`, and by this point `this.plan` is set, so plan will be included.

Wire `clearState` into `reset`:

```typescript
  private reset(): void {
    this.stage = "idle";
    this.description = undefined;
    this.plan = undefined;
    this.startCommit = undefined;
    this.sessionId = undefined;
    this.pendingFinalize = undefined;
    this._createdAt = undefined;
    this.clearState();
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle");
  }
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): implement state persistence saveState/loadState/clearState"
```

---

### Task 3: Implement startup recovery in Presenter.init()

**Files:**

- Modify: `src/main/presenter/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/events.ts`
- Test: `test/main/evolutionRecovery.test.ts` (new)

- [ ] **Step 1: Add recovery event to shared events**

In `src/shared/events.ts`, add to `EVOLUTION_EVENTS`:

```typescript
export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: "evolution:stage-changed",
  PROGRESS: "evolution:progress",
  COMPLETED: "evolution:completed",
  ROLLBACK_STARTED: "evolution:rollback-started",
  ROLLBACK_COMPLETED: "evolution:rollback-completed",
  ROLLBACK_FAILED: "evolution:rollback-failed",
  RECOVERY_PROMPT: "evolution:recovery-prompt",
} as const;
```

- [ ] **Step 2: Write failing test for restoreState on startup**

Create `test/main/evolutionRecovery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: {
    effectiveProjectRoot: "/tmp/test",
    contextFile: "/tmp/test-state/context.json",
  },
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter";
import { readFile, unlink } from "fs/promises";

function mockGit() {
  return {
    tag: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
    rollbackToRef: vi.fn().mockResolvedValue(true),
    addAndCommit: vi.fn().mockResolvedValue(true),
    stageAll: vi.fn().mockResolvedValue(true),
    getChangedFiles: vi.fn().mockResolvedValue([]),
  } as any;
}

function mockConfig() {
  return { get: vi.fn().mockResolvedValue("testuser") } as any;
}

describe("Evolution Recovery", () => {
  let evo: EvolutionPresenter;
  let git: ReturnType<typeof mockGit>;

  beforeEach(() => {
    vi.clearAllMocks();
    git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
  });

  it("restoreState with valid context restores internal fields", async () => {
    const context = {
      stage: "discuss",
      description: "add dark mode",
      startCommit: "abc123",
      sessionId: "sess-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).not.toBeNull();
    expect(evo.getStatus().stage).toBe("discuss");
    expect(evo.getStatus().description).toBe("add dark mode");
    expect(evo.getStatus().startCommit).toBe("abc123");
    expect(evo.getStatus().sessionId).toBe("sess-1");
  });

  it("restoreState with no file returns null and stays idle", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const result = await evo.restoreState();
    expect(result).toBeNull();
    expect(evo.getStatus().stage).toBe("idle");
  });

  it("restoreState with coding stage and plan restores plan", async () => {
    const context = {
      stage: "coding",
      description: "refactor",
      plan: { scope: ["src/a.ts"], changes: ["modify a"], risks: [] },
      startCommit: "def456",
      sessionId: "sess-2",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).not.toBeNull();
    expect(evo.getStatus().stage).toBe("coding");
    expect(evo.getStatus().plan).toEqual({ scope: ["src/a.ts"], changes: ["modify a"], risks: [] });
  });

  it("restoreState with idle stage clears state and returns null", async () => {
    const context = {
      stage: "idle",
      description: "",
      startCommit: "",
      sessionId: "",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalled();
  });

  it("recovery abandon calls cancel and clears state", async () => {
    const context = {
      stage: "coding",
      description: "test",
      startCommit: "abc123",
      sessionId: "sess-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    await evo.restoreState();
    expect(evo.getStatus().stage).toBe("coding");

    await evo.cancel();
    expect(evo.getStatus().stage).toBe("idle");
    expect(git.rollbackToRef).toHaveBeenCalledWith("abc123");
    expect(unlink).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they pass** (restoreState was implemented in Task 2)

Run: `pnpm test -- test/main/evolutionRecovery.test.ts`
Expected: All pass.

- [ ] **Step 4: Make `Presenter.init()` async and call restoreState**

In `src/main/presenter/index.ts`, change `init`:

```typescript
  private pendingRecovery: import("@shared/types/evolution").EvolutionContext | null = null;

  async init(): Promise<void> {
    this.pendingRecovery = await this.evolutionPresenter.restoreState();
    if (this.pendingRecovery) {
      logger.info("Pending evolution recovery", { stage: this.pendingRecovery.stage });
    }
    logger.info("Presenter initialized");
  }
```

In `src/main/index.ts`, await init:

```typescript
await presenter.init();
```

(It's already in an async function `bootstrap()`, so this is safe.)

- [ ] **Step 5: Add `getPendingRecovery` method to Presenter**

In `src/main/presenter/index.ts`, add:

```typescript
  getPendingRecovery(): import("@shared/types/evolution").EvolutionContext | null {
    return this.pendingRecovery;
  }

  clearPendingRecovery(): void {
    this.pendingRecovery = null;
  }
```

- [ ] **Step 6: Add recovery IPC handler**

In `src/main/presenter/index.ts`, add after the existing rollback IPC handlers:

```typescript
ipcMain.handle("recovery:check", () => {
  const p = Presenter.getInstance();
  return p.getPendingRecovery();
});

ipcMain.handle("recovery:continue", async (_event, sessionId: string) => {
  const p = Presenter.getInstance();
  const recovery = p.getPendingRecovery();
  if (!recovery) return { success: false, error: "No pending recovery" };

  p.clearPendingRecovery();

  if (recovery.stage === "coding" || recovery.stage === "applying") {
    // Auto-trigger agent to continue coding
    await p.agentPresenter.chat(
      sessionId,
      {
        text: "Evolution task interrupted by app restart. Check current code state and continue completing the evolution task.",
        files: [],
      },
      { hidden: true },
    );
  }
  // For discuss stage, user just continues chatting normally
  return { success: true, stage: recovery.stage };
});

ipcMain.handle("recovery:abandon", async () => {
  const p = Presenter.getInstance();
  p.clearPendingRecovery();
  await p.evolutionPresenter.cancel();
  return { success: true };
});
```

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```
git add src/main/presenter/index.ts src/main/index.ts src/shared/events.ts test/main/evolutionRecovery.test.ts
git commit -m "feat(evolution): add startup recovery logic with IPC handlers"
```

---

### Task 4: Renderer recovery UI

**Files:**

- Modify: `src/renderer/src/views/EvolutionCenter.vue`
- Modify: `src/renderer/src/stores/evolution.ts`
- Modify: `src/renderer/src/stores/session.ts`

- [ ] **Step 1: Add `setActiveSession` to session store**

In `src/renderer/src/stores/session.ts`:

```typescript
export const useSessionStore = defineStore("session", () => {
  const activeSessionId = ref<string | null>(null);

  const sessionPresenter = usePresenter("sessionPresenter");

  async function ensureSession(): Promise<void> {
    const sessions: ChatSession[] = await sessionPresenter.getSessions();
    if (sessions.length > 0) {
      activeSessionId.value = sessions[0].id;
    } else {
      const session = await sessionPresenter.createSession();
      activeSessionId.value = session.id;
    }
  }

  function setActiveSession(id: string) {
    activeSessionId.value = id;
  }

  return {
    activeSessionId,
    ensureSession,
    setActiveSession,
  };
});
```

- [ ] **Step 2: Add recovery state to evolution store**

In `src/renderer/src/stores/evolution.ts`, add:

```typescript
const recoveryContext = ref<{
  stage: string;
  description: string;
  sessionId: string;
} | null>(null);

function setRecovery(ctx: { stage: string; description: string; sessionId: string } | null) {
  recoveryContext.value = ctx;
}
```

Update the return:

```typescript
return {
  stage,
  completedTag,
  completedSummary,
  rollbackInProgress,
  rollbackTag,
  recoveryContext,
  setStage,
  setCompleted,
  setRecovery,
  reset,
};
```

Update `reset()` to also clear recovery:

```typescript
function reset() {
  stage.value = "idle";
  completedTag.value = null;
  completedSummary.value = null;
  rollbackInProgress.value = false;
  rollbackTag.value = null;
  recoveryContext.value = null;
}
```

- [ ] **Step 3: Add recovery check in EvolutionCenter and render recovery banner**

In `src/renderer/src/views/EvolutionCenter.vue`, update `<script setup>`:

Add imports:

```typescript
import { useSessionStore } from "@/stores/session";
```

Add after `setupEvolutionIpc(evolutionStore)`:

```typescript
const sessionStore = useSessionStore();

// Check for pending recovery
onMounted(async () => {
  const recovery = (await window.electron.ipcRenderer.invoke("recovery:check")) as {
    stage: string;
    description: string;
    sessionId: string;
  } | null;
  if (recovery && recovery.stage !== "idle") {
    evolutionStore.setRecovery(recovery);
  }
});

async function onRecoveryContinue() {
  const recovery = evolutionStore.recoveryContext;
  if (!recovery) return;
  if (recovery.sessionId) {
    sessionStore.setActiveSession(recovery.sessionId);
  }
  evolutionStore.setRecovery(null);
  await window.electron.ipcRenderer.invoke("recovery:continue", recovery.sessionId);
}

async function onRecoveryAbandon() {
  evolutionStore.setRecovery(null);
  await window.electron.ipcRenderer.invoke("recovery:abandon");
}
```

In `<template>`, add the recovery banner inside the evolution view, right after `<EvolutionStatusBar />`:

```html
<EvolutionStatusBar />
<!-- Recovery banner -->
<div
  v-if="evolutionStore.recoveryContext"
  class="mx-4 mt-2 flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3"
>
  <div class="text-sm">
    <span class="text-violet-400">检测到未完成的进化任务：</span>
    <span class="text-foreground">「{{ evolutionStore.recoveryContext.description }}」</span>
    <span class="ml-2 text-muted-foreground">({{ evolutionStore.recoveryContext.stage }})</span>
  </div>
  <div class="flex gap-2">
    <button
      class="rounded px-3 py-1 text-xs bg-violet-600 text-white hover:bg-violet-500 transition-colors"
      @click="onRecoveryContinue"
    >
      继续进化
    </button>
    <button
      class="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      @click="onRecoveryAbandon"
    >
      放弃并回滚
    </button>
  </div>
</div>
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```
git add src/renderer/src/views/EvolutionCenter.vue src/renderer/src/stores/evolution.ts src/renderer/src/stores/session.ts
git commit -m "feat(renderer): add recovery banner UI and session switching"
```

---

### Task 5: Integration test and format/lint

**Files:**

- Modify: `test/main/evolutionRecovery.test.ts`

- [ ] **Step 1: Add integration-style recovery test**

In `test/main/evolutionRecovery.test.ts`, add:

```typescript
it("full persistence round-trip: start → save → restore → cancel", async () => {
  const writeFile = (await import("fs/promises")).writeFile;
  const readFileMock = vi.mocked(readFile);

  // Start evolution → triggers saveState
  vi.mocked(writeFile).mockResolvedValue(undefined);
  await evo.startEvolution("add feature", "sess-99");
  evo.submitPlan({ scope: ["x.ts"], changes: ["add x"] });
  expect(evo.getStatus().stage).toBe("coding");

  // Simulate restart: create new EvolutionPresenter and restore
  const evo2 = new EvolutionPresenter(git, mockConfig());
  const savedContext = {
    stage: "coding",
    description: "add feature",
    plan: { scope: ["x.ts"], changes: ["add x"] },
    startCommit: "abc123",
    sessionId: "sess-99",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
  };
  readFileMock.mockResolvedValue(JSON.stringify(savedContext));

  const restored = await evo2.restoreState();
  expect(restored).not.toBeNull();
  expect(evo2.getStatus().stage).toBe("coding");
  expect(evo2.getStatus().description).toBe("add feature");
  expect(evo2.getStatus().sessionId).toBe("sess-99");

  // User chooses abandon
  await evo2.cancel();
  expect(evo2.getStatus().stage).toBe("idle");
  expect(git.rollbackToRef).toHaveBeenCalledWith("abc123");
});
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All pass.

- [ ] **Step 3: Run format and lint**

Run: `pnpm run format && pnpm run lint`
Expected: Clean.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```
git add test/main/evolutionRecovery.test.ts
git commit -m "test(evolution): add persistence round-trip integration test"
```

---

### Task 6: Update AGENTS.md and Obsidian task tracker

**Files:**

- Modify: `docs/AGENTS.md` (the project CLAUDE.md references this as the architecture doc)

- [ ] **Step 1: Update AGENTS.md with state persistence info**

In `docs/AGENTS.md`, under the `### Evolution Workflow` section, add:

```markdown
### State Persistence & Recovery

- `context.json` at `paths.contextFile` (`{userData}/.slime/state/context.json`) stores active evolution state
- Saved on every `setStage()` (non-idle) and `submitPlan()`; cleared on `reset()`
- `restoreState()` called in `Presenter.init()` — restores EvolutionPresenter fields without emitting events
- Recovery IPC: `recovery:check` / `recovery:continue` / `recovery:abandon`
- Renderer shows recovery banner when `evolutionStore.recoveryContext` is set
- discuss recovery: user continues chatting; coding recovery: auto-triggers `agentPresenter.chat()` with hidden resume prompt
```

- [ ] **Step 2: Run format**

Run: `pnpm run format`

- [ ] **Step 3: Commit**

```
git add docs/AGENTS.md
git commit -m "docs: add state persistence and recovery to AGENTS.md"
```
