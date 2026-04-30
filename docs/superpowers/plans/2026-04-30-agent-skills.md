# Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add declarative Skill support to the Agent loop — SKILL.md files with YAML frontmatter, loaded on-demand via `Skill` tool, with builtin (agent-bound) and local (user-configurable) sources.

**Architecture:** Four new files (types, loader, presenter, shared types) + modifications to contextBuilder (inject skill list XML), toolPresenter (Skill tool), agentChatPresenter (Skill tool handling, skillList pass-through), AgentConfig (skills field), and AgentEditDialog (Skills tab). Skills are file-system based with memory caching — no database tables.

**Tech Stack:** TypeScript, YAML frontmatter regex parsing (no new dependency), Vue 3 + Pinia for UI

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/shared/types/skills.ts` | Create | Shared Skill type, shared between main and renderer |
| `src/main/skills/types.ts` | Create | Internal Skill types (Skill, SkillFrontmatter) |
| `src/main/skills/loader.ts` | Create | Directory scan + YAML frontmatter parse |
| `src/main/presenter/skillPresenter.ts` | Create | Cache, filter (agentIds/AgentConfig), loadSkill, init |
| `src/shared/types/agent.d.ts` | Modify | Add `skills?: string[]` to AgentConfig |
| `src/main/utils/paths.ts` | Modify | Add `builtinSkillsDir` getter |
| `src/main/presenter/agentChat/contextBuilder.ts` | Modify | Accept `skillListXML`, inject into system prompt |
| `src/main/presenter/toolPresenter.ts` | Modify | Register `Skill` tool in `getToolSet`, execute via skillPresenter |
| `src/main/presenter/index.ts` | Modify | Create SkillPresenter, inject into ToolPresenter and AgentChatPresenter |
| `src/main/presenter/agentChat/agentChatPresenter.ts` | Modify | Accept skillPresenter, pass skillList to contextBuilder |
| `electron-builder.yml` | Modify | Add `resources/skills/` to extraResources |
| `src/renderer/src/components/chat/AgentEditDialog.vue` | Modify | Add Skills tab with checkbox list |
| `src/main/presenter/agentConfigPresenter.ts` | Modify | Add `listLocalSkills()` method for renderer |
| `test/main/skills/loader.test.ts` | Create | Loader unit tests |
| `test/main/skills/skillPresenter.test.ts` | Create | SkillPresenter unit tests |

---

### Task 1: Define Skill Types

**Files:**
- Create: `src/shared/types/skills.ts`
- Create: `src/main/skills/types.ts`

- [ ] **Step 1: Create shared SkillInfo type**

Write `src/shared/types/skills.ts`:

```typescript
/** Skill info exposed to renderer (for UI) */
export interface SkillInfo {
  name: string
  description: string
  source: "builtin" | "local"
}
```

- [ ] **Step 2: Create internal Skill types**

Write `src/main/skills/types.ts`:

```typescript
export interface SkillFrontmatter {
  name: string
  description: string
  agentIds?: string[]
}

export interface Skill {
  name: string
  description: string
  source: "builtin" | "local"
  baseDir: string
  filePath: string
  agentIds?: string[]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/skills.ts src/main/skills/types.ts
git commit -m "feat(skills): add Skill type definitions"
```

---

### Task 2: Implement Skill Loader

**Files:**
- Create: `src/main/skills/loader.ts`
- Create: `test/main/skills/loader.test.ts`

- [ ] **Step 1: Write the failing test for loader**

Write `test/main/skills/loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { scanSkills, loadSkillContent } from "@/skills/loader"

const testRoot = join(tmpdir(), `slime-skills-loader-${Date.now()}`)
const skillsDir = join(testRoot, "skills")

beforeEach(() => {
  mkdirSync(skillsDir, { recursive: true })
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe("scanSkills", () => {
  it("returns empty array for empty/nonexistent dir", () => {
    const result = scanSkills("/nonexistent/dir")
    expect(result).toEqual([])
  })

  it("scans a single skill directory", () => {
    mkdirSync(join(skillsDir, "debugging"), { recursive: true })
    writeFileSync(
      join(skillsDir, "debugging", "SKILL.md"),
      `---\nname: debugging\ndescription: Debug errors.\n---\n\n# Debugging\n`,
    )

    const result = scanSkills(skillsDir)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("debugging")
    expect(result[0].description).toBe("Debug errors.")
    expect(result[0].filePath).toBe(join(skillsDir, "debugging", "SKILL.md"))
    expect(result[0].baseDir).toBe(join(skillsDir, "debugging"))
  })

  it("scans multiple skills", () => {
    mkdirSync(join(skillsDir, "a"), { recursive: true })
    writeFileSync(join(skillsDir, "a", "SKILL.md"), `---\nname: a\ndescription: Skill A.\n---\n\n# A\n`)
    mkdirSync(join(skillsDir, "b"), { recursive: true })
    writeFileSync(join(skillsDir, "b", "SKILL.md"), `---\nname: b\ndescription: Skill B.\n---\n\n# B\n`)

    const result = scanSkills(skillsDir)
    expect(result).toHaveLength(2)
  })

  it("skips directories without SKILL.md", () => {
    mkdirSync(join(skillsDir, "no-skill"), { recursive: true })
    writeFileSync(join(skillsDir, "no-skill", "README.md"), "not a skill")

    const result = scanSkills(skillsDir)
    expect(result).toHaveLength(0)
  })

  it("parses agentIds from frontmatter", () => {
    mkdirSync(join(skillsDir, "guide"), { recursive: true })
    writeFileSync(
      join(skillsDir, "guide", "SKILL.md"),
      `---\nname: guide\ndescription: Guide.\nagentIds:\n  - hal-ai\n  - another-agent\n---\n\n# Guide\n`,
    )

    const result = scanSkills(skillsDir)
    expect(result[0].agentIds).toEqual(["hal-ai", "another-agent"])
  })

  it("skips skills with invalid frontmatter", () => {
    mkdirSync(join(skillsDir, "bad"), { recursive: true })
    writeFileSync(join(skillsDir, "bad", "SKILL.md"), `not frontmatter\n\n# Bad\n`)

    const result = scanSkills(skillsDir)
    expect(result).toHaveLength(0)
  })

  it("skips skills missing required name or description", () => {
    mkdirSync(join(skillsDir, "no-name"), { recursive: true })
    writeFileSync(join(skillsDir, "no-name", "SKILL.md"), `---\ndescription: Missing name.\n---\n\n# No Name\n`)

    const result = scanSkills(skillsDir)
    expect(result).toHaveLength(0)
  })
})

describe("loadSkillContent", () => {
  it("reads SKILL.md content", () => {
    const content = `---\nname: test\ndescription: Test skill.\n---\n\n# Test Skill\n\nInstructions here.`
    mkdirSync(join(skillsDir, "test"), { recursive: true })
    writeFileSync(join(skillsDir, "test", "SKILL.md"), content)

    const result = loadSkillContent(join(skillsDir, "test", "SKILL.md"))
    expect(result).toBe(content)
  })

  it("throws for nonexistent file", () => {
    expect(() => loadSkillContent("/nonexistent/skill/SKILL.md")).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm test test/main/skills/loader.test.ts --run
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement loader**

Write `src/main/skills/loader.ts`:

```typescript
import { readFileSync, readdirSync, existsSync } from "fs"
import { join } from "path"
import type { Skill, SkillFrontmatter } from "./types"

function parseFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const raw = match[1]
  const result: Record<string, unknown> = {}
  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of raw.split("\n")) {
    const arrayMatch = line.match(/^\s*-\s+(.+)/)
    if (currentKey && currentArray && arrayMatch) {
      currentArray.push(arrayMatch[1].trim())
      continue
    }

    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/)
    if (kvMatch) {
      if (currentKey && currentArray) {
        result[currentKey] = currentArray
        currentArray = null
      }
      currentKey = kvMatch[1]
      const value = kvMatch[2].trim()
      if (value === "") {
        currentArray = []
      } else {
        result[currentKey] = value
        currentKey = null
      }
    }
  }

  if (currentKey && currentArray) {
    result[currentKey] = currentArray
  }

  const frontmatter = result as unknown as SkillFrontmatter
  if (!frontmatter.name || !frontmatter.description) return null
  return frontmatter
}

export function scanSkills(dir: string): Skill[] {
  if (!existsSync(dir)) return []

  const skills: Skill[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = join(dir, entry.name)
    const mdPath = join(skillDir, "SKILL.md")
    if (!existsSync(mdPath)) continue

    let content: string
    try {
      content = readFileSync(mdPath, "utf-8")
    } catch {
      continue
    }

    const fm = parseFrontmatter(content)
    if (!fm) continue

    skills.push({
      name: fm.name,
      description: fm.description,
      source: "local",
      baseDir: skillDir,
      filePath: mdPath,
      agentIds: fm.agentIds,
    })
  }

  return skills
}

export function loadSkillContent(filePath: string): string {
  return readFileSync(filePath, "utf-8")
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test test/main/skills/loader.test.ts --run
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/skills/loader.ts test/main/skills/loader.test.ts
git commit -m "feat(skills): add skill loader with directory scan and frontmatter parsing"
```

---

### Task 3: Add builtinSkillsDir to paths.ts

**Files:**
- Modify: `src/main/utils/paths.ts`

- [ ] **Step 1: Add builtinSkillsDir getter**

Modify `src/main/utils/paths.ts`, add after the `workspaceReadyFile` getter:

```typescript
get builtinSkillsDir() {
  return join(this.projectRoot, "resources", "skills")
},
```

- [ ] **Step 2: Add resources/skills/ to electron-builder.yml**

Modify `electron-builder.yml`, add to `extraResources`:

```yaml
extraResources:
  - build/icon.png
  - resources/skills/
```

- [ ] **Step 3: Create placeholder builtin skill directory**

```bash
mkdir -p resources/skills
touch resources/skills/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add src/main/utils/paths.ts electron-builder.yml resources/skills/.gitkeep
git commit -m "feat(skills): add builtin skills dir path and electron-builder config"
```

---

### Task 4: Implement SkillPresenter

**Files:**
- Create: `src/main/presenter/skillPresenter.ts`
- Create: `test/main/skills/skillPresenter.test.ts`

- [ ] **Step 1: Write the failing test**

Write `test/main/skills/skillPresenter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { SkillPresenter } from "@/presenter/skillPresenter"

const testRoot = join(tmpdir(), `slime-skills-pres-${Date.now()}`)
const builtinDir = join(testRoot, "builtin")
const localDir = join(testRoot, "local")

function writeSkill(dir: string, name: string, description: string, agentIds?: string[]) {
  const skillDir = join(dir, name)
  mkdirSync(skillDir, { recursive: true })
  const lines = [`---`, `name: ${name}`, `description: ${description}`]
  if (agentIds) {
    lines.push("agentIds:")
    agentIds.forEach((id) => lines.push(`  - ${id}`))
  }
  lines.push("---", "", `# ${name}`, "", "Content here.")
  writeFileSync(join(skillDir, "SKILL.md"), lines.join("\n"))
}

beforeEach(() => {
  mkdirSync(builtinDir, { recursive: true })
  mkdirSync(localDir, { recursive: true })
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe("SkillPresenter", () => {
  it("loads builtin skills filtered by agentId", () => {
    writeSkill(builtinDir, "guide", "Guide skill.", ["hal-ai"])
    writeSkill(builtinDir, "secret", "Secret skill.", ["other-agent"])

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("hal-ai")

    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("guide")
  })

  it("loads local skills enabled in AgentConfig", () => {
    writeSkill(localDir, "debugging", "Debug.")
    writeSkill(localDir, "review", "Review.")

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("agent-1", ["debugging"])

    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("debugging")
  })

  it("merges builtin and local skills (builtin first)", () => {
    writeSkill(builtinDir, "guide", "Guide.", ["hal-ai"])
    writeSkill(localDir, "debugging", "Debug.")

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("hal-ai", ["debugging"])

    expect(list).toHaveLength(2)
    expect(list[0].name).toBe("guide")
    expect(list[1].name).toBe("debugging")
  })

  it("builtin overrides local with same name", () => {
    writeSkill(builtinDir, "debugging", "Builtin debug.", ["hal-ai"])
    writeSkill(localDir, "debugging", "Local debug.")

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("hal-ai", ["debugging"])

    expect(list).toHaveLength(1)
    expect(list[0].description).toBe("Builtin debug.")
  })

  it("returns empty array when no skills match", () => {
    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("unknown-agent")
    expect(list).toEqual([])
  })

  it("getSkillList returns SkillInfo array (no filePath exposed)", () => {
    writeSkill(builtinDir, "guide", "Guide.", ["hal-ai"])

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.getSkillList("hal-ai")

    expect(list[0]).not.toHaveProperty("filePath")
    expect(list[0]).not.toHaveProperty("baseDir")
    expect(list[0]).not.toHaveProperty("agentIds")
    expect(list[0]).toHaveProperty("name")
    expect(list[0]).toHaveProperty("description")
    expect(list[0]).toHaveProperty("source")
  })

  it("loadSkill returns full SKILL.md content", () => {
    writeSkill(localDir, "debugging", "Debug skill.")

    const sp = new SkillPresenter(builtinDir, localDir)
    sp.getSkillList("agent-1", ["debugging"])
    const content = sp.loadSkill("debugging")

    expect(content).toContain("---")
    expect(content).toContain("name: debugging")
    expect(content).toContain("# debugging")
  })

  it("loadSkill throws for unknown skill", () => {
    const sp = new SkillPresenter(builtinDir, localDir)
    expect(() => sp.loadSkill("nonexistent")).toThrow('Skill "nonexistent" not found')
  })

  it("listLocalSkills returns all local skills", () => {
    writeSkill(localDir, "a", "A.")
    writeSkill(localDir, "b", "B.")

    const sp = new SkillPresenter(builtinDir, localDir)
    const list = sp.listLocalSkills()

    expect(list).toHaveLength(2)
    expect(list.map((s) => s.name).sort()).toEqual(["a", "b"])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm test test/main/skills/skillPresenter.test.ts --run
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement SkillPresenter**

Write `src/main/presenter/skillPresenter.ts`:

```typescript
import type { SkillInfo } from "@shared/types/skills"
import type { Skill } from "@/skills/types"
import { scanSkills, loadSkillContent } from "@/skills/loader"

export class SkillPresenter {
  private cache: Skill[] | null = null

  constructor(
    private builtinDir: string,
    private localDir: string,
  ) {}

  private loadCache(): Skill[] {
    if (this.cache) return this.cache

    const builtin = scanSkills(this.builtinDir).map((s) => ({ ...s, source: "builtin" as const }))
    const local = scanSkills(this.localDir).map((s) => ({ ...s, source: "local" as const }))

    // builtin overrides local with same name
    const builtinNames = new Set(builtin.map((s) => s.name))
    const filteredLocal = local.filter((s) => !builtinNames.has(s.name))

    this.cache = [...builtin, ...filteredLocal]
    return this.cache
  }

  getSkillList(agentId: string, enabledSkills?: string[]): SkillInfo[] {
    const all = this.loadCache()
    const enabledSet = enabledSkills ? new Set(enabledSkills) : null

    const filtered = all.filter((s) => {
      if (s.source === "builtin") {
        return s.agentIds?.includes(agentId)
      }
      // local: must be explicitly enabled
      if (enabledSet) {
        return enabledSet.has(s.name)
      }
      return false
    })

    return filtered.map((s) => ({
      name: s.name,
      description: s.description,
      source: s.source,
    }))
  }

  loadSkill(name: string): string {
    const all = this.loadCache()
    const skill = all.find((s) => s.name === name)
    if (!skill) throw new Error(`Skill "${name}" not found`)
    return loadSkillContent(skill.filePath)
  }

  listLocalSkills(): SkillInfo[] {
    const all = this.loadCache()
    return all
      .filter((s) => s.source === "local")
      .map((s) => ({ name: s.name, description: s.description, source: s.source }))
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pnpm test test/main/skills/skillPresenter.test.ts --run
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/skillPresenter.ts test/main/skills/skillPresenter.test.ts
git commit -m "feat(skills): add SkillPresenter with caching, filtering, and loadSkill"
```

---

### Task 5: Extend AgentConfig with skills field

**Files:**
- Modify: `src/shared/types/agent.d.ts`

- [ ] **Step 1: Add skills field to AgentConfig**

Modify `src/shared/types/agent.d.ts`, add `skills` to `AgentConfig` interface:

```typescript
export interface AgentConfig {
  capabilityRequirements?: string[]
  systemPrompt?: string
  temperature?: number
  contextLength?: number
  maxTokens?: number
  disabledTools?: string[]
  subagentEnabled?: boolean
  mcpTools?: string[]
  skills?: string[]  // enabled local skill names
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types/agent.d.ts
git commit -m "feat(skills): add skills field to AgentConfig"
```

---

### Task 6: Wire AgentConfigPresenter to expose listLocalSkills

**Files:**
- Modify: `src/main/presenter/agentConfigPresenter.ts`
- Modify: `src/main/presenter/index.ts`
- Modify: `src/shared/types/presenters/agentConfig.presenter.d.ts`

- [ ] **Step 1: Add listLocalSkills to interface**

Modify `src/shared/types/presenters/agentConfig.presenter.d.ts`, add method:

```typescript
import type { SkillInfo } from "../skills"

export interface IAgentConfigPresenter {
  // ... existing methods
  listLocalSkills(): Promise<SkillInfo[]>
}
```

- [ ] **Step 2: Add listLocalSkills implementation**

Modify `src/main/presenter/agentConfigPresenter.ts`. Import SkillInfo and SkillPresenter:

```typescript
import type { SkillInfo } from "@shared/types/skills"
import type { SkillPresenter } from "./skillPresenter"
```

Add constructor and method to `AgentConfigPresenter`:

```typescript
export class AgentConfigPresenter implements IAgentConfigPresenter {
  private skillPresenter?: SkillPresenter

  setSkillPresenter(sp: SkillPresenter): void {
    this.skillPresenter = sp
  }

  async listLocalSkills(): Promise<SkillInfo[]> {
    return this.skillPresenter?.listLocalSkills() ?? []
  }

  // ... rest unchanged
```

In `src/main/presenter/index.ts`, after creating skillPresenter, inject it into agentConfigPresenter:

```typescript
this.agentConfigPresenter = new AgentConfigPresenter()
this.agentConfigPresenter.setSkillPresenter(skillPresenter)
```

- [ ] **Step 2: Commit**

```bash
git add src/main/presenter/agentConfigPresenter.ts src/main/presenter/index.ts
git commit -m "feat(skills): add listLocalSkills to AgentConfigPresenter"

---

### Task 7: Integrate into contextBuilder

**Files:**
- Modify: `src/main/presenter/agentChat/contextBuilder.ts`

- [ ] **Step 1: Add buildSkillListXML helper and modify buildContext**

Modify `src/main/presenter/agentChat/contextBuilder.ts`. Add after `estimateTokens` function:

```typescript
export function buildSkillListXML(skills: { name: string; description: string }[]): string | null {
  if (skills.length === 0) return null
  const lines = skills.map((s) => `- ${s.name}: ${s.description}`)
  return `<system-reminder>\nThe following skills are available for use with the Skill tool:\n${lines.join("\n")}\n</system-reminder>`
}
```

Modify `buildContext` to accept `options.skills`, and append skill list to system prompt:

```typescript
export function buildContext(
  sessionId: string,
  newUserContent: string,
  db: BetterSqlite3.Database,
  options?: {
    reserveTokens?: number
    agentSystemPrompt?: string
    skillListXML?: string | null
  },
): CoreMessage[] {
  // ... existing code ...
  const systemPrompt = config?.systemPrompt || options?.agentSystemPrompt || "You are a helpful AI assistant."
  const finalSystemPrompt = options?.skillListXML
    ? systemPrompt + "\n\n" + options.skillListXML
    : systemPrompt
  const systemMsg: CoreMessage = { role: "system", content: finalSystemPrompt }
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Update test for contextBuilder**

Modify `test/main/agentChat/contextBuilder.test.ts` to test the new function:

```typescript
import { buildSkillListXML } from "@/presenter/agentChat/contextBuilder"

describe("buildSkillListXML", () => {
  it("returns null for empty skills", () => {
    expect(buildSkillListXML([])).toBeNull()
  })

  it("formats skills in XML", () => {
    const result = buildSkillListXML([
      { name: "debug", description: "Debug errors." },
      { name: "review", description: "Review code." },
    ])
    expect(result).toContain("<system-reminder>")
    expect(result).toContain("Skill tool")
    expect(result).toContain("- debug: Debug errors.")
    expect(result).toContain("- review: Review code.")
    expect(result).toContain("</system-reminder>")
  })
})
```

- [ ] **Step 3: Run tests**

```bash
pnpm test test/main/agentChat/contextBuilder.test.ts --run
```
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/agentChat/contextBuilder.ts test/main/agentChat/contextBuilder.test.ts
git commit -m "feat(skills): add buildSkillListXML and integrate into buildContext"
```

---

### Task 8: Integrate Skill tool into ToolPresenter

**Files:**
- Modify: `src/main/presenter/toolPresenter.ts`
- Modify: `src/main/presenter/index.ts`

- [ ] **Step 1: Add SkillPresenter parameter to ToolPresenter**

Modify the ToolPresenter constructor to accept an optional `skillPresenter`:

```typescript
import type { SkillPresenter } from "./skillPresenter"

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private contentPresenter: ContentPresenter,
    private evolutionPresenter: EvolutionPresenter,
    private browserSession: BrowserSession,
    private mcpBridge?: MCPToolBridge,
    private skillPresenter?: SkillPresenter,
  ) {}
```

- [ ] **Step 2: Add Skill tool to getToolSet**

In `getToolSet`, add after the `web_fetch` tool and before the closing `}`:

```typescript
Skill: createTool({
  description: `Execute a skill within the main conversation.

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

How to invoke:
- Set \`skill\` to the exact name of an available skill.

Important:
- Available skills are listed in a <system-reminder> tag in the system prompt.
- Only invoke a skill that appears in the available skills list.
- When a skill matches the user's request, invoke BEFORE generating any response.
- NEVER mention a skill without actually calling this tool.
- Do not invoke a skill that is already running.`,
  parameters: z.object({
    skill: z.string().describe("Exact name of the skill to invoke"),
    args: z.string().optional().describe("Optional arguments for the skill"),
  }),
  execute: async ({ skill, args }: { skill: string; args?: string }) => {
    if (!this.skillPresenter) {
      return "Skills are not available."
    }
    try {
      const content = this.skillPresenter.loadSkill(skill)
      return `<system-reminder>\n${content}\n</system-reminder>`
    } catch (e) {
      return `Skill "${skill}" not found.`
    }
  },
}),
```

- [ ] **Step 3: Wire SkillPresenter in Presenter.index.ts**

Modify `src/main/presenter/index.ts`. Import and create SkillPresenter:

```typescript
import { SkillPresenter } from "./skillPresenter"
import { paths } from "@/utils"
```

In the constructor, before creating the ToolPresenter:

```typescript
const skillPresenter = new SkillPresenter(paths.builtinSkillsDir, join(paths.effectiveProjectRoot, "skills"))
```

Then pass it to ToolPresenter:

```typescript
this.toolPresenter = new ToolPresenter(
  this.filePresenter,
  this.contentPresenter,
  this.evolutionPresenter,
  browserSession,
  mcpBridge,
  skillPresenter,
)
```

And to AgentChatPresenter (see next task).

- [ ] **Step 4: Update toolPresenter tests**

Modify `test/main/toolPresenter.test.ts`. The test with 19 tools should now expect 20 (including "Skill"). Update:

```typescript
expect(Object.keys(tools)).toHaveLength(20)
expect(Object.keys(tools)).toEqual(
  expect.arrayContaining([
    "read", "write", "edit", "exec", "ask_user", "open",
    "evolution_start", "evolution_plan", "evolution_complete",
    "browser_navigate", "browser_screenshot", "browser_snapshot",
    "browser_click", "browser_type", "browser_scroll",
    "browser_evaluate", "browser_wait", "browser_close", "web_fetch",
    "Skill",
  ]),
)
```

- [ ] **Step 5: Run tests**

```bash
pnpm test test/main/toolPresenter.test.ts --run
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/toolPresenter.ts src/main/presenter/index.ts test/main/toolPresenter.test.ts
git commit -m "feat(skills): add Skill tool to ToolPresenter and wire SkillPresenter"
```

---

### Task 9: Integrate skillList into AgentChatPresenter

**Files:**
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [ ] **Step 1: Accept SkillPresenter and pass skillList to contextBuilder**

Modify `AgentChatPresenter` constructor to accept `skillPresenter`:

```typescript
import type { SkillPresenter } from "../skillPresenter"

export class AgentChatPresenter {
  constructor(
    private gatewayPresenter: GatewayPresenter,
    private toolPresenter: ToolPresenter,
    private contentPresenter: ContentPresenter,
    private skillPresenter?: SkillPresenter,
  ) {}
```

- [ ] **Step 2: Pass skillListXML to buildContext in chat()**

In the `chat()` method, update the `buildContext` call to include the skill list:

```typescript
const skillListXML = this.skillPresenter
  ? buildSkillListXML(this.skillPresenter.getSkillList(session.agentId, agent?.config?.skills))
  : null

const messages: CoreMessage[] = buildContext(sessionId, content, db, {
  agentSystemPrompt: agent?.config?.systemPrompt,
  skillListXML,
})
```

- [ ] **Step 3: Update Presenter wiring in index.ts**

In `src/main/presenter/index.ts`, pass skillPresenter to AgentChatPresenter:

```typescript
this.agentChatEngine = new AgentChatPresenter(
  this.gatewayPresenter,
  this.toolPresenter,
  this.contentPresenter,
  skillPresenter,
)
```

- [ ] **Step 4: Update agentChatPresenter tests**

Modify `test/main/agentChat/agentChatPresenter.test.ts` to pass `undefined` as the 4th arg to AgentChatPresenter constructor (existing tests don't test skills):

```typescript
const acp = new AgentChatPresenter(gateway, toolPresenter, contentPresenter)
// stays the same since skillPresenter is optional
```

- [ ] **Step 5: Run tests**

```bash
pnpm test test/main/agentChat/agentChatPresenter.test.ts --run
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts src/main/presenter/index.ts test/main/agentChat/agentChatPresenter.test.ts
git commit -m "feat(skills): pass skillList to contextBuilder in AgentChatPresenter"
```

---

### Task 10: Add Skills tab to AgentEditDialog

**Files:**
- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [ ] **Step 1: Add skills form state and IPC**

In the script section, add a `skills` reactive property and loading logic inside the `watch`:

```typescript
const agentConfig = usePresenter("agentConfigPresenter")
// Add after other reactive declarations:
const skills = ref<string[]>([])
const availableSkills = ref<SkillInfo[]>([])

// In the watch(open) handler, add after mcpTools load:
skills.value = cfg?.skills ?? []
agentConfig.listLocalSkills().then((s: SkillInfo[]) => {
  availableSkills.value = s
})
```

Import SkillInfo:

```typescript
import type { SkillInfo } from "@shared/types/skills"
```

- [ ] **Step 2: Add Skills section to template**

Add a Skills section in the template, right after the MCP Tools section:

```vue
<!-- Skills -->
<div>
  <label class="mb-1 block text-xs text-muted-foreground">Skills（勾选启用）</label>
  <div v-if="availableSkills.length === 0" class="text-xs text-muted-foreground">
    暂无本地 Skill。请将 Skill 目录放入 workspace/skills/
  </div>
  <div v-else class="space-y-1">
    <label
      v-for="sk in availableSkills"
      :key="sk.name"
      class="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/50 cursor-pointer"
    >
      <input
        type="checkbox"
        :checked="skills.includes(sk.name)"
        class="accent-violet-500"
        @change="() => {
          const idx = skills.indexOf(sk.name)
          if (idx >= 0) skills.splice(idx, 1)
          else skills.push(sk.name)
        }"
      />
      <div>
        <span>{{ sk.name }}</span>
        <span class="ml-2 text-xs text-muted-foreground">{{ sk.description }}</span>
      </div>
    </label>
  </div>
</div>
```

- [ ] **Step 3: Include skills in onSave config**

In `onSave()`, add `skills` to the config:

```typescript
const config: AgentConfig = {
  // ... existing ...
  mcpTools: mcpTools.value.length > 0 ? mcpTools.value : undefined,
  skills: skills.value.length > 0 ? skills.value : undefined,
  subagentEnabled: subagentEnabled.value,
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue
git commit -m "feat(skills): add Skills tab to AgentEditDialog for local skill selection"
```

---

### Task 11: Integration test and end-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test --run
```
Expected: all tests PASS

- [ ] **Step 2: Run type check**

```bash
pnpm run typecheck
```
Expected: no errors

- [ ] **Step 3: Manual verification**

Start dev server and verify:
1. Create a local skill: `mkdir -p skills/test-skill && echo '---\nname: test-skill\ndescription: A test skill.\n---\n\n# Test\n\nDo something.' > skills/test-skill/SKILL.md`
2. Open AgentEditDialog → Skills tab shows "test-skill"
3. Enable it for an Agent → start chat → system prompt includes skill list XML
4. Send "please use the test-skill skill" → Agent calls `Skill("test-skill")` → gets content

- [ ] **Step 4: Run format and lint**

```bash
pnpm run format
pnpm run lint
```

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git commit -m "chore(skills): final integration tweaks from testing"
```
