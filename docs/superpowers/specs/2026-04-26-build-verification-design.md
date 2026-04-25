# TASK-021: Build Verification Design

## Goal

System-level build verification before evolution commit. Agent calls `evolution_complete` → system runs `pnpm run typecheck` + `pnpm run build` → fail returns error to Agent (still in agentic loop, can self-fix) → pass proceeds to applying.

## Current Flow

```
Agent coding → Agent calls evolution_complete → completeEvolution(summary, semanticSummary)
  → stage = applying → pendingFinalize prepared
  → agentic loop exits → finalizeEvolution → git add → changelog → commit → tag
```

No system-level build verification. Agent is **prompted** to run typecheck/test/lint but not enforced.

## New Flow

```
Agent coding → Agent calls evolution_complete tool
  → runBuildVerification()
    → pnpm run typecheck → fail? return error to Agent, Agent fixes & retries
    → pnpm run build     → fail? return error to Agent, Agent fixes & retries
  → all pass → completeEvolution(summary, semanticSummary)
  → stage = applying → agentic loop exits → finalizeEvolution → commit → tag
```

## Changes

### 1. `evolutionPresenter.ts` — add `runBuildVerification()`

```typescript
async runBuildVerification(): Promise<{ success: boolean; error?: string }> {
  const cwd = paths.effectiveProjectRoot
  const MAX_OUTPUT = 2000

  // Step 1: typecheck
  const tc = await this.execCommand('pnpm', ['run', 'typecheck'], cwd)
  if (tc.exitCode !== 0) {
    const output = (tc.stderr || tc.stdout).slice(-MAX_OUTPUT)
    return { success: false, error: `typecheck failed:\n${output}` }
  }

  // Step 2: build
  const build = await this.execCommand('pnpm', ['run', 'build'], cwd)
  if (build.exitCode !== 0) {
    const output = (build.stderr || build.stdout).slice(-MAX_OUTPUT)
    return { success: false, error: `build failed:\n${output}` }
  }

  return { success: true }
}

private execCommand(cmd: string, args: string[], cwd: string): Promise<{
  stdout: string; stderr: string; exitCode: number
}> {
  // Use child_process.execFile (no shell), consistent with ToolPresenter pattern
  // Timeout: 5 minutes (build can be slow)
}
```

### 2. `toolPresenter.ts` — gate `evolution_complete` with verification

```typescript
evolution_complete: {
  execute: async ({ summary, rollback_description }) => {
    const verification = await this.evolutionPresenter.runBuildVerification();
    if (!verification.success) {
      return `Build verification failed. Fix the issues and call evolution_complete again:\n${verification.error}`;
    }
    // existing completeEvolution logic unchanged
    const result = await this.evolutionPresenter.completeEvolution(summary, rollback_description);
    return result.success ? `Evolution applying: ${result.tag}` : `Failed: ${result.error}`;
  };
}
```

## Design Decisions

- **Insert point**: Inside `evolution_complete` tool, before `completeEvolution()`. Agent is still in agentic loop and can self-fix on failure.
- **No new state machine stage**: Build verification is a gate within coding→applying transition, not a separate stage.
- **No shell**: `execFile` with array args, consistent with existing security policy.
- **Timeout**: 5 minutes for build (Electron build can be slow).
- **Output truncation**: Last 2000 chars to avoid token explosion in Agent context.
- **No frontend changes**: Existing streaming UI shows Agent activity during verification.

## Files Changed

| File                                                   | Change                                                 |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `src/main/presenter/evolutionPresenter.ts`             | Add `runBuildVerification()` + private `execCommand()` |
| `src/main/presenter/toolPresenter.ts`                  | Gate `evolution_complete` with verification call       |
| `src/shared/types/presenters/evolution.presenter.d.ts` | Add `runBuildVerification()` to interface              |
| `test/main/evolutionPresenter.test.ts`                 | Add verification tests                                 |

## Not Changed

- State machine (stays 4 stages)
- `finalizeEvolution` flow
- Frontend / UI
- System prompt (already asks Agent to verify, now system enforces)
