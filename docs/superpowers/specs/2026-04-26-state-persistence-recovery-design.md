# TASK-026 + 027: State Persistence & Startup Recovery Design

## Overview

Persist EvolutionPresenter's core state to `context.json` so that interrupted evolution tasks can be recovered on app restart. Minimal approach: only persist what's needed, leverage existing SessionPresenter message persistence.

## Data Structure

```typescript
interface EvolutionContext {
  stage: EvolutionStage          // current phase (discuss|coding|applying)
  description: string            // user's evolution request
  plan?: EvolutionPlan           // from discuss phase (coding+ only)
  startCommit: string            // git commit hash at evolution start
  sessionId: string              // associated chat session ID
  createdAt: string              // ISO timestamp
  updatedAt: string              // ISO timestamp
}
```

**Storage**: `paths.contextFile` (`{userData}/.slime/state/context.json`), direct `fs/promises` read/write.

**Not persisted**: `pendingFinalize` (too transient), `rollbackInProgress` (intermediate state), ContentPresenter panel content (pure UI).

## Persistence Integration (TASK-026)

### New private methods in EvolutionPresenter

- `saveState()` — serialize current fields to context.json
- `loadState()` — read context.json, return `EvolutionContext | null`
- `clearState()` — delete context.json

### Trigger points

| Event | Action |
|-------|--------|
| `setStage(stage)` where stage != idle | `saveState()` |
| `submitPlan(plan)` | `saveState()` |
| `reset()` | `clearState()` |

### API changes

- `startEvolution(description, sessionId)` — add `sessionId` param, store as `this.sessionId`
- ToolPresenter `evolution_start` tool: pass `sessionId` from tool execution context
- New public `restoreState(): Promise<EvolutionContext | null>` for startup recovery
- New field `this.sessionId: string | undefined` on EvolutionPresenter

## Startup Recovery (TASK-027)

### Two-phase recovery

**Phase 1 — Main process** (`Presenter.init()`):
- Call `evolutionPresenter.restoreState()`
- Restores internal fields (stage, description, plan, startCommit, sessionId)
- Does NOT emit STAGE_CHANGED event (renderer not ready yet)
- Stores result in `this.pendingRecovery`

**Phase 2 — Renderer request**:
- `EvolutionCenter.vue` onMounted calls `evolutionPresenter.getStatus()`
- If stage != idle, main process pushes recovery InteractionContent via contentPresenter
- Reuses existing ask_user interaction panel (no new component)

### Recovery prompt

```
"Detected incomplete evolution: '{description}'
 Stage: {stage}
 Continue?"

Options:
  - Continue evolution (recommended)
  - Abandon and rollback
```

### Per-stage recovery strategy

| Stage at recovery | Strategy |
|-------------------|----------|
| **discuss** | Restore state + switch to saved sessionId. User continues conversation normally. |
| **coding** | Restore state + switch to sessionId + auto-trigger `agentPresenter.chat(sessionId, resumePrompt, { hidden: true })` |
| **applying** | Same as coding (applying is very brief, almost never interrupted) |

Resume prompt for coding: `"Evolution task interrupted by app restart. Check current code state and continue completing the evolution task."`

### User chooses "abandon"

- Call `cancel()` which rollbacks to startCommit
- `clearState()` removes context.json
- Stage returns to idle

## Edge Cases

| Scenario | Handling |
|----------|----------|
| context.json corrupted | `loadState()` catches, deletes file, normal startup |
| startCommit no longer exists | Validate with `git cat-file -t`, force clear if invalid |
| sessionId's session deleted | Check existence, create new session if missing |
| applying phase interrupted | Treat as coding, agent checks state |
| rollbackInProgress crash | Not persisted, user re-decides after restart |

## Test Plan

### TASK-026 tests (in evolutionPresenter.test.ts)

1. saveState after startEvolution — context.json written with correct fields
2. saveState on submitPlan — context.json includes plan
3. clearState on reset — context.json deleted
4. loadState round-trip — write then read, fields match
5. loadState corrupted file — returns null, file cleaned

### TASK-027 tests (new evolutionRecovery.test.ts)

6. restoreState with valid context.json — internal fields restored
7. restoreState no file — returns null, stage stays idle
8. recovery continue discuss — stage correctly set
9. recovery continue coding — triggers agent chat
10. recovery abandon — rollback to startCommit, state cleared

## Not in scope

- No automatic recovery (always ask user)
- No persisting ContentPresenter panel content
- No persisting agent mid-loop state (unreliable)
- No new UI components (reuse ask_user InteractionContent)
