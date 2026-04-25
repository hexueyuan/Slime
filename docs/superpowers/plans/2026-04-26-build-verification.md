# Build Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** System-level typecheck + build verification gating `evolution_complete`, so Agent cannot commit broken code.

**Architecture:** Add `runBuildVerification()` to EvolutionPresenter that runs `pnpm run typecheck` and `pnpm run build` via `execFile`. Gate `evolution_complete` tool in ToolPresenter to call verification before `completeEvolution()`. On failure, error returns to Agent who can fix and retry.

**Tech Stack:** Node.js `child_process.execFile`, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/presenter/evolutionPresenter.ts` | Modify | Add `runBuildVerification()` + private `execCommand()` |
| `src/main/presenter/toolPresenter.ts` | Modify | Gate `evolution_complete` with verification |
| `src/shared/types/presenters/evolution.presenter.d.ts` | Modify | Add `runBuildVerification()` to interface |
| `test/main/evolutionPresenter.test.ts` | Modify | Add verification tests |

---

### Task 1: Add `runBuildVerification()` to EvolutionPresenter

**Files:**
- Modify: `src/main/presenter/evolutionPresenter.ts`
- Modify: `src/shared/types/presenters/evolution.presenter.d.ts`
- Modify: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests at the bottom of the `describe("EvolutionPresenter")` block in `test/main/evolutionPresenter.test.ts`:

```typescript
// --- Build verification tests ---

it("runBuildVerification returns success when typecheck and build pass", async () => {
  const git = mockGit();
  evo = new EvolutionPresenter(git, mockConfig());

  // Mock execFile to succeed
  const { execFile } = await import("child_process");
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    cb(null, { stdout: "ok", stderr: "" });
    return {} as any;
  });

  const result = await evo.runBuildVerification();
  expect(result.success).toBe(true);
  expect(result.error).toBeUndefined();
});

it("runBuildVerification returns error when typecheck fails", async () => {
  const git = mockGit();
  evo = new EvolutionPresenter(git, mockConfig());

  const { execFile } = await import("child_process");
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    const err: any = new Error("typecheck error");
    err.stdout = "";
    err.stderr = "error TS2345: Argument of type 'string' is not assignable";
    err.code = 1;
    cb(err);
    return {} as any;
  });

  const result = await evo.runBuildVerification();
  expect(result.success).toBe(false);
  expect(result.error).toContain("typecheck failed");
  expect(result.error).toContain("TS2345");
});

it("runBuildVerification returns error when build fails after typecheck passes", async () => {
  const git = mockGit();
  evo = new EvolutionPresenter(git, mockConfig());

  let callCount = 0;
  const { execFile } = await import("child_process");
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    callCount++;
    if (callCount === 1) {
      // typecheck passes
      cb(null, { stdout: "ok", stderr: "" });
    } else {
      // build fails
      const err: any = new Error("build error");
      err.stdout = "Build failed: Cannot find module";
      err.stderr = "";
      err.code = 1;
      cb(err);
    }
    return {} as any;
  });

  const result = await evo.runBuildVerification();
  expect(result.success).toBe(false);
  expect(result.error).toContain("build failed");
  expect(result.error).toContain("Cannot find module");
});

it("runBuildVerification truncates long error output", async () => {
  const git = mockGit();
  evo = new EvolutionPresenter(git, mockConfig());

  const { execFile } = await import("child_process");
  const longOutput = "x".repeat(5000);
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb: any) => {
    const err: any = new Error("fail");
    err.stdout = "";
    err.stderr = longOutput;
    err.code = 1;
    cb(err);
    return {} as any;
  });

  const result = await evo.runBuildVerification();
  expect(result.success).toBe(false);
  // Output should be truncated to MAX_OUTPUT (2000 chars) + label
  expect(result.error!.length).toBeLessThan(2100);
});
```

Also add the `child_process` mock at the top of the test file, after the existing `vi.mock` calls:

```typescript
vi.mock("child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));
```

And add the import:

```typescript
import { execFile } from "child_process";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`

Expected: 4 new tests FAIL because `runBuildVerification` does not exist yet.

- [ ] **Step 3: Add interface declaration**

In `src/shared/types/presenters/evolution.presenter.d.ts`, add `runBuildVerification` to the interface:

```typescript
import type {
  EvolutionStatus,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
} from "../evolution";

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus;
  getHistory(): Promise<EvolutionNode[]>;
  cancel(): Promise<boolean>;
  restart(): void;
  checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }>;
  readArchive(tag: string): Promise<EvolutionArchive | null>;
  runBuildVerification(): Promise<{ success: boolean; error?: string }>;
}
```

- [ ] **Step 4: Implement `runBuildVerification()` and private `execCommand()`**

In `src/main/presenter/evolutionPresenter.ts`, add the import at the top:

```typescript
import { execFile } from "child_process";
```

Add these two methods to the `EvolutionPresenter` class, before the `// --- Archive CRUD ---` comment:

```typescript
  async runBuildVerification(): Promise<{ success: boolean; error?: string }> {
    const cwd = paths.effectiveProjectRoot;
    const MAX_OUTPUT = 2000;

    logger.info("Running build verification: typecheck");
    const tc = await this.execCommand("pnpm", ["run", "typecheck"], cwd);
    if (tc.exitCode !== 0) {
      const output = (tc.stderr || tc.stdout).slice(-MAX_OUTPUT);
      logger.warn("Build verification failed: typecheck", { exitCode: tc.exitCode });
      return { success: false, error: `typecheck failed:\n${output}` };
    }

    logger.info("Running build verification: build");
    const build = await this.execCommand("pnpm", ["run", "build"], cwd);
    if (build.exitCode !== 0) {
      const output = (build.stderr || build.stdout).slice(-MAX_OUTPUT);
      logger.warn("Build verification failed: build", { exitCode: build.exitCode });
      return { success: false, error: `build failed:\n${output}` };
    }

    logger.info("Build verification passed");
    return { success: true };
  }

  private execCommand(
    cmd: string,
    args: string[],
    cwd: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      execFile(cmd, args, { cwd, timeout: 300_000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
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
      });
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- test/main/evolutionPresenter.test.ts`

Expected: All tests PASS including the 4 new build verification tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts src/shared/types/presenters/evolution.presenter.d.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): add runBuildVerification with typecheck + build"
```

---

### Task 2: Gate `evolution_complete` with build verification

**Files:**
- Modify: `src/main/presenter/toolPresenter.ts`

- [ ] **Step 1: Modify `evolution_complete` execute function**

In `src/main/presenter/toolPresenter.ts`, replace the `evolution_complete` tool's `execute` function (lines 191-200):

Current code:
```typescript
        execute: async ({ summary, rollback_description }) => {
          const result = await this.evolutionPresenter.completeEvolution(
            summary,
            rollback_description,
          );
          if (result.success) {
            return `Evolution complete! Tagged as ${result.tag}. Restart to see changes.`;
          }
          return `Apply failed: ${result.error}. Fix the issue and try again.`;
        },
```

Replace with:
```typescript
        execute: async ({ summary, rollback_description }) => {
          const verification = await this.evolutionPresenter.runBuildVerification();
          if (!verification.success) {
            return `Build verification failed. Fix the issues and call evolution_complete again:\n${verification.error}`;
          }
          const result = await this.evolutionPresenter.completeEvolution(
            summary,
            rollback_description,
          );
          if (result.success) {
            return `Evolution complete! Tagged as ${result.tag}. Restart to see changes.`;
          }
          return `Apply failed: ${result.error}. Fix the issue and try again.`;
        },
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: All tests PASS.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/toolPresenter.ts
git commit -m "feat(evolution): gate evolution_complete with build verification"
```
