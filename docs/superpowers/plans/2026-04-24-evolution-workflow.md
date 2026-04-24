# Evolution Workflow Minimal Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement discuss → coding → apply evolution loop with rollback, enabling Slime to self-evolve via AI Agent.

**Architecture:** EvolutionPresenter manages stage state machine (idle→discuss→coding→applying) and CHANGELOG-based node history. GitPresenter provides real git operations. Agent tools (evolution_start/plan/complete) drive stage transitions with code-level gates. ask_user is reworked to render a unified interaction panel (Quiz + optional HTML preview) in the function area.

**Tech Stack:** TypeScript, Electron IPC (Presenter pattern), Vue 3 Composition API, Pinia, Vitest, child_process.spawn (no shell:true)

---

## File Structure

### New Files
- `src/shared/types/evolution.d.ts` — evolution stage, node, plan types
- `src/shared/types/presenters/evolution.presenter.d.ts` — IEvolutionPresenter interface
- `src/main/presenter/evolutionPresenter.ts` — stage state machine + CHANGELOG + apply flow
- `src/renderer/src/stores/evolution.ts` — evolution state store + IPC listeners
- `src/renderer/src/components/function/EvolutionPanel.vue` — replaces WorkflowPanel
- `src/renderer/src/components/function/renderers/InteractionRenderer.vue` — unified Quiz + Preview
- `test/main/evolutionPresenter.test.ts` — unit tests
- `test/main/gitPresenter.test.ts` — unit tests
- `test/renderer/stores/evolution.test.ts` — store tests
- `test/renderer/components/renderers/InteractionRenderer.test.ts` — component tests
- `test/renderer/components/EvolutionPanel.test.ts` — component tests

### Modified Files
- `src/shared/types/presenters/git.presenter.d.ts` — expand IGitPresenter
- `src/shared/types/presenters/index.d.ts` — add IEvolutionPresenter, update IPresenter
- `src/shared/events.ts` — add EVOLUTION_EVENTS.COMPLETED, remove WORKFLOW_EVENTS
- `src/shared/types/content.d.ts` — add InteractionContent type
- `src/main/presenter/gitPresenter.ts` — real git implementation
- `src/main/presenter/toolPresenter.ts` — remove workflow/step tools, add evolution tools, rework ask_user
- `src/main/presenter/agentPresenter.ts` — pass evolutionPresenter, rework ask_user handling
- `src/main/presenter/systemPrompt.ts` — stage-aware prompt building
- `src/main/presenter/index.ts` — wire EvolutionPresenter, remove WorkflowPresenter
- `src/renderer/src/components/function/FunctionPanel.vue` — swap WorkflowPanel → EvolutionPanel, swap ContentDispatcher
- `src/renderer/src/views/EvolutionCenter.vue` — setup evolution store IPC
- `src/renderer/src/stores/chat.ts` — rework ask_user to use InteractionContent

### Deleted Files
- `src/main/presenter/workflowPresenter.ts`
- `src/shared/types/workflow.d.ts`
- `src/renderer/src/stores/workflow.ts`
- `src/renderer/src/components/function/WorkflowPanel.vue`
- `src/renderer/src/components/function/renderers/QuizRenderer.vue`
- `src/renderer/src/components/function/renderers/PreviewRenderer.vue`
- `test/main/workflowPresenter.test.ts` (if exists)
- `test/renderer/stores/workflow.test.ts` (if exists)

---

## Task 1: Shared Types — Evolution Types + Updated Interfaces

**Files:**
- Create: `src/shared/types/evolution.d.ts`
- Modify: `src/shared/types/presenters/git.presenter.d.ts`
- Create: `src/shared/types/presenters/evolution.presenter.d.ts`
- Modify: `src/shared/types/presenters/index.d.ts`
- Modify: `src/shared/events.ts`
- Modify: `src/shared/types/content.d.ts`
- Delete: `src/shared/types/workflow.d.ts`

- [ ] **Step 1: Create evolution types**

```typescript
// src/shared/types/evolution.d.ts
export type EvolutionStage = "idle" | "discuss" | "coding" | "applying"

export interface EvolutionPlan {
  scope: string[]
  changes: string[]
  risks?: string[]
}

export interface EvolutionNode {
  id: string
  tag: string
  description: string
  request: string
  changes: string[]
  createdAt: string
  gitRef: string
  parent?: string
}

export interface EvolutionStatus {
  stage: EvolutionStage
  description?: string
  plan?: EvolutionPlan
  startCommit?: string
}
```

- [ ] **Step 2: Expand IGitPresenter**

Replace `src/shared/types/presenters/git.presenter.d.ts`:

```typescript
export interface IGitPresenter {
  tag(name: string, message: string): Promise<boolean>
  listTags(pattern?: string): Promise<string[]>
  getCurrentCommit(): Promise<string>
  rollbackToRef(ref: string): Promise<boolean>
  addAndCommit(message: string, files?: string[]): Promise<boolean>
  getChangedFiles(fromRef: string, toRef?: string): Promise<string[]>
}
```

- [ ] **Step 3: Create IEvolutionPresenter**

```typescript
// src/shared/types/presenters/evolution.presenter.d.ts
import type { EvolutionStatus, EvolutionNode } from "../evolution"

export interface IEvolutionPresenter {
  getStatus(): EvolutionStatus
  getHistory(): Promise<EvolutionNode[]>
  cancel(): Promise<boolean>
  rollback(tag: string): Promise<boolean>
  restart(): void
}
```

- [ ] **Step 4: Update presenters/index.d.ts**

Add IEvolutionPresenter import/export, replace IWorkflowPresenter references with IEvolutionPresenter in IPresenter:

```typescript
// Add to imports/exports:
export type { IEvolutionPresenter } from "./evolution.presenter"
export type { EvolutionStatus, EvolutionNode, EvolutionStage, EvolutionPlan } from "../evolution"

// In IPresenter interface, replace workflowPresenter line:
// Remove: (no workflowPresenter existed here — it was private)
// Add:
evolutionPresenter: IEvolutionPresenter
```

- [ ] **Step 5: Update events.ts**

Remove `WORKFLOW_EVENTS`, add `EVOLUTION_EVENTS.COMPLETED`:

```typescript
// Remove:
export const WORKFLOW_EVENTS = {
  UPDATED: "workflow:updated",
  STEP_UPDATED: "workflow:step-updated",
} as const;

// Replace EVOLUTION_EVENTS:
export const EVOLUTION_EVENTS = {
  STAGE_CHANGED: "evolution:stage-changed",
  PROGRESS: "evolution:progress",
  COMPLETED: "evolution:completed",
} as const;
```

- [ ] **Step 6: Add InteractionContent to content.d.ts**

Append to `src/shared/types/content.d.ts`:

```typescript
export interface InteractionOption {
  value: string
  label: string
  recommended?: boolean
}

export interface InteractionContent {
  type: "interaction"
  question: string
  options: InteractionOption[]
  multiple?: boolean
  htmlFile?: string
  htmlContent?: string
}
```

Update the type unions:

```typescript
export type FunctionContentType = "quiz" | "preview" | "markdown" | "progress" | "interaction"
export type FunctionContent =
  | QuizContent
  | PreviewContent
  | MarkdownContent
  | ProgressContent
  | InteractionContent
```

- [ ] **Step 7: Delete workflow.d.ts**

```bash
git rm src/shared/types/workflow.d.ts
```

- [ ] **Step 8: Run typecheck (expect errors — dependents not yet updated)**

```bash
pnpm run typecheck 2>&1 | head -30
```

Expected: errors in files importing workflow types or WorkflowPresenter. This is expected — we fix them in subsequent tasks.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/evolution.d.ts src/shared/types/presenters/evolution.presenter.d.ts src/shared/types/presenters/git.presenter.d.ts src/shared/types/presenters/index.d.ts src/shared/events.ts src/shared/types/content.d.ts
git rm src/shared/types/workflow.d.ts
git commit -m "feat(shared): add evolution types, expand git/content interfaces, remove workflow types"
```

---

## Task 2: GitPresenter — Real Implementation

**Files:**
- Modify: `src/main/presenter/gitPresenter.ts`
- Create: `test/main/gitPresenter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/main/gitPresenter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GitPresenter } from "../../src/main/presenter/gitPresenter"

// Mock child_process.spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

import { spawn } from "child_process"
import { EventEmitter } from "events"

function mockSpawn(stdout: string, exitCode = 0) {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  const mockSpawnFn = spawn as unknown as ReturnType<typeof vi.fn>
  mockSpawnFn.mockReturnValueOnce(proc)
  setTimeout(() => {
    if (stdout) proc.stdout.emit("data", Buffer.from(stdout))
    proc.emit("close", exitCode)
  }, 0)
  return proc
}

describe("GitPresenter", () => {
  let git: GitPresenter

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitPresenter("/tmp/test-repo")
  })

  it("getCurrentCommit returns trimmed hash", async () => {
    mockSpawn("abc123def\n")
    const result = await git.getCurrentCommit()
    expect(result).toBe("abc123def")
    expect(spawn).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], { cwd: "/tmp/test-repo" })
  })

  it("tag creates annotated tag", async () => {
    mockSpawn("")
    const result = await git.tag("v1.0", "release")
    expect(result).toBe(true)
    expect(spawn).toHaveBeenCalledWith("git", ["tag", "-a", "v1.0", "-m", "release"], {
      cwd: "/tmp/test-repo",
    })
  })

  it("listTags returns parsed list", async () => {
    mockSpawn("v0.2\nv0.1\n")
    const result = await git.listTags("egg-*")
    expect(result).toEqual(["v0.2", "v0.1"])
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["tag", "-l", "egg-*", "--sort=-creatordate"],
      { cwd: "/tmp/test-repo" },
    )
  })

  it("addAndCommit stages and commits", async () => {
    mockSpawn("") // git add
    mockSpawn("") // git commit
    const result = await git.addAndCommit("feat: test")
    expect(result).toBe(true)
  })

  it("getChangedFiles returns file list", async () => {
    mockSpawn("src/a.ts\nsrc/b.ts\n")
    const result = await git.getChangedFiles("abc123")
    expect(result).toEqual(["src/a.ts", "src/b.ts"])
  })

  it("rollbackToRef checks out and commits", async () => {
    mockSpawn("") // git checkout
    mockSpawn("") // git commit
    const result = await git.rollbackToRef("abc123")
    expect(result).toBe(true)
  })

  it("returns false on spawn failure", async () => {
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    ;(spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc)
    setTimeout(() => {
      proc.stderr.emit("data", Buffer.from("fatal: error"))
      proc.emit("close", 128)
    }, 0)
    const result = await git.tag("v1.0", "msg")
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test test/main/gitPresenter.test.ts
```

Expected: FAIL — GitPresenter constructor doesn't accept cwd, methods not implemented.

- [ ] **Step 3: Implement GitPresenter**

Replace `src/main/presenter/gitPresenter.ts`:

```typescript
import type { IGitPresenter } from "@shared/types/presenters"
import { spawn } from "child_process"
import { logger } from "@/utils"

export class GitPresenter implements IGitPresenter {
  constructor(private cwd: string) {}

  async tag(name: string, message: string): Promise<boolean> {
    const { exitCode } = await this.run("git", ["tag", "-a", name, "-m", message])
    return exitCode === 0
  }

  async listTags(pattern?: string): Promise<string[]> {
    const args = ["tag", "-l"]
    if (pattern) args.push(pattern)
    args.push("--sort=-creatordate")
    const { stdout, exitCode } = await this.run("git", args)
    if (exitCode !== 0) return []
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  }

  async getCurrentCommit(): Promise<string> {
    const { stdout } = await this.run("git", ["rev-parse", "HEAD"])
    return stdout.trim()
  }

  async rollbackToRef(ref: string): Promise<boolean> {
    const checkout = await this.run("git", ["checkout", ref, "--", "."])
    if (checkout.exitCode !== 0) return false
    const commit = await this.run("git", ["commit", "-m", `rollback to ${ref}`])
    return commit.exitCode === 0
  }

  async addAndCommit(message: string, files?: string[]): Promise<boolean> {
    const addArgs = files && files.length > 0 ? ["add", ...files] : ["add", "-A"]
    const add = await this.run("git", addArgs)
    if (add.exitCode !== 0) return false
    const commit = await this.run("git", ["commit", "-m", message])
    return commit.exitCode === 0
  }

  async getChangedFiles(fromRef: string, toRef?: string): Promise<string[]> {
    const range = toRef ? `${fromRef}..${toRef}` : `${fromRef}..HEAD`
    const { stdout, exitCode } = await this.run("git", ["diff", "--name-only", range])
    if (exitCode !== 0) return []
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
  }

  private run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd: this.cwd })
      let stdout = ""
      let stderr = ""
      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
      proc.on("close", (code) => {
        if (code !== 0) logger.warn("git command failed", { cmd, args, stderr, code })
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      })
      proc.on("error", (err) => {
        logger.error("git spawn error", { cmd, args, error: err.message })
        resolve({ stdout, stderr, exitCode: 1 })
      })
    })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test test/main/gitPresenter.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/gitPresenter.ts test/main/gitPresenter.test.ts
git commit -m "feat(git): implement GitPresenter with real git operations"
```

---

## Task 3: EvolutionPresenter — Stage Machine + CHANGELOG + Apply

**Files:**
- Create: `src/main/presenter/evolutionPresenter.ts`
- Create: `test/main/evolutionPresenter.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/main/evolutionPresenter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}))

vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test" },
}))

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter"
import { eventBus } from "@/eventbus"

function mockGit() {
  return {
    tag: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
    rollbackToRef: vi.fn().mockResolvedValue(true),
    addAndCommit: vi.fn().mockResolvedValue(true),
    getChangedFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
  } as any
}

function mockConfig() {
  return {
    get: vi.fn().mockReturnValue("testuser"),
  } as any
}

describe("EvolutionPresenter", () => {
  let evo: EvolutionPresenter

  beforeEach(() => {
    vi.clearAllMocks()
    evo = new EvolutionPresenter(mockGit(), mockConfig())
  })

  it("starts in idle stage", () => {
    expect(evo.getStatus().stage).toBe("idle")
  })

  it("startEvolution transitions to discuss", () => {
    const result = evo.startEvolution("add dark mode")
    expect(result).toBe(true)
    expect(evo.getStatus().stage).toBe("discuss")
    expect(evo.getStatus().description).toBe("add dark mode")
    expect(eventBus.sendToRenderer).toHaveBeenCalled()
  })

  it("startEvolution rejects when not idle", () => {
    evo.startEvolution("first")
    const result = evo.startEvolution("second")
    expect(result).toBe(false)
    expect(evo.getStatus().stage).toBe("discuss")
  })

  it("submitPlan transitions discuss → coding", () => {
    evo.startEvolution("test")
    const result = evo.submitPlan({ scope: ["src/a.ts"], changes: ["modify a"] })
    expect(result).toBe(true)
    expect(evo.getStatus().stage).toBe("coding")
  })

  it("submitPlan rejects when not in discuss", () => {
    const result = evo.submitPlan({ scope: [], changes: [] })
    expect(result).toBe(false)
  })

  it("completeEvolution runs apply flow", async () => {
    const git = mockGit()
    evo = new EvolutionPresenter(git, mockConfig())
    evo.startEvolution("test change")
    evo.submitPlan({ scope: ["src/a.ts"], changes: ["modify a"] })
    const result = await evo.completeEvolution("did the thing")
    expect(result.success).toBe(true)
    expect(evo.getStatus().stage).toBe("idle")
    expect(git.addAndCommit).toHaveBeenCalled()
    expect(git.tag).toHaveBeenCalled()
  })

  it("completeEvolution rejects when not in coding", async () => {
    const result = await evo.completeEvolution("nope")
    expect(result.success).toBe(false)
  })

  it("cancel resets to idle", async () => {
    const git = mockGit()
    evo = new EvolutionPresenter(git, mockConfig())
    evo.startEvolution("test")
    const result = await evo.cancel()
    expect(result).toBe(true)
    expect(evo.getStatus().stage).toBe("idle")
  })

  it("cancel with code changes does git reset", async () => {
    const git = mockGit()
    evo = new EvolutionPresenter(git, mockConfig())
    evo.startEvolution("test")
    evo.submitPlan({ scope: ["a"], changes: ["b"] })
    await evo.cancel()
    expect(git.rollbackToRef).toHaveBeenCalledWith("abc123")
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test test/main/evolutionPresenter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement EvolutionPresenter**

```typescript
// src/main/presenter/evolutionPresenter.ts
import type { IEvolutionPresenter } from "@shared/types/presenters"
import type { EvolutionStage, EvolutionStatus, EvolutionPlan, EvolutionNode } from "@shared/types/evolution"
import type { GitPresenter } from "./gitPresenter"
import type { ConfigPresenter } from "./configPresenter"
import { EVOLUTION_EVENTS } from "@shared/events"
import { eventBus } from "@/eventbus"
import { logger, paths } from "@/utils"
import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { app } from "electron"

const CHANGELOG_FILE = "CHANGELOG.slime.md"

export class EvolutionPresenter implements IEvolutionPresenter {
  private stage: EvolutionStage = "idle"
  private description?: string
  private plan?: EvolutionPlan
  private startCommit?: string

  constructor(
    private git: GitPresenter,
    private config: ConfigPresenter,
  ) {}

  getStatus(): EvolutionStatus {
    return {
      stage: this.stage,
      description: this.description,
      plan: this.plan,
      startCommit: this.startCommit,
    }
  }

  startEvolution(description: string): boolean {
    if (this.stage !== "idle") return false
    this.description = description
    this.setStage("discuss")
    // Record start commit for cancel/rollback
    this.git.getCurrentCommit().then((ref) => { this.startCommit = ref })
    return true
  }

  submitPlan(plan: EvolutionPlan): boolean {
    if (this.stage !== "discuss") return false
    this.plan = plan
    this.setStage("coding")
    return true
  }

  async completeEvolution(summary: string): Promise<{ success: boolean; error?: string; tag?: string }> {
    if (this.stage !== "coding") return { success: false, error: "Not in coding stage" }
    this.setStage("applying")

    try {
      // 1. Get changed files
      const changedFiles = this.startCommit
        ? await this.git.getChangedFiles(this.startCommit)
        : []

      // 2. Generate tag name
      const tagName = await this.nextTagName()

      // 3. Update CHANGELOG
      await this.appendChangelog(tagName, summary, changedFiles)

      // 4. git add + commit
      const committed = await this.git.addAndCommit(`evo: ${summary}`)
      if (!committed) throw new Error("git commit failed")

      // 5. git tag
      const tagged = await this.git.tag(tagName, summary)
      if (!tagged) throw new Error("git tag failed")

      // 6. Reset state
      this.reset()
      eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, tagName, summary)
      logger.info("Evolution completed", { tag: tagName, summary })
      return { success: true, tag: tagName }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error("Evolution apply failed", { error })
      this.setStage("coding") // Fall back to coding
      return { success: false, error }
    }
  }

  async cancel(): Promise<boolean> {
    if (this.stage === "idle") return false
    // If in coding/applying, reset code changes
    if ((this.stage === "coding" || this.stage === "applying") && this.startCommit) {
      await this.git.rollbackToRef(this.startCommit)
    }
    this.reset()
    logger.info("Evolution cancelled")
    return true
  }

  async rollback(tag: string): Promise<boolean> {
    if (this.stage !== "idle") return false
    const result = await this.git.rollbackToRef(tag)
    if (result) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle")
      logger.info("Rolled back to", { tag })
    }
    return result
  }

  async getHistory(): Promise<EvolutionNode[]> {
    const tags = await this.git.listTags("egg-*")
    return tags.map((tag, i) => ({
      id: tag,
      tag,
      description: tag,
      request: "",
      changes: [],
      createdAt: "",
      gitRef: tag,
      parent: tags[i + 1],
    }))
  }

  restart(): void {
    if (app.isPackaged) {
      logger.warn("Packaged mode restart not yet implemented")
      return
    }
    logger.info("Restart requested (dev mode — user should restart dev server)")
    // In dev mode, signal the renderer that restart is needed
    eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, "restart-needed", "")
  }

  private setStage(stage: EvolutionStage): void {
    this.stage = stage
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, stage)
  }

  private reset(): void {
    this.stage = "idle"
    this.description = undefined
    this.plan = undefined
    this.startCommit = undefined
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle")
  }

  private async nextTagName(): Promise<string> {
    const user = this.config.get("evolution.user") || "dev"
    const tags = await this.git.listTags("egg-v0.1-*")
    const maxSeq = tags.reduce((max, t) => {
      const m = t.match(/\.(\d+)$/)
      return m ? Math.max(max, parseInt(m[1])) : max
    }, 0)
    return `egg-v0.1-${user}.${maxSeq + 1}`
  }

  private async appendChangelog(tag: string, summary: string, changedFiles: string[]): Promise<void> {
    const filePath = join(paths.effectiveProjectRoot, CHANGELOG_FILE)
    let existing = ""
    try {
      existing = await readFile(filePath, "utf-8")
    } catch {
      existing = "# Slime Evolution Changelog\n\n"
    }

    const date = new Date().toISOString().split("T")[0]
    const changesSection = changedFiles.length > 0
      ? changedFiles.map((f) => `- ${f}`).join("\n")
      : "- (no file changes recorded)"

    const entry = `## [${tag}] - ${date}

### Evolution
- Request: "${this.description || ""}"
- Summary: ${summary}
- Status: Success

### Changes
${changesSection}

---

`
    // Insert after header line
    const headerEnd = existing.indexOf("\n\n")
    if (headerEnd > -1) {
      const header = existing.slice(0, headerEnd + 2)
      const rest = existing.slice(headerEnd + 2)
      await writeFile(filePath, header + entry + rest, "utf-8")
    } else {
      await writeFile(filePath, existing + "\n" + entry, "utf-8")
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test test/main/evolutionPresenter.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/evolutionPresenter.ts test/main/evolutionPresenter.test.ts
git commit -m "feat(evolution): add EvolutionPresenter with stage machine and CHANGELOG"
```

---

## Task 4: ToolPresenter — Remove Old Tools, Add Evolution Tools, Rework ask_user

**Files:**
- Modify: `src/main/presenter/toolPresenter.ts`
- Create: `test/main/toolPresenter.evolution.test.ts`

- [ ] **Step 1: Write failing tests for new tools**

```typescript
// test/main/toolPresenter.evolution.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/utils", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test" },
}))

vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, cb) => cb(null, "", "")),
}))

import { ToolPresenter } from "../../src/main/presenter/toolPresenter"

function mockFile() {
  return { read: vi.fn(), write: vi.fn(), edit: vi.fn() } as any
}

function mockContent() {
  return { openFile: vi.fn() } as any
}

function mockEvolution() {
  return {
    startEvolution: vi.fn().mockReturnValue(true),
    submitPlan: vi.fn().mockReturnValue(true),
    completeEvolution: vi.fn().mockResolvedValue({ success: true, tag: "egg-v0.1-dev.1" }),
    getStatus: vi.fn().mockReturnValue({ stage: "idle" }),
  } as any
}

describe("ToolPresenter evolution tools", () => {
  let tp: ToolPresenter

  beforeEach(() => {
    tp = new ToolPresenter(mockFile(), mockContent(), mockEvolution())
  })

  it("has evolution_start tool", () => {
    const tools = tp.getToolSet("s1")
    expect(tools).toHaveProperty("evolution_start")
  })

  it("has evolution_plan tool", () => {
    const tools = tp.getToolSet("s1")
    expect(tools).toHaveProperty("evolution_plan")
  })

  it("has evolution_complete tool", () => {
    const tools = tp.getToolSet("s1")
    expect(tools).toHaveProperty("evolution_complete")
  })

  it("does NOT have workflow_edit tool", () => {
    const tools = tp.getToolSet("s1")
    expect(tools).not.toHaveProperty("workflow_edit")
  })

  it("does NOT have step_update tool", () => {
    const tools = tp.getToolSet("s1")
    expect(tools).not.toHaveProperty("step_update")
  })

  it("evolution_start calls presenter", async () => {
    const evo = mockEvolution()
    tp = new ToolPresenter(mockFile(), mockContent(), evo)
    await tp.callTool("s1", "evolution_start", { description: "test" })
    expect(evo.startEvolution).toHaveBeenCalledWith("test")
  })

  it("evolution_complete calls presenter", async () => {
    const evo = mockEvolution()
    tp = new ToolPresenter(mockFile(), mockContent(), evo)
    await tp.callTool("s1", "evolution_complete", { summary: "done" })
    expect(evo.completeEvolution).toHaveBeenCalledWith("done")
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm test test/main/toolPresenter.evolution.test.ts
```

Expected: FAIL — constructor signature mismatch, tools not found.

- [ ] **Step 3: Rewrite ToolPresenter**

Replace `src/main/presenter/toolPresenter.ts` — remove workflow/step tools, change constructor to accept EvolutionPresenter instead of WorkflowPresenter, add evolution_start/evolution_plan/evolution_complete, rework ask_user parameters:

```typescript
import { tool } from "ai"
import { z } from "zod"
import { exec as execCb } from "child_process"
import { promisify } from "util"
import type { FilePresenter } from "./filePresenter"
import type { EvolutionPresenter } from "./evolutionPresenter"
import type { ContentPresenter } from "./contentPresenter"
import { logger, paths } from "@/utils"

const execAsync = promisify(execCb)

const EXEC_BLOCKED_PATTERNS: [RegExp, string][] = [
  [/(?:^|\s)\//, "absolute paths are not allowed"],
  [/rm\s+(-[^\s]*\s+)*\.git/, "cannot delete .git"],
  [/rm\s+(-[^\s]*\s+)*node_modules/, "cannot delete node_modules"],
  [/curl\s.*\|\s*(?:sh|bash)/, "piping curl to shell is not allowed"],
  [/wget\b/, "wget is not allowed"],
]

function validateCommand(command: string): void {
  for (const [pattern, reason] of EXEC_BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked: ${reason} — "${command}"`)
    }
  }
}

function createTool(config: {
  description: string
  parameters: z.ZodObject<any>
  execute: (...args: any[]) => Promise<any>
}) {
  return tool({
    description: config.description,
    inputSchema: config.parameters,
    execute: config.execute,
  } as any)
}

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private contentPresenter: ContentPresenter,
    private evolutionPresenter: EvolutionPresenter,
  ) {}

  getToolSet(sessionId: string) {
    return {
      read: createTool({
        description: "Read a file. Path is relative to project root.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          offset: z.number().int().min(0).optional().describe("Start line (0-based)"),
          limit: z.number().int().positive().optional().describe("Number of lines to read"),
        }),
        execute: async ({ path, offset, limit }) => {
          return this.filePresenter.read(path, offset, limit)
        },
      }),
      write: createTool({
        description: "Write/create a file (full overwrite). Auto-creates directories.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          content: z.string().describe("Complete file content"),
        }),
        execute: async ({ path, content }) => {
          const ok = await this.filePresenter.write(path, content)
          return ok ? `Written to ${path}` : `Failed to write ${path}`
        },
      }),
      edit: createTool({
        description:
          "Find and replace text in a file. old_text must match exactly once in the file.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          old_text: z.string().describe("Exact text to find (must be unique)"),
          new_text: z.string().describe("Replacement text"),
        }),
        execute: async ({ path, old_text, new_text }) => {
          const ok = await this.filePresenter.edit(path, old_text, new_text)
          return ok ? `Edited ${path}` : `Failed to edit ${path}`
        },
      }),
      exec: createTool({
        description: "Execute a shell command in the project root directory.",
        parameters: z.object({
          command: z.string().min(1).describe("Shell command to execute"),
          timeout_ms: z
            .number()
            .int()
            .positive()
            .optional()
            .default(30000)
            .describe("Timeout in milliseconds"),
        }),
        execute: async ({ command, timeout_ms }) => {
          validateCommand(command)
          const cwd = paths.effectiveProjectRoot
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout: timeout_ms,
              maxBuffer: 1024 * 1024,
            })
            return { stdout, stderr, exit_code: 0 }
          } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string; message?: string; code?: number }
            return {
              stdout: e.stdout || "",
              stderr: e.stderr || e.message || "",
              exit_code: e.code ?? 1,
            }
          }
        },
      }),
      ask_user: createTool({
        description:
          "Ask the user a question with options. Renders in the function panel. Optionally include an HTML file for preview above options.",
        parameters: z.object({
          question: z.string().describe("The question to ask"),
          options: z
            .array(
              z.object({
                label: z.string(),
                value: z.string(),
                recommended: z.boolean().optional(),
              }),
            )
            .min(1)
            .describe("Choice options"),
          multiple: z.boolean().optional().default(false).describe("Allow multiple selection"),
          html_file: z
            .string()
            .optional()
            .describe("Optional HTML file path (relative) to show above options"),
        }),
        execute: async () => {
          throw new Error("ask_user should be handled by AgentPresenter")
        },
      }),
      open: createTool({
        description:
          "Open a file in the preview panel. Supports .md (Markdown), .html (HTML preview), and other text files.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
        }),
        execute: async ({ path }) => {
          await this.contentPresenter.openFile(sessionId, path)
          return `Opened ${path} in preview panel`
        },
      }),
      evolution_start: createTool({
        description:
          "Start an evolution. Transitions to discuss stage. Must be in idle stage.",
        parameters: z.object({
          description: z.string().describe("User's evolution request"),
        }),
        execute: async ({ description }) => {
          const ok = this.evolutionPresenter.startEvolution(description)
          return ok
            ? "Evolution started. You are now in discuss stage. Clarify requirements with ask_user before calling evolution_plan."
            : "Cannot start: another evolution is in progress."
        },
      }),
      evolution_plan: createTool({
        description:
          "Submit the evolution plan. Transitions from discuss to coding stage. Must be in discuss stage.",
        parameters: z.object({
          scope: z.array(z.string()).describe("Files/modules affected"),
          changes: z.array(z.string()).describe("What will be changed"),
          risks: z.array(z.string()).optional().describe("Potential risks"),
        }),
        execute: async ({ scope, changes, risks }) => {
          const ok = this.evolutionPresenter.submitPlan({ scope, changes, risks })
          return ok
            ? "Plan submitted. You are now in coding stage. Implement the changes and call evolution_complete when done."
            : "Cannot submit plan: not in discuss stage."
        },
      }),
      evolution_complete: createTool({
        description:
          "Complete the evolution. Triggers apply flow (CHANGELOG, commit, tag). Must be in coding stage.",
        parameters: z.object({
          summary: z.string().describe("One-line summary of what was evolved"),
        }),
        execute: async ({ summary }) => {
          const result = await this.evolutionPresenter.completeEvolution(summary)
          if (result.success) {
            return `Evolution complete! Tagged as ${result.tag}. Restart to see changes.`
          }
          return `Apply failed: ${result.error}. Fix the issue and try again.`
        },
      }),
    }
  }

  async callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.debug("tool:call", { sessionId, name, args })
    const tools = this.getToolSet(sessionId)
    const t = tools[name as keyof typeof tools]
    if (!t) throw new Error(`Unknown tool: ${name}`)
    return (t as any).execute(args, { toolCallId: "manual", messages: [] })
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test test/main/toolPresenter.evolution.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/toolPresenter.ts test/main/toolPresenter.evolution.test.ts
git commit -m "feat(tool): replace workflow tools with evolution tools, rework ask_user params"
```

---

## Task 5: Wire Up Presenter Layer — Index + AgentPresenter + SystemPrompt

**Files:**
- Modify: `src/main/presenter/index.ts`
- Modify: `src/main/presenter/agentPresenter.ts`
- Modify: `src/main/presenter/systemPrompt.ts`
- Delete: `src/main/presenter/workflowPresenter.ts`

- [ ] **Step 1: Update index.ts**

Replace WorkflowPresenter with EvolutionPresenter. Add evolutionPresenter to DISPATCHABLE. Pass git + config to EvolutionPresenter. Pass evolutionPresenter to ToolPresenter instead of workflowPresenter. Pass evolutionPresenter to AgentPresenter.

```typescript
// src/main/presenter/index.ts
import { ipcMain } from "electron"
import type { IPresenter } from "@shared/types/presenters"
import { AppPresenter } from "./appPresenter"
import { ConfigPresenter } from "./configPresenter"
import { AgentPresenter } from "./agentPresenter"
import { SessionPresenter } from "./sessionPresenter"
import { FilePresenter } from "./filePresenter"
import { GitPresenter } from "./gitPresenter"
import { ToolPresenter } from "./toolPresenter"
import { EvolutionPresenter } from "./evolutionPresenter"
import { WorkspacePresenter } from "./workspacePresenter"
import { ContentPresenter } from "./contentPresenter"
import { logger, paths } from "@/utils"

type DispatchableKey = Exclude<keyof IPresenter, "init" | "destroy">

export class Presenter implements IPresenter {
  appPresenter: AppPresenter
  configPresenter: ConfigPresenter
  agentPresenter: AgentPresenter
  sessionPresenter: SessionPresenter
  filePresenter: FilePresenter
  gitPresenter: GitPresenter
  contentPresenter: ContentPresenter
  workspacePresenter: WorkspacePresenter
  evolutionPresenter: EvolutionPresenter

  private toolPresenter: ToolPresenter

  private static instance: Presenter | null = null

  private constructor() {
    this.workspacePresenter = new WorkspacePresenter()
    this.appPresenter = new AppPresenter()
    this.configPresenter = new ConfigPresenter()
    this.sessionPresenter = new SessionPresenter()
    this.filePresenter = new FilePresenter(paths.effectiveProjectRoot)
    this.contentPresenter = new ContentPresenter()
    this.gitPresenter = new GitPresenter(paths.effectiveProjectRoot)
    this.evolutionPresenter = new EvolutionPresenter(this.gitPresenter, this.configPresenter)
    this.toolPresenter = new ToolPresenter(
      this.filePresenter,
      this.contentPresenter,
      this.evolutionPresenter,
    )
    this.agentPresenter = new AgentPresenter(
      this.sessionPresenter,
      this.configPresenter,
      this.toolPresenter,
      this.evolutionPresenter,
    )
  }

  static getInstance(): Presenter {
    if (!Presenter.instance) {
      Presenter.instance = new Presenter()
    }
    return Presenter.instance
  }

  static _resetForTest(): void {
    Presenter.instance = null
  }

  static readonly DISPATCHABLE = new Set<DispatchableKey>([
    "appPresenter",
    "configPresenter",
    "agentPresenter",
    "sessionPresenter",
    "filePresenter",
    "gitPresenter",
    "contentPresenter",
    "workspacePresenter",
    "evolutionPresenter",
  ])

  init(): void {
    logger.info("Presenter initialized")
  }

  async destroy(): Promise<void> {
    logger.info("Presenter destroyed")
  }
}

ipcMain.handle(
  "presenter:call",
  async (_event, name: string, method: string, ...args: unknown[]) => {
    if (!Presenter.DISPATCHABLE.has(name as DispatchableKey)) {
      throw new Error(`Presenter '${name}' is not dispatchable`)
    }
    const presenter = Presenter.getInstance()
    const target = presenter[name as DispatchableKey] as unknown as Record<string, unknown>
    if (typeof target[method] !== "function") {
      throw new Error(`Method '${method}' not found on '${name}'`)
    }
    return (target[method] as Function)(...args)
  },
)
```

- [ ] **Step 2: Update AgentPresenter constructor to accept evolutionPresenter**

In `src/main/presenter/agentPresenter.ts`, add `EvolutionPresenter` as 4th constructor parameter. Update `buildSystemPrompt` call to pass current stage. Update `handleAskUser` to use new ask_user format — set InteractionContent on ContentPresenter instead of just sending a question event.

Key changes (targeted edits, not full rewrite):

Constructor:
```typescript
constructor(
  private sessionPresenter: SessionPresenter,
  private configPresenter: ConfigPresenter,
  private toolPresenter: ToolPresenter,
  private evolutionPresenter: EvolutionPresenter,
) {}
```

In `chat()` method, change the `buildSystemPrompt()` call:
```typescript
const systemPrompt = await buildSystemPrompt(this.evolutionPresenter.getStatus().stage)
```

Update `handleAskUser` to build InteractionContent and set it on ContentPresenter (via toolPresenter's contentPresenter reference), then still use the existing Promise-based wait mechanism. The rendering changes are handled in the renderer tasks.

- [ ] **Step 3: Update systemPrompt.ts for stage awareness**

Replace `src/main/presenter/systemPrompt.ts`:

```typescript
import { readFile } from "fs/promises"
import { join } from "path"
import { paths } from "@/utils"
import { logger } from "@/utils"
import type { EvolutionStage } from "@shared/types/evolution"

const BASE_PROMPT = `You are Slime EvoLab, an AI agent that evolves the Slime application by modifying its own source code.

You have access to tools for reading, writing, and editing files, executing shell commands, and managing the evolution lifecycle.

The project root is the Slime application directory. All file paths are relative to this root.`

const STAGE_PROMPTS: Record<EvolutionStage, string> = {
  idle: `You are in idle mode. When the user describes a change or feature they want:
1. Call evolution_start with their request description
2. This will transition you to discuss stage

If the user is just chatting or asking questions, respond normally without starting an evolution.`,

  discuss: `You are in DISCUSS stage — your role is Product Manager.

RULES:
- Do NOT modify any code files. No write, edit, or exec commands that change code.
- Use ask_user to clarify requirements one question at a time. Prefer options with recommended choices.
- When you want to show a UI preview, write an HTML file with write tool, then use ask_user with html_file parameter.
- Once requirements are clear, call evolution_plan with scope, changes, and risks.

WORKFLOW:
1. Read relevant code to understand current state
2. Ask clarifying questions one at a time (use ask_user with options)
3. If helpful, create an HTML preview and show it via ask_user with html_file
4. Summarize the plan and get user confirmation
5. Call evolution_plan to move to coding stage`,

  coding: `You are in CODING stage — your role is Programmer.

RULES:
- Do NOT use ask_user. Work autonomously.
- Follow the evolution plan from discuss stage.
- After making changes, run verification: exec pnpm run typecheck && pnpm test && pnpm run lint
- If verification fails, analyze errors and fix them yourself.
- When all verification passes, call evolution_complete with a summary.

WORKFLOW:
1. Read existing code to understand structure
2. Make changes using write/edit tools
3. Run verification with exec
4. Fix any failures
5. Call evolution_complete when done`,

  applying: "",
}

async function loadDoc(filename: string): Promise<string> {
  try {
    const filePath = join(paths.effectiveProjectRoot, "docs", "evo", filename)
    return await readFile(filePath, "utf-8")
  } catch {
    logger.warn(`Failed to load evo doc: ${filename}`)
    return ""
  }
}

export async function buildSystemPrompt(stage: EvolutionStage = "idle"): Promise<string> {
  const [soul, evolution] = await Promise.all([loadDoc("SOUL.md"), loadDoc("EVOLUTION.md")])

  const parts = [BASE_PROMPT]
  if (soul) parts.push(`\n\n---\n\n${soul}`)
  if (evolution) parts.push(`\n\n---\n\n${evolution}`)
  if (STAGE_PROMPTS[stage]) parts.push(`\n\n---\n\n## Current Stage: ${stage.toUpperCase()}\n\n${STAGE_PROMPTS[stage]}`)
  return parts.join("")
}
```

- [ ] **Step 4: Delete workflowPresenter.ts**

```bash
git rm src/main/presenter/workflowPresenter.ts
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm run typecheck
```

Expected: may still have renderer-side errors (stores/components importing workflow). Those are fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/index.ts src/main/presenter/agentPresenter.ts src/main/presenter/systemPrompt.ts
git rm src/main/presenter/workflowPresenter.ts
git commit -m "feat(presenter): wire EvolutionPresenter, stage-aware systemPrompt, remove WorkflowPresenter"
```

---

## Task 6: Renderer — Evolution Store + InteractionRenderer + EvolutionPanel

**Files:**
- Create: `src/renderer/src/stores/evolution.ts`
- Create: `src/renderer/src/components/function/renderers/InteractionRenderer.vue`
- Create: `src/renderer/src/components/function/EvolutionPanel.vue`
- Delete: `src/renderer/src/stores/workflow.ts`
- Delete: `src/renderer/src/components/function/WorkflowPanel.vue`
- Delete: `src/renderer/src/components/function/renderers/QuizRenderer.vue`
- Delete: `src/renderer/src/components/function/renderers/PreviewRenderer.vue`
- Create: `test/renderer/stores/evolution.test.ts`
- Create: `test/renderer/components/renderers/InteractionRenderer.test.ts`
- Create: `test/renderer/components/EvolutionPanel.test.ts`

- [ ] **Step 1: Create evolution store**

```typescript
// src/renderer/src/stores/evolution.ts
import { ref } from "vue"
import { defineStore } from "pinia"
import type { EvolutionStage } from "@shared/types/evolution"
import { EVOLUTION_EVENTS } from "@shared/events"

export const useEvolutionStore = defineStore("evolution", () => {
  const stage = ref<EvolutionStage>("idle")
  const completedTag = ref<string | null>(null)
  const completedSummary = ref<string | null>(null)

  function setStage(s: EvolutionStage) {
    stage.value = s
    if (s !== "idle") {
      completedTag.value = null
      completedSummary.value = null
    }
  }

  function setCompleted(tag: string, summary: string) {
    completedTag.value = tag
    completedSummary.value = summary
  }

  function reset() {
    stage.value = "idle"
    completedTag.value = null
    completedSummary.value = null
  }

  return { stage, completedTag, completedSummary, setStage, setCompleted, reset }
})

export function setupEvolutionIpc(store: ReturnType<typeof useEvolutionStore>) {
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.STAGE_CHANGED, (_stage: EvolutionStage) => {
    store.setStage(_stage)
  })
  window.electron.ipcRenderer.on(EVOLUTION_EVENTS.COMPLETED, (tag: string, summary: string) => {
    store.setCompleted(tag, summary)
  })
}
```

- [ ] **Step 2: Create InteractionRenderer**

```vue
<!-- src/renderer/src/components/function/renderers/InteractionRenderer.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { InteractionContent } from '@shared/types/content'

const props = defineProps<{ content: InteractionContent }>()
const emit = defineEmits<{ submit: [result: { selected: string | string[]; extra_input?: string }] }>()

const selected = ref<Set<string>>(new Set())
const extraInput = ref('')

function toggle(value: string) {
  if (props.content.multiple) {
    if (selected.value.has(value)) selected.value.delete(value)
    else selected.value.add(value)
  } else {
    selected.value = new Set([value])
  }
}

const canSubmit = computed(() => selected.value.size > 0)

function submit() {
  if (!canSubmit.value) return
  const sel = props.content.multiple
    ? [...selected.value]
    : [...selected.value][0]
  const result: { selected: string | string[]; extra_input?: string } = { selected: sel }
  if (extraInput.value.trim()) result.extra_input = extraInput.value.trim()
  emit('submit', result)
}
</script>

<template>
  <div class="interaction-renderer">
    <!-- HTML Preview area (optional) -->
    <div v-if="content.htmlContent" class="interaction-renderer__preview">
      <iframe
        sandbox="allow-scripts"
        :srcdoc="content.htmlContent"
        class="interaction-renderer__iframe"
      />
    </div>

    <!-- Question -->
    <div class="interaction-renderer__question">{{ content.question }}</div>

    <!-- Options -->
    <div class="interaction-renderer__options">
      <button
        v-for="opt in content.options"
        :key="opt.value"
        class="interaction-renderer__option"
        :class="{
          'interaction-renderer__option--selected': selected.has(opt.value),
          'interaction-renderer__option--recommended': opt.recommended,
        }"
        @click="toggle(opt.value)"
      >
        <span class="interaction-renderer__radio">
          {{ selected.has(opt.value) ? (content.multiple ? '☑' : '●') : (content.multiple ? '☐' : '○') }}
        </span>
        <span>{{ opt.label }}</span>
        <span v-if="opt.recommended" class="interaction-renderer__badge">推荐</span>
      </button>
    </div>

    <!-- Extra input -->
    <textarea
      v-model="extraInput"
      class="interaction-renderer__extra"
      placeholder="补充说明（可选）..."
      rows="2"
    />

    <!-- Submit -->
    <button
      class="interaction-renderer__submit"
      :disabled="!canSubmit"
      @click="submit"
    >
      确认
    </button>
  </div>
</template>

<style scoped>
.interaction-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.interaction-renderer__preview {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.interaction-renderer__iframe {
  width: 100%;
  height: 300px;
  border: none;
  background: #fff;
}

.interaction-renderer__question {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.interaction-renderer__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.interaction-renderer__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text);
  text-align: left;
  transition: all 0.15s;
}

.interaction-renderer__option:hover {
  border-color: var(--color-primary);
}

.interaction-renderer__option--selected {
  border-color: var(--color-primary);
  background: rgba(139, 92, 246, 0.08);
}

.interaction-renderer__radio {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.interaction-renderer__badge {
  font-size: 11px;
  background: var(--color-primary);
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: auto;
}

.interaction-renderer__extra {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  resize: vertical;
}

.interaction-renderer__extra::placeholder {
  color: var(--color-muted);
}

.interaction-renderer__submit {
  padding: 10px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.interaction-renderer__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.interaction-renderer__submit:not(:disabled):hover {
  opacity: 0.9;
}
</style>
```

- [ ] **Step 3: Create EvolutionPanel**

```vue
<!-- src/renderer/src/components/function/EvolutionPanel.vue -->
<script setup lang="ts">
import { useEvolutionStore } from '@/stores/evolution'
import { usePresenter } from '@/composables/usePresenter'

const store = useEvolutionStore()
const evolutionPresenter = usePresenter('evolutionPresenter')

const stageLabels: Record<string, { label: string; icon: string }> = {
  idle: { label: '等待进化需求', icon: '○' },
  discuss: { label: '需求澄清中', icon: '💬' },
  coding: { label: '正在执行进化...', icon: '⚡' },
  applying: { label: '正在应用变更...', icon: '📦' },
}

const stages = ['discuss', 'coding', 'applying'] as const

function stageClass(stage: string) {
  const idx = stages.indexOf(stage as any)
  const currentIdx = stages.indexOf(store.stage as any)
  if (store.stage === 'idle') return 'pending'
  if (idx < currentIdx) return 'completed'
  if (idx === currentIdx) return 'active'
  return 'pending'
}

function handleRestart() {
  evolutionPresenter.restart()
}

function handleCancel() {
  evolutionPresenter.cancel()
}
</script>

<template>
  <div class="evolution-panel">
    <!-- Completed state -->
    <div v-if="store.completedTag" class="evolution-panel__completed">
      <div class="evolution-panel__completed-icon">✅</div>
      <div class="evolution-panel__completed-title">进化完成</div>
      <div class="evolution-panel__completed-tag">{{ store.completedTag }}</div>
      <div class="evolution-panel__completed-summary">{{ store.completedSummary }}</div>
      <button class="evolution-panel__restart-btn" @click="handleRestart">
        重启以生效
      </button>
    </div>

    <!-- Stage progress -->
    <div v-else class="evolution-panel__stages">
      <div class="evolution-panel__status">
        <span>{{ stageLabels[store.stage]?.icon }}</span>
        <span>{{ stageLabels[store.stage]?.label }}</span>
      </div>

      <div class="evolution-panel__timeline">
        <div
          v-for="s in stages"
          :key="s"
          class="evolution-panel__step"
          :class="`evolution-panel__step--${stageClass(s)}`"
        >
          <div class="evolution-panel__dot" />
          <span class="evolution-panel__step-label">{{ s }}</span>
        </div>
      </div>

      <!-- Cancel button (visible when evolution is in progress) -->
      <button
        v-if="store.stage !== 'idle'"
        class="evolution-panel__cancel-btn"
        @click="handleCancel"
      >
        取消进化
      </button>
    </div>
  </div>
</template>

<style scoped>
.evolution-panel {
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.evolution-panel__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 20px;
}

.evolution-panel__timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 8px;
}

.evolution-panel__step {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--color-muted);
}

.evolution-panel__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  flex-shrink: 0;
}

.evolution-panel__step--active {
  color: var(--color-primary);
  font-weight: 500;
}
.evolution-panel__step--active .evolution-panel__dot {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.evolution-panel__step--completed {
  color: #51cf66;
}
.evolution-panel__step--completed .evolution-panel__dot {
  background: #51cf66;
  border-color: #51cf66;
}

.evolution-panel__cancel-btn {
  margin-top: auto;
  padding: 8px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-muted);
  font-size: 13px;
  cursor: pointer;
}

.evolution-panel__cancel-btn:hover {
  border-color: #ff6b6b;
  color: #ff6b6b;
}

.evolution-panel__completed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  text-align: center;
}

.evolution-panel__completed-icon {
  font-size: 32px;
}

.evolution-panel__completed-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.evolution-panel__completed-tag {
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--color-primary);
}

.evolution-panel__completed-summary {
  font-size: 13px;
  color: var(--color-muted);
}

.evolution-panel__restart-btn {
  margin-top: 12px;
  padding: 10px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.evolution-panel__restart-btn:hover {
  opacity: 0.9;
}
</style>
```

- [ ] **Step 4: Delete old files**

```bash
git rm src/renderer/src/stores/workflow.ts
git rm src/renderer/src/components/function/WorkflowPanel.vue
git rm src/renderer/src/components/function/renderers/QuizRenderer.vue
git rm src/renderer/src/components/function/renderers/PreviewRenderer.vue
```

- [ ] **Step 5: Write tests for evolution store**

```typescript
// test/renderer/stores/evolution.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { setActivePinia, createPinia } from "pinia"
import { useEvolutionStore } from "../../../src/renderer/src/stores/evolution"

describe("useEvolutionStore", () => {
  beforeEach(() => setActivePinia(createPinia()))

  it("starts in idle", () => {
    const store = useEvolutionStore()
    expect(store.stage).toBe("idle")
  })

  it("setStage updates stage", () => {
    const store = useEvolutionStore()
    store.setStage("discuss")
    expect(store.stage).toBe("discuss")
  })

  it("setCompleted stores tag and summary", () => {
    const store = useEvolutionStore()
    store.setCompleted("egg-v0.1-dev.1", "did stuff")
    expect(store.completedTag).toBe("egg-v0.1-dev.1")
    expect(store.completedSummary).toBe("did stuff")
  })

  it("reset clears everything", () => {
    const store = useEvolutionStore()
    store.setStage("coding")
    store.setCompleted("tag", "summary")
    store.reset()
    expect(store.stage).toBe("idle")
    expect(store.completedTag).toBeNull()
  })
})
```

- [ ] **Step 6: Run tests**

```bash
pnpm test test/renderer/stores/evolution.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/stores/evolution.ts src/renderer/src/components/function/renderers/InteractionRenderer.vue src/renderer/src/components/function/EvolutionPanel.vue test/renderer/stores/evolution.test.ts
git commit -m "feat(ui): add evolution store, InteractionRenderer, EvolutionPanel, remove old workflow/quiz/preview"
```

---

## Task 7: Wire Renderer — FunctionPanel + ContentDispatcher + EvolutionCenter

**Files:**
- Modify: `src/renderer/src/components/function/FunctionPanel.vue`
- Modify: `src/renderer/src/components/function/ContentDispatcher.vue`
- Modify: `src/renderer/src/views/EvolutionCenter.vue`
- Modify: `src/renderer/src/stores/chat.ts`

- [ ] **Step 1: Update FunctionPanel.vue**

Replace WorkflowPanel import with EvolutionPanel. The three tabs become: 流程 (EvolutionPanel) / 工具 (ToolPanel) / 预览 (ContentDispatcher). Add `@interaction-submit` event handling on ContentDispatcher.

Key edits in `FunctionPanel.vue`:
- Replace `import WorkflowPanel from './WorkflowPanel.vue'` with `import EvolutionPanel from './EvolutionPanel.vue'`
- In template, replace `<WorkflowPanel />` with `<EvolutionPanel />`
- Add `@interaction-submit="handleInteractionSubmit"` on ContentDispatcher
- Add handler that calls `usePresenter('agentPresenter').answerQuestion(sessionId, toolCallId, JSON.stringify(result))`

- [ ] **Step 2: Update ContentDispatcher.vue**

Add InteractionRenderer to the dispatcher. Import InteractionRenderer, add `v-else-if="content.type === 'interaction'"` case, emit `interaction-submit` event.

- [ ] **Step 3: Update EvolutionCenter.vue**

Replace workflow store setup with evolution store setup:
- Replace `import { useWorkflowStore, setupWorkflowIpc }` with `import { useEvolutionStore, setupEvolutionIpc }`
- Call `setupEvolutionIpc(evolutionStore)` in onMounted
- Remove workflow-related watchers

- [ ] **Step 4: Update chat.ts store — ask_user handling**

When `pendingQuestion` is set from the `STREAM_EVENTS.QUESTION` event, also set InteractionContent on the content store so the function panel shows the interaction panel. The existing `answerQuestion` method already calls `agentPresenter.answerQuestion` — just need to also clear the content store after answering.

- [ ] **Step 5: Run full typecheck + test**

```bash
pnpm run typecheck && pnpm test
```

Expected: all pass. Fix any remaining import errors from deleted workflow files.

- [ ] **Step 6: Format and lint**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): wire evolution store, InteractionRenderer in FunctionPanel, remove workflow references"
```

---

## Task 8: Integration — ask_user InteractionContent Flow

**Files:**
- Modify: `src/main/presenter/agentPresenter.ts`
- Modify: `src/main/presenter/contentPresenter.ts`

- [ ] **Step 1: Update AgentPresenter.handleAskUser**

When `ask_user` tool is called, the args now include `options` (structured), `multiple`, and `html_file`. Build an `InteractionContent` object:
- If `html_file` is provided, read the file content via `filePresenter.read()` and set as `htmlContent`
- Set the InteractionContent on ContentPresenter via `setContent(sessionId, interactionContent)`
- Still send `STREAM_EVENTS.QUESTION` for the chat store to track pending state
- Wait for answer via existing Promise mechanism

In `executeTool`, for `ask_user`, instead of just sending the question text:

```typescript
if (name === "ask_user") {
  const { question, options, multiple, html_file } = input as any
  let htmlContent: string | undefined
  if (html_file) {
    try {
      htmlContent = await this.toolPresenter.callTool(sessionId, "read", { path: html_file }) as string
    } catch { /* ignore */ }
  }
  const interactionContent = {
    type: "interaction" as const,
    question,
    options: options || [],
    multiple: multiple || false,
    htmlContent,
  }
  // Set on content presenter for rendering
  this.contentPresenter.setContent(sessionId, interactionContent)
  // Use existing question mechanism for answer tracking
  const answer = await this.handleAskUser(sessionId, toolCallId, question, options?.map((o: any) => o.label))
  // Clear content after answer
  this.contentPresenter.clearContent(sessionId)
  return answer
}
```

Note: This requires AgentPresenter to have access to ContentPresenter. Add it as a dependency or access through ToolPresenter.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Fix any broken tests from constructor/signature changes.

- [ ] **Step 3: Format and lint**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(agent): wire ask_user to InteractionContent for unified function panel rendering"
```

---

## Task 9: Cleanup Old Tests + Final Verification

**Files:**
- Delete: `test/main/workflowPresenter.test.ts` (if exists)
- Delete: `test/renderer/stores/workflow.test.ts` (if exists)
- Delete: `test/renderer/components/renderers/QuizRenderer.test.ts`
- Delete: `test/renderer/components/renderers/PreviewRenderer.test.ts`
- Delete: `test/renderer/components/FunctionPanel.test.ts` (needs rewrite or removal if it imports old components)

- [ ] **Step 1: Remove tests for deleted components**

```bash
git rm -f test/main/workflowPresenter.test.ts test/renderer/stores/workflow.test.ts test/renderer/components/renderers/QuizRenderer.test.ts test/renderer/components/renderers/PreviewRenderer.test.ts 2>/dev/null; true
```

- [ ] **Step 2: Check for remaining import errors**

```bash
pnpm run typecheck 2>&1 | grep -i "workflow\|QuizRenderer\|PreviewRenderer" || echo "No stale imports"
```

Fix any remaining references.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: all pass. No references to deleted modules.

- [ ] **Step 4: Run format + lint**

```bash
pnpm run format && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove stale workflow/quiz/preview tests, fix remaining imports"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `CLAUDE.md` (AGENTS.md section)
- Modify: `docs/evo/EVOLUTION.md`

- [ ] **Step 1: Update CLAUDE.md presenter table**

Replace WorkflowPresenter row with EvolutionPresenter. Update tool count (now 9: removed 4 workflow/step, added 3 evolution). Update GitPresenter description.

- [ ] **Step 2: Update EVOLUTION.md**

Add a section on the actual tool names (evolution_start, evolution_plan, evolution_complete) and stage transitions now that they are implemented.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/evo/EVOLUTION.md
git commit -m "docs: update AGENTS.md presenter table and EVOLUTION.md for new evolution workflow"
```
