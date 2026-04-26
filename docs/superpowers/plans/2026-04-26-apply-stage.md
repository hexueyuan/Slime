# TASK-022 Apply Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After evolution finalize (commit/tag/archive), automatically run `electron-builder --mac` to package a new `.app` bundle and replace the running application via a detached shell script.

**Architecture:** Add `applyEvolution()` to `EvolutionPresenter` as the post-finalize entry point. In packaged mode it runs `pnpm run build:mac`, locates the output `.app`, writes a swap shell script, spawns it detached, and exits. In dev mode it falls back to existing `reset()` + relaunch behavior. Progress and errors are pushed via a new `APPLY_PROGRESS` event. Two new IPC handlers (`evolution:retry-package` / `evolution:skip-package`) let the renderer control failure recovery.

**Tech Stack:** TypeScript, Electron (`app`, `child_process.spawn/execFile`), Vitest

---

### Task 1: Add `ApplyProgress` type and `APPLY_PROGRESS` event

**Files:**
- Modify: `src/shared/types/evolution.d.ts:60` (append)
- Modify: `src/shared/events.ts:7` (add to `EVOLUTION_EVENTS`)

- [ ] **Step 1: Add `ApplyProgress` type**

In `src/shared/types/evolution.d.ts`, append after the `EvolutionContext` interface:

```typescript
export interface ApplyProgress {
  step: 'committing' | 'packaging' | 'replacing'
  message: string
  error?: string
}
```

- [ ] **Step 2: Add `APPLY_PROGRESS` event constant**

In `src/shared/events.ts`, add to `EVOLUTION_EVENTS`:

```typescript
export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: "evolution:stage-changed",
  PROGRESS: "evolution:progress",
  COMPLETED: "evolution:completed",
  APPLY_PROGRESS: "evolution:apply-progress",
  ROLLBACK_STARTED: "evolution:rollback-started",
  // ... rest unchanged
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/evolution.d.ts src/shared/events.ts
git commit -m "feat(evolution): add ApplyProgress type and APPLY_PROGRESS event"
```

---

### Task 2: Add `applyEvolution`, `retryPackage`, `skipPackage` to `IEvolutionPresenter`

**Files:**
- Modify: `src/shared/types/presenters/evolution.presenter.d.ts:9-18`

- [ ] **Step 1: Add three methods to interface**

In `src/shared/types/presenters/evolution.presenter.d.ts`, add to `IEvolutionPresenter`:

```typescript
export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  restart(): void;
  checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }>;
  readArchive(tag: string): Promise<EvolutionArchive | null>;
  runBuildVerification(): Promise<{ success: boolean; error?: string }>;
  restoreState(): Promise<EvolutionContext | null>;
  applyEvolution(): Promise<void>;
  retryPackage(): Promise<void>;
  skipPackage(): void;
}
```

- [ ] **Step 2: Add import for `ApplyProgress`**

Update the imports at the top (even though the interface doesn't directly use it, it's available for consumers):

```typescript
import type {
  EvolutionStatus,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
  EvolutionContext,
} from "../evolution";
```

No change needed — `ApplyProgress` is consumed by event listeners, not the interface directly.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/presenters/evolution.presenter.d.ts
git commit -m "feat(evolution): add applyEvolution/retryPackage/skipPackage to interface"
```

---

### Task 3: Implement `resolveAppBundlePath` and `findBuiltApp` private helpers

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing tests for `resolveAppBundlePath` and `findBuiltApp`**

Append to `test/main/evolutionPresenter.test.ts`:

```typescript
describe("resolveAppBundlePath", () => {
  it("returns null when app is not packaged", () => {
    // app.isPackaged is already mocked as false
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    expect((evo as any).resolveAppBundlePath()).toBeNull();
  });
});

describe("findBuiltApp", () => {
  it("returns null when no .app found in dist", async () => {
    // readdir returns empty
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    const result = await (evo as any).findBuiltApp();
    expect(result).toBeNull();
  });

  it("finds .app in mac-arm64 directory", async () => {
    const { readdir } = await import("fs/promises");
    (readdir as any).mockImplementation(async (dir: string) => {
      if (dir.includes("mac-arm64")) return ["Slime.app"];
      return [];
    });
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    const result = await (evo as any).findBuiltApp();
    expect(result).toContain("mac-arm64");
    expect(result).toContain("Slime.app");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: FAIL — `resolveAppBundlePath` and `findBuiltApp` are not defined.

- [ ] **Step 3: Implement helpers in `evolutionPresenter.ts`**

Add these private methods to `EvolutionPresenter` class, before the `execCommand` method. Add `spawn` to the `child_process` import and `existsSync`, `readdirSync` to a new `fs` import:

```typescript
import { execFile, spawn } from "child_process";
import { existsSync, readdirSync, writeFileSync } from "fs";
```

```typescript
  private resolveAppBundlePath(): string | null {
    if (!app.isPackaged) return null;
    let current = app.getAppPath();
    while (current !== "/") {
      if (current.endsWith(".app")) return current;
      current = join(current, "..");
    }
    return null;
  }

  private async findBuiltApp(): Promise<string | null> {
    const distDir = join(paths.effectiveProjectRoot, "dist");
    const candidates = ["mac-arm64", "mac"];
    for (const sub of candidates) {
      const dir = join(distDir, sub);
      try {
        const entries = await readdir(dir);
        const appEntry = entries.find((e) => e.endsWith(".app"));
        if (appEntry) return join(dir, appEntry);
      } catch {
        // directory doesn't exist, try next
      }
    }
    return null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): add resolveAppBundlePath and findBuiltApp helpers"
```

---

### Task 4: Implement `runPackage` private method

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing test for `runPackage`**

Append to `test/main/evolutionPresenter.test.ts`:

```typescript
describe("runPackage", () => {
  it("executes pnpm run build:mac and returns success", async () => {
    (execFile as any).mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, "build output", "");
      },
    );
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    const result = await (evo as any).runPackage();
    expect(result.success).toBe(true);
    expect(execFile).toHaveBeenCalledWith(
      "pnpm",
      ["run", "build:mac"],
      expect.objectContaining({ timeout: 600_000 }),
      expect.any(Function),
    );
  });

  it("returns error on build failure", async () => {
    (execFile as any).mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const err = Object.assign(new Error("build failed"), { code: 1, stderr: "error output" });
        cb(err, "", "error output");
      },
    );
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    const result = await (evo as any).runPackage();
    expect(result.success).toBe(false);
    expect(result.error).toContain("error output");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: FAIL — `runPackage` is not defined.

- [ ] **Step 3: Implement `runPackage`**

Add to `EvolutionPresenter` class:

```typescript
  private async runPackage(): Promise<{ success: boolean; error?: string }> {
    const cwd = paths.effectiveProjectRoot;
    const MAX_OUTPUT = 2000;

    logger.info("Running electron-builder package");
    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "packaging",
      message: "正在打包应用...",
    });

    const result = await this.execCommand("pnpm", ["run", "build:mac"], cwd, 600_000);
    if (result.exitCode !== 0) {
      const output = (result.stderr || result.stdout).slice(-MAX_OUTPUT);
      logger.warn("Package build failed", { exitCode: result.exitCode });
      return { success: false, error: `build:mac failed:\n${output}` };
    }

    logger.info("Package build completed");
    return { success: true };
  }
```

Also update `execCommand` to accept an optional timeout parameter:

```typescript
  private execCommand(
    cmd: string,
    args: string[],
    cwd: string,
    timeout = 300_000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      execFile(
        cmd,
        args,
        { cwd, timeout, maxBuffer: 2 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const e = err as any;
            resolve({
              stdout: (stdout as string) || e.stdout || "",
              stderr: (stderr as string) || e.stderr || "",
              exitCode: e.code ?? 1,
            });
          } else {
            resolve({ stdout: stdout as string, stderr: stderr as string, exitCode: 0 });
          }
        },
      );
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): implement runPackage for electron-builder"
```

---

### Task 5: Implement `selfReplace` private method

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing test for `selfReplace`**

Append to `test/main/evolutionPresenter.test.ts`:

```typescript
import { spawn } from "child_process";

describe("selfReplace", () => {
  it("writes swap script and spawns detached bash", async () => {
    const mockChild = { unref: vi.fn() };
    (spawn as any).mockReturnValue(mockChild);

    const { writeFileSync } = await import("fs");
    const { app } = await import("electron");

    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    // Manually set state to test selfReplace in isolation
    ;(evo as any).selfReplace("/Applications/Slime.app", "/tmp/dist/mac-arm64/Slime.app");

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("swap-update.sh"),
      expect.stringContaining("rm -rf"),
      expect.objectContaining({ mode: 0o755 }),
    );
    expect(spawn).toHaveBeenCalledWith(
      "/bin/bash",
      [expect.stringContaining("swap-update.sh")],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
    expect(mockChild.unref).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});
```

Also update the electron mock to include `exit` and `getPath`:

```typescript
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue("/tmp/test"),
    getPath: vi.fn().mockReturnValue("/tmp"),
    exit: vi.fn(),
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
}));
```

And add `writeFileSync` mock to the `fs` mock block — add a new mock for `fs` (sync methods):

```typescript
vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFileSync: vi.fn(),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: FAIL — `selfReplace` is not defined.

- [ ] **Step 3: Implement `selfReplace`**

Add to `EvolutionPresenter` class:

```typescript
  private selfReplace(currentAppPath: string, newAppPath: string): void {
    const tempDir = join(app.getPath("temp"), `slime-update-${Date.now()}`);
    const scriptPath = join(tempDir, "swap-update.sh");
    const pid = process.pid;

    const script = [
      "#!/bin/bash",
      `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
      `rm -rf "${currentAppPath}"`,
      `cp -R "${newAppPath}" "${currentAppPath}"`,
      `open "${currentAppPath}"`,
    ].join("\n");

    const { mkdirSync } = require("fs") as typeof import("fs");
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(scriptPath, script, { mode: 0o755 });

    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "replacing",
      message: "正在替换应用...",
    });

    const child = spawn("/bin/bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    app.exit(0);
  }
```

Wait — we should not use `require` for `mkdirSync`. Instead, add `mkdirSync` to the existing `fs` sync import at the top:

```typescript
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "fs";
```

And use it directly:

```typescript
  private selfReplace(currentAppPath: string, newAppPath: string): void {
    const tempDir = join(app.getPath("temp"), `slime-update-${Date.now()}`);
    const scriptPath = join(tempDir, "swap-update.sh");
    const pid = process.pid;

    const script = [
      "#!/bin/bash",
      `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done`,
      `rm -rf "${currentAppPath}"`,
      `cp -R "${newAppPath}" "${currentAppPath}"`,
      `open "${currentAppPath}"`,
    ].join("\n");

    mkdirSync(tempDir, { recursive: true });
    writeFileSync(scriptPath, script, { mode: 0o755 });

    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "replacing",
      message: "正在替换应用...",
    });

    const child = spawn("/bin/bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    app.exit(0);
  }
```

Update the `fs` mock to also include `mkdirSync`:

```typescript
vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): implement selfReplace with detached shell script"
```

---

### Task 6: Implement `applyEvolution`, `retryPackage`, `skipPackage` public methods

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Test: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing test for `applyEvolution` in dev mode**

```typescript
describe("applyEvolution", () => {
  it("in dev mode: emits COMPLETED, resets, and calls restart", async () => {
    const git = mockGit();
    const evo = new EvolutionPresenter(git, mockConfig());
    await evo.startEvolution("test", "s1");
    evo.submitPlan({ scope: [], changes: [] });
    // Need to go through completeEvolution + finalizeEvolution first
    await evo.completeEvolution("summary");
    // Mock finalizeEvolution internals already tested elsewhere
    // Just test applyEvolution directly after stage is applying
    expect(evo.getStatus().stage).toBe("applying");

    await evo.applyEvolution();

    // In dev mode (app.isPackaged = false), should reset to idle
    expect(evo.getStatus().stage).toBe("idle");
    expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
      EVOLUTION_EVENTS.APPLY_PROGRESS,
      expect.objectContaining({ step: "committing", message: expect.any(String) }),
    );
  });
});

describe("skipPackage", () => {
  it("resets evolution to idle", async () => {
    const evo = new EvolutionPresenter(mockGit(), mockConfig());
    await evo.startEvolution("test");
    evo.submitPlan({ scope: [], changes: [] });
    await evo.completeEvolution("summary");
    expect(evo.getStatus().stage).toBe("applying");

    evo.skipPackage();
    expect(evo.getStatus().stage).toBe("idle");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement the three public methods**

```typescript
  async applyEvolution(): Promise<void> {
    if (this.stage !== "applying") return;

    eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
      step: "committing",
      message: "正在提交变更...",
    });

    if (!app.isPackaged) {
      logger.info("Dev mode: skipping package + replace, resetting");
      this.reset();
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "committing",
        message: "开发模式：进化已完成，代码变更已提交",
      });
      return;
    }

    // Packaged mode: build + replace
    const packageResult = await this.runPackage();
    if (!packageResult.success) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "packaging",
        error: packageResult.error,
        message: "打包失败",
      });
      return; // stay in applying, user can retry or skip
    }

    const newApp = await this.findBuiltApp();
    if (!newApp) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "packaging",
        error: "未找到打包产物 (.app)",
        message: "打包产物缺失",
      });
      return;
    }

    const currentApp = this.resolveAppBundlePath();
    if (!currentApp) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.APPLY_PROGRESS, {
        step: "replacing",
        error: "无法定位当前应用路径",
        message: "替换失败",
      });
      return;
    }

    this.selfReplace(currentApp, newApp);
  }

  async retryPackage(): Promise<void> {
    if (this.stage !== "applying") return;
    await this.applyEvolution();
  }

  skipPackage(): void {
    if (this.stage !== "applying") return;
    logger.info("User skipped packaging, resetting");
    this.reset();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): implement applyEvolution, retryPackage, skipPackage"
```

---

### Task 7: Modify `finalizeEvolution` to not reset, and wire `applyEvolution` in `agentPresenter`

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts:106-159` (finalizeEvolution)
- Modify: `src/main/presenter/agentPresenter.ts:414` (caller site)

- [ ] **Step 1: Update `finalizeEvolution` to stop calling `reset()`**

In `src/main/presenter/evolutionPresenter.ts`, change the success path of `finalizeEvolution()` from:

```typescript
      this.reset();
      eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, pending.tagName, pending.summary);
```

To:

```typescript
      eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, pending.tagName, pending.summary);
      // Don't reset — applyEvolution() will handle reset after package + replace
```

- [ ] **Step 2: Wire `applyEvolution` in `agentPresenter.ts`**

In `src/main/presenter/agentPresenter.ts`, after the `finalizeEvolution()` call (around line 414), add:

```typescript
      // evolution_complete 只做了 prepare，loop 结束后统一 commit
      // 确保 AI 在 complete 之后的 format/lint 修改也被收进去
      const finalized = await this.evolutionPresenter.finalizeEvolution();
      if (finalized) {
        await this.evolutionPresenter.applyEvolution();
      }
```

Replace the existing single line:
```typescript
      await this.evolutionPresenter.finalizeEvolution();
```

- [ ] **Step 3: Run all tests**

Run: `pnpm test --run`
Expected: PASS — existing tests should still pass since they mock at the unit level.

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts src/main/presenter/agentPresenter.ts
git commit -m "feat(evolution): wire applyEvolution after finalizeEvolution"
```

---

### Task 8: Register `evolution:retry-package` and `evolution:skip-package` IPC handlers

**Files:**
- Modify: `src/main/presenter/index.ts:227-260` (after recovery handlers)

- [ ] **Step 1: Add IPC handlers**

In `src/main/presenter/index.ts`, append after the recovery IPC handlers (after line 260):

```typescript
// --- Package retry/skip IPC handlers ---

ipcMain.handle("evolution:retry-package", async () => {
  const p = Presenter.getInstance();
  await p.evolutionPresenter.retryPackage();
  return { success: true };
});

ipcMain.handle("evolution:skip-package", () => {
  const p = Presenter.getInstance();
  p.evolutionPresenter.skipPackage();
  return { success: true };
});
```

- [ ] **Step 2: Commit**

```bash
git add src/main/presenter/index.ts
git commit -m "feat(evolution): register retry-package and skip-package IPC handlers"
```

---

### Task 9: Add `applyProgress` to evolution store and IPC listener

**Files:**
- Modify: `src/renderer/src/stores/evolution.ts`

- [ ] **Step 1: Add `applyProgress` ref and listener**

In `src/renderer/src/stores/evolution.ts`, add the import:

```typescript
import type { EvolutionStage, ApplyProgress } from "@shared/types/evolution";
```

Add inside the store function, after the existing refs:

```typescript
  const applyProgress = ref<ApplyProgress | null>(null);
```

Add to the return:

```typescript
  return {
    stage,
    completedTag,
    completedSummary,
    rollbackInProgress,
    rollbackTag,
    recoveryContext,
    applyProgress,
    setStage,
    setCompleted,
    setRecovery,
    reset,
  };
```

Update the `reset` function to also clear `applyProgress`:

```typescript
  function reset() {
    stage.value = "idle";
    completedTag.value = null;
    completedSummary.value = null;
    rollbackInProgress.value = false;
    rollbackTag.value = null;
    recoveryContext.value = null;
    applyProgress.value = null;
  }
```

In `setupEvolutionIpc`, add listener:

```typescript
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.APPLY_PROGRESS, (...args: unknown[]) => {
    store.applyProgress = args[0] as ApplyProgress;
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/stores/evolution.ts
git commit -m "feat(renderer): add applyProgress to evolution store"
```

---

### Task 10: Update `EvolutionStatusBar` to show apply progress and error actions

**Files:**
- Modify: `src/renderer/src/components/evolution/EvolutionStatusBar.vue`

- [ ] **Step 1: Add apply progress display and retry/skip buttons**

In the `<script setup>` section, add:

```typescript
async function handleRetryPackage() {
  await window.electron.ipcRenderer.invoke("evolution:retry-package");
}

function handleSkipPackage() {
  window.electron.ipcRenderer.invoke("evolution:skip-package");
}
```

In the `<template>`, after the `completedTag` block (after line 173) and before `<div class="flex-1" />`, add:

```html
    <!-- Apply progress -->
    <template v-if="evolutionStore.stage === 'applying' && evolutionStore.applyProgress">
      <div class="ml-4 flex items-center gap-2">
        <span
          class="text-xs"
          :class="evolutionStore.applyProgress.error ? 'text-red-500' : 'text-muted-foreground'"
        >
          {{ evolutionStore.applyProgress.message }}
        </span>
        <template v-if="evolutionStore.applyProgress.error">
          <button
            class="rounded border border-violet-500 px-2 py-0.5 text-xs text-violet-500 hover:bg-violet-500/10"
            @click="handleRetryPackage"
          >
            重试打包
          </button>
          <button
            class="rounded border border-muted-foreground px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            @click="handleSkipPackage"
          >
            跳过打包
          </button>
        </template>
      </div>
    </template>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/evolution/EvolutionStatusBar.vue
git commit -m "feat(renderer): show apply progress and retry/skip in status bar"
```

---

### Task 11: Run full test suite, format, lint

- [ ] **Step 1: Run format**

Run: `pnpm run format`

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Fix any issues.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `pnpm test --run`
Expected: PASS

- [ ] **Step 5: Final commit if format/lint changed anything**

```bash
git add -A
git commit -m "style: format and lint apply stage implementation"
```
