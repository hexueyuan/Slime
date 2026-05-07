# Slime Market Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Agent/Skill definitions from SQLite to file-system loading from `~/.slime/slime-market/`, keeping only hal-ai as built-in.

**Architecture:** Replace `agentDao` DB reads with an in-memory `AgentRegistry` that loads from hal-ai (app bundle) + market directory. CRUD operations write to file system. Session tables remain in SQLite.

**Tech Stack:** TypeScript, Electron, better-sqlite3 (sessions only), fs/promises

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/main/agents/marketLoader.ts` | Scan market agents dir, parse AGENT.json, return Agent[] |
| Create | `src/main/agents/agentRegistry.ts` | In-memory registry: load hal-ai + market agents, provide getById/list/create/update/delete |
| Modify | `src/main/agents/index.ts` | Only load hal-ai (single builtin) |
| Modify | `src/main/utils/paths.ts` | Add marketDir, marketAgentsDir, marketSkillsDir |
| Modify | `src/shared/constants/mbti.ts` | Add MBTI_TEMPERATURE mapping |
| Modify | `src/shared/types/agent.d.ts` | Remove AgentType enum, simplify Agent interface |
| Modify | `src/main/presenter/agentConfigPresenter.ts` | Replace agentDao calls with agentRegistry |
| Modify | `src/main/presenter/agentChat/agentChatPresenter.ts` | Replace agentDao.getAgentById with registry |
| Modify | `src/main/presenter/agentChatPresenterAdapter.ts` | Replace agentDao.getAgentById with registry |
| Modify | `src/main/presenter/mcpToolBridge.ts` | Replace agentDao.getAgentById with registry |
| Modify | `src/main/tasks/taskServer.ts` | Replace agentDao.getAgentById with registry |
| Modify | `src/main/presenter/skillPresenter.ts` | Change builtin source to marketSkillsDir |
| Modify | `src/main/db/database.ts` | Remove agents table DDL |
| Delete | `src/main/db/models/agentDao.ts` | Entirely replaced by agentRegistry |
| Modify | `src/main/db/index.ts` | Remove agentDao re-export |
| Modify | `src/renderer/src/stores/agent.ts` | No change needed (calls presenter IPC, transparent) |
| Modify | `src/renderer/src/components/agents/AgentEditForm.vue` | Add ID input, remove temperature/maxTokens fields |
| Modify | `src/renderer/src/components/agents/AgentManageTab.vue` | Remove builtin/custom split |

---

### Task 1: Add path constants and MBTI temperature

**Files:**
- Modify: `src/main/utils/paths.ts`
- Modify: `src/shared/constants/mbti.ts`

- [ ] **Step 1: Add market paths to paths.ts**

```typescript
// Add after existing `agentsDir` getter in paths object:
get marketDir() {
  return join(app.getPath('home'), '.slime', 'slime-market')
},

get marketAgentsDir() {
  return join(this.marketDir, 'agents')
},

get marketSkillsDir() {
  return join(this.marketDir, 'skills')
},
```

- [ ] **Step 2: Add MBTI_TEMPERATURE to mbti.ts**

Append at end of file before closing:

```typescript
export const MBTI_TEMPERATURE: Record<MBTIType, number> = {
  // xTxJ: 严谨、结构化
  INTJ: 0.3, ISTJ: 0.3, ENTJ: 0.3, ESTJ: 0.3,
  // xTxP: 逻辑但灵活
  INTP: 0.5, ISTP: 0.5, ENTP: 0.5, ESTP: 0.5,
  // xFxJ: 有条理但温和
  INFJ: 0.4, ISFJ: 0.4, ENFJ: 0.4, ESFJ: 0.4,
  // xFxP: 随性、开放
  INFP: 0.7, ISFP: 0.7, ENFP: 0.7, ESFP: 0.7,
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/utils/paths.ts src/shared/constants/mbti.ts
git commit -m "feat: add market paths and MBTI temperature mapping"
```

---

### Task 2: Simplify Agent type definitions

**Files:**
- Modify: `src/shared/types/agent.d.ts`

- [ ] **Step 1: Replace AgentType with isBuiltin flag**

Change the `Agent` interface:

```typescript
// Remove: export type AgentType = "builtin" | "custom"
// Keep AgentType for backwards compat but mark deprecated

export interface Agent {
  id: string
  name: string
  type: AgentType  // keep for now, but effectively unused for new logic
  enabled: boolean
  protected: boolean
  description?: string
  avatar?: AgentAvatar | null
  mbti: MBTIType
  config?: AgentConfig | null
  createdAt: number
  updatedAt: number
}
```

Actually — keep `AgentType` and `Agent` interface unchanged for this task to minimize blast radius. The renderer and many callers reference `agent.type`. We'll just stop writing to DB. The `type` field will be derived: hal-ai → "builtin", others → "custom".

- [ ] **Step 2: Remove temperature and maxTokens from AgentConfig**

In `AgentConfig` interface, remove:
```typescript
// Remove these two lines:
  temperature?: number
  maxTokens?: number
  contextLength?: number
```

Wait — `contextLength` is still needed for context builder. And `temperature`/`maxTokens` are referenced in `agentChatPresenterAdapter.ts` line 38-39 when copying to session config. Since we're hardcoding these, we should remove from the interface but handle gracefully in callers.

Actually, let's keep `AgentConfig` interface untouched for now. The AGENT.json just won't have these fields — they'll be `undefined` at runtime, and callers already handle undefined with fallbacks. This reduces risk.

**Decision: No changes to agent.d.ts in this task. Skip this task.**

- [ ] **Step 1 (revised): No-op — types stay unchanged for now**

Move on to Task 3.

---

### Task 3: Create marketLoader.ts

**Files:**
- Create: `src/main/agents/marketLoader.ts`

- [ ] **Step 1: Write marketLoader.ts**

```typescript
import { readdirSync, statSync, readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import type { Agent, AgentConfig, AgentAvatar } from '@shared/types/agent'
import type { MBTIType } from '@shared/constants/mbti'
import { MBTI_TEMPERATURE } from '@shared/constants/mbti'
import { logger } from '@/utils/logger'

interface AgentJson {
  name: string
  description?: string
  mbti: MBTIType
  capabilityRequirements?: string[]
  enabledTools?: string[]
  enabledSkills?: string[]
  allowedCliCommands?: string[]
  enableThinking?: boolean
  subagentEnabled?: boolean
  mcpTools?: string[]
}

const AVATAR_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

function findAvatar(dir: string): AgentAvatar | undefined {
  for (const ext of AVATAR_EXTENSIONS) {
    const p = join(dir, `avatar${ext}`)
    if (existsSync(p)) return { kind: 'image', path: p }
  }
  return undefined
}

function parseAgentJson(raw: string): AgentJson | null {
  try {
    const obj = JSON.parse(raw)
    if (!obj.name || !obj.mbti) return null
    return obj as AgentJson
  } catch {
    return null
  }
}

export function loadMarketAgents(marketAgentsDir: string): Agent[] {
  if (!existsSync(marketAgentsDir)) return []

  const agents: Agent[] = []
  let entries: string[]
  try {
    entries = readdirSync(marketAgentsDir)
  } catch {
    return []
  }

  for (const entry of entries) {
    const dir = join(marketAgentsDir, entry)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }

    const jsonPath = join(dir, 'AGENT.json')
    if (!existsSync(jsonPath)) continue

    let raw: string
    try {
      raw = readFileSync(jsonPath, 'utf-8')
    } catch {
      logger.warn('[marketLoader] failed to read AGENT.json', { dir })
      continue
    }

    const cfg = parseAgentJson(raw)
    if (!cfg) {
      logger.warn('[marketLoader] invalid AGENT.json', { dir })
      continue
    }

    // Read PROMPT.md
    const promptPath = join(dir, 'PROMPT.md')
    const additionalPrompt = existsSync(promptPath)
      ? readFileSync(promptPath, 'utf-8').trim()
      : undefined

    // allowedCliCommands: auto-inject "help" if non-empty
    const cliCmds = cfg.allowedCliCommands ?? []
    const finalCliCmds = cliCmds.length > 0 && !cliCmds.includes('help')
      ? ['help', ...cliCmds]
      : cliCmds

    const config: AgentConfig = {
      capabilityRequirements: cfg.capabilityRequirements,
      enabledTools: cfg.enabledTools,
      enabledSkills: cfg.enabledSkills,
      allowedCliCommands: finalCliCmds,
      enableThinking: cfg.enableThinking,
      subagentEnabled: cfg.subagentEnabled,
      mcpTools: cfg.mcpTools,
      additionalPrompt,
    }

    const avatar = findAvatar(dir)
    const now = Date.now()

    agents.push({
      id: entry,
      name: cfg.name,
      type: 'custom',
      enabled: true,
      protected: false,
      description: cfg.description,
      avatar,
      mbti: cfg.mbti,
      config,
      createdAt: now,
      updatedAt: now,
    })
  }

  return agents
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/agents/marketLoader.ts
git commit -m "feat: add marketLoader to scan agents from filesystem"
```

---

### Task 4: Create agentRegistry.ts

**Files:**
- Create: `src/main/agents/agentRegistry.ts`
- Modify: `src/main/agents/index.ts`

- [ ] **Step 1: Rewrite index.ts to only load hal-ai**

Replace the entire file:

```typescript
import type { AgentConfig, AgentAvatar } from '@shared/types/agent'
import type { MBTIType } from '@shared/constants/mbti'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface BuiltinAgentDef {
  id: string
  name: string
  description?: string
  avatar?: AgentAvatar
  mbti?: MBTIType
  config: AgentConfig
}

interface AgentConfigJson {
  name: string
  description?: string
  avatar?: AgentAvatar
  mbti?: MBTIType
  capabilityRequirements?: string[]
  enabledTools?: string[]
  allowedCliCommands?: string[]
  enabledSkills?: string[]
  subagentEnabled?: boolean
  enableThinking?: boolean
  mcpTools?: string[]
}

function getHalDir(): string {
  if (app.isPackaged) {
    return join(app.getAppPath(), '..', 'resources', 'agents', 'hal-ai')
  }
  return join(process.cwd(), 'src', 'main', 'agents', 'hal-ai')
}

function loadHalAi(): BuiltinAgentDef {
  const dir = getHalDir()
  const configPath = join(dir, 'config.json')
  const cfg: AgentConfigJson = JSON.parse(readFileSync(configPath, 'utf-8'))
  const promptPath = join(dir, 'prompt.md')
  const prompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8').trim() : undefined

  const { name, description, avatar, mbti, capabilityRequirements, enabledTools, enabledSkills, allowedCliCommands, subagentEnabled, enableThinking, mcpTools } = cfg

  return {
    id: 'hal-ai',
    name: name,
    description,
    avatar,
    mbti,
    config: {
      capabilityRequirements,
      enabledTools,
      enabledSkills,
      allowedCliCommands,
      subagentEnabled,
      enableThinking,
      mcpTools,
      additionalPrompt: prompt,
    },
  }
}

export const HAL_AI: BuiltinAgentDef = loadHalAi()
export const BUILTIN_AGENTS: BuiltinAgentDef[] = [HAL_AI]
```

- [ ] **Step 2: Write agentRegistry.ts**

```typescript
import { existsSync } from 'fs'
import { writeFile, mkdir, copyFile, unlink, readFile, rm } from 'fs/promises'
import { join, extname } from 'path'
import type { Agent, AgentAvatar, AgentConfig } from '@shared/types/agent'
import type { MBTIType } from '@shared/constants/mbti'
import { MBTI_TEMPERATURE } from '@shared/constants/mbti'
import { paths } from '@/utils'
import { logger } from '@/utils/logger'
import { BUILTIN_AGENTS } from './index'
import { loadMarketAgents } from './marketLoader'

class AgentRegistry {
  private agents = new Map<string, Agent>()

  load(): void {
    this.agents.clear()

    // 1. Load hal-ai (builtin, protected)
    for (const def of BUILTIN_AGENTS) {
      const now = Date.now()
      this.agents.set(def.id, {
        id: def.id,
        name: def.name,
        type: 'builtin',
        enabled: true,
        protected: true,
        description: def.description,
        avatar: def.avatar,
        mbti: def.mbti ?? 'INTJ',
        config: def.config,
        createdAt: now,
        updatedAt: now,
      })
    }

    // 2. Load market agents
    const marketAgents = loadMarketAgents(paths.marketAgentsDir)
    for (const agent of marketAgents) {
      if (this.agents.has(agent.id)) {
        logger.warn('[AgentRegistry] duplicate id, skipping market agent', { id: agent.id })
        continue
      }
      this.agents.set(agent.id, agent)
    }
  }

  list(): Agent[] {
    const arr = Array.from(this.agents.values())
    // protected first, then by name
    return arr.sort((a, b) => {
      if (a.protected !== b.protected) return a.protected ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  getById(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  async create(id: string, data: { name: string; description?: string; mbti: MBTIType; config?: AgentConfig; avatarSourcePath?: string }): Promise<Agent> {
    if (this.agents.has(id)) throw new Error(`Agent id already exists: ${id}`)
    if (!/^[a-z][a-z0-9-]*$/.test(id) || id.length > 50) throw new Error('Invalid agent id')

    const dir = join(paths.marketAgentsDir, id)
    await mkdir(dir, { recursive: true })

    // Write AGENT.json
    const agentJson: Record<string, unknown> = {
      name: data.name,
      description: data.description ?? '',
      mbti: data.mbti,
      capabilityRequirements: data.config?.capabilityRequirements ?? [],
      enabledTools: data.config?.enabledTools ?? [],
      enabledSkills: data.config?.enabledSkills ?? [],
      allowedCliCommands: data.config?.allowedCliCommands ?? [],
      enableThinking: data.config?.enableThinking ?? false,
      subagentEnabled: data.config?.subagentEnabled ?? false,
      mcpTools: data.config?.mcpTools ?? [],
    }
    await writeFile(join(dir, 'AGENT.json'), JSON.stringify(agentJson, null, 2), 'utf-8')

    // Write PROMPT.md
    const prompt = data.config?.additionalPrompt ?? ''
    await writeFile(join(dir, 'PROMPT.md'), prompt, 'utf-8')

    // Copy avatar
    let avatar: AgentAvatar | undefined
    if (data.avatarSourcePath) {
      const ext = extname(data.avatarSourcePath)
      const dest = join(dir, `avatar${ext}`)
      await copyFile(data.avatarSourcePath, dest)
      avatar = { kind: 'image', path: dest }
    }

    const now = Date.now()
    const agent: Agent = {
      id,
      name: data.name,
      type: 'custom',
      enabled: true,
      protected: false,
      description: data.description,
      avatar,
      mbti: data.mbti,
      config: data.config,
      createdAt: now,
      updatedAt: now,
    }
    this.agents.set(id, agent)
    return agent
  }

  async update(id: string, data: Partial<{ name: string; description: string; mbti: MBTIType; config: AgentConfig; avatarSourcePath: string | null }>): Promise<Agent> {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Agent not found: ${id}`)
    if (agent.protected) throw new Error('Cannot modify protected agent')

    const dir = join(paths.marketAgentsDir, id)

    // Update in-memory
    if (data.name !== undefined) agent.name = data.name
    if (data.description !== undefined) agent.description = data.description
    if (data.mbti !== undefined) agent.mbti = data.mbti
    if (data.config !== undefined) agent.config = data.config
    agent.updatedAt = Date.now()

    // Rewrite AGENT.json
    const agentJson: Record<string, unknown> = {
      name: agent.name,
      description: agent.description ?? '',
      mbti: agent.mbti,
      capabilityRequirements: agent.config?.capabilityRequirements ?? [],
      enabledTools: agent.config?.enabledTools ?? [],
      enabledSkills: agent.config?.enabledSkills ?? [],
      allowedCliCommands: agent.config?.allowedCliCommands ?? [],
      enableThinking: agent.config?.enableThinking ?? false,
      subagentEnabled: agent.config?.subagentEnabled ?? false,
      mcpTools: agent.config?.mcpTools ?? [],
    }
    await writeFile(join(dir, 'AGENT.json'), JSON.stringify(agentJson, null, 2), 'utf-8')

    // Rewrite PROMPT.md
    await writeFile(join(dir, 'PROMPT.md'), agent.config?.additionalPrompt ?? '', 'utf-8')

    // Handle avatar
    if (data.avatarSourcePath !== undefined) {
      // Remove old avatar files
      for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
        const old = join(dir, `avatar${ext}`)
        if (existsSync(old)) await unlink(old).catch(() => {})
      }
      if (data.avatarSourcePath) {
        const ext = extname(data.avatarSourcePath)
        const dest = join(dir, `avatar${ext}`)
        await copyFile(data.avatarSourcePath, dest)
        agent.avatar = { kind: 'image', path: dest }
      } else {
        agent.avatar = undefined
      }
    }

    return agent
  }

  async delete(id: string): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Agent not found: ${id}`)
    if (agent.protected) throw new Error('Cannot delete protected agent')

    const dir = join(paths.marketAgentsDir, id)
    await rm(dir, { recursive: true, force: true })
    this.agents.delete(id)
  }

  getTemperature(agent: Agent): number {
    return MBTI_TEMPERATURE[agent.mbti] ?? 0.5
  }
}

export const agentRegistry = new AgentRegistry()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/agents/index.ts src/main/agents/agentRegistry.ts
git commit -m "feat: add agentRegistry as single source of truth for agents"
```

---

### Task 5: Rewire agentConfigPresenter.ts

**Files:**
- Modify: `src/main/presenter/agentConfigPresenter.ts`

- [ ] **Step 1: Replace entire file**

```typescript
import { dialog } from 'electron'
import { join, extname } from 'path'
import { mkdir, copyFile, readFile } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { eventBus } from '@/eventbus'
import { AGENT_EVENTS } from '@shared/events'
import { paths } from '@/utils'
import { logger } from '@/utils/logger'
import { agentRegistry } from '@/agents/agentRegistry'
import type { Agent } from '@shared/types/agent'
import type { SkillInfo } from '@shared/types/skills'
import type { IAgentConfigPresenter } from '@shared/types/presenters/agentConfig.presenter'
import type { SkillPresenter } from './skillPresenter'

export class AgentConfigPresenter implements IAgentConfigPresenter {
  private skillPresenter?: SkillPresenter

  setSkillPresenter(sp: SkillPresenter): void {
    this.skillPresenter = sp
  }

  setConfigPresenter(): void {
    // no-op, vault path no longer needed
  }

  async init(): Promise<void> {
    agentRegistry.load()
  }

  async listAgents(): Promise<Agent[]> {
    return agentRegistry.list()
  }

  async getAgent(id: string): Promise<Agent | null> {
    return agentRegistry.getById(id) ?? null
  }

  async createAgent(data: Partial<Agent> & { id: string }): Promise<Agent> {
    const agent = await agentRegistry.create(data.id, {
      name: data.name || 'New Agent',
      description: data.description,
      mbti: data.mbti ?? 'INTJ',
      config: data.config ?? undefined,
      avatarSourcePath: undefined,
    })
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED)
    return agent
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const agent = await agentRegistry.update(id, {
      name: data.name,
      description: data.description,
      mbti: data.mbti,
      config: data.config ?? undefined,
    })
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED)
    return agent
  }

  async deleteAgent(id: string): Promise<void> {
    await agentRegistry.delete(id)
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED)
  }

  async pickAvatar(agentId: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择头像图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const src = result.filePaths[0]
    const ext = extname(src) || '.png'

    // Copy to agent directory
    const dir = join(paths.marketAgentsDir, agentId)
    if (!existsSync(dir)) return null

    // Remove existing avatar
    for (const e of ['.png', '.jpg', '.jpeg', '.webp']) {
      const old = join(dir, `avatar${e}`)
      if (existsSync(old)) {
        const { unlink } = await import('fs/promises')
        await unlink(old).catch(() => {})
      }
    }

    const dest = join(dir, `avatar${ext}`)
    await copyFile(src, dest)
    return dest
  }

  async getAvatarUrl(avatarPath: string): Promise<string> {
    // avatarPath is now absolute path to avatar file in agent dir
    const data = await readFile(avatarPath)
    const ext = extname(avatarPath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    }
    const mime = mimeMap[ext] || 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  }

  async readPromptMd(agentId: string): Promise<string> {
    const agent = agentRegistry.getById(agentId)
    if (!agent) return ''
    // Builtin: read from app resources
    if (agent.protected) {
      return agent.config?.additionalPrompt ?? ''
    }
    // Market: read PROMPT.md from agent dir
    const promptPath = join(paths.marketAgentsDir, agentId, 'PROMPT.md')
    try {
      return readFileSync(promptPath, 'utf-8')
    } catch {
      return ''
    }
  }

  async getAgentSkillsDir(_agentId: string): Promise<string | null> {
    // Skills are now global in market, no per-agent skill dir
    return null
  }

  async getAgentDir(agentId: string): Promise<string | null> {
    const agent = agentRegistry.getById(agentId)
    if (!agent || agent.protected) return null
    return join(paths.marketAgentsDir, agentId)
  }

  async listLocalSkills(_agentId: string): Promise<SkillInfo[]> {
    return []
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/presenter/agentConfigPresenter.ts
git commit -m "refactor: rewrite agentConfigPresenter to use agentRegistry"
```

---

### Task 6: Rewire agentChatPresenter and related consumers

**Files:**
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`
- Modify: `src/main/presenter/agentChatPresenterAdapter.ts`
- Modify: `src/main/presenter/mcpToolBridge.ts`
- Modify: `src/main/tasks/taskServer.ts`

- [ ] **Step 1: agentChatPresenter.ts — replace agentDao import**

Replace:
```typescript
import * as agentDao from "@/db/models/agentDao";
```
With:
```typescript
import { agentRegistry } from "@/agents/agentRegistry";
```

Replace all `agentDao.getAgentById(db, ...)` calls with `agentRegistry.getById(...)`:
- Line 267: `const agent = agentDao.getAgentById(db, session.agentId);` → `const agent = agentRegistry.getById(session.agentId);`

Also in the system prompt section (~line 326-331), simplify additionalPrompt logic. Since both builtin and custom now have `config.additionalPrompt` populated by the loader, replace:
```typescript
const additionalPrompt =
  agent?.type === "builtin"
    ? (BUILTIN_AGENTS.find((b) => b.id === agent.id)?.config?.additionalPrompt ??
      agent?.config?.additionalPrompt ??
      "")
    : (agent?.config?.additionalPrompt ?? "");
const promptFromFile =
  !additionalPrompt && this.agentConfigPresenter
    ? await this.agentConfigPresenter.readPromptMd(session.agentId)
    : "";
const rawPrompt = additionalPrompt || promptFromFile;
```
With:
```typescript
const additionalPrompt = agent?.config?.additionalPrompt ?? '';
const promptFromFile = !additionalPrompt && this.agentConfigPresenter
  ? await this.agentConfigPresenter.readPromptMd(session.agentId)
  : '';
const rawPrompt = additionalPrompt || promptFromFile;
```

For maxTokens (~line 374-376), replace `agent?.config?.maxTokens` with hardcoded 32768:
```typescript
maxTokens: agent?.config?.enableThinking
  ? (config?.maxTokens ?? 32768)
  : (config?.maxTokens ?? undefined),
```

- [ ] **Step 2: agentChatPresenterAdapter.ts — replace agentDao import**

Replace:
```typescript
import * as agentDao from "@/db/models/agentDao";
```
With:
```typescript
import { agentRegistry } from "@/agents/agentRegistry";
```

Replace all occurrences:
- Line 31: `const agent = agentDao.getAgentById(db, agentId);` → `const agent = agentRegistry.getById(agentId);`
- Line 107: `const agent = agentDao.getAgentById(db, session.agentId);` → `const agent = agentRegistry.getById(session.agentId);`

Also in createSession config copy (line 38), remove temperature/maxTokens:
```typescript
configDao.createConfig(db, {
  id,
  capabilityRequirements: agentConfig?.capabilityRequirements ?? ['reasoning'],
  systemPrompt: null,
  temperature: null,
  contextLength: null,
  maxTokens: null,
})
```

- [ ] **Step 3: mcpToolBridge.ts — replace agentDao import**

Replace:
```typescript
import * as agentDao from "@/db/models/agentDao";
```
With:
```typescript
import { agentRegistry } from "@/agents/agentRegistry";
```

Replace: `agentDao.getAgentById(this.db, session.agentId)` → `agentRegistry.getById(session.agentId)`

- [ ] **Step 4: taskServer.ts — replace agentDao import**

Replace:
```typescript
import { getAgentById } from "../db/models/agentDao";
```
With:
```typescript
import { agentRegistry } from "../agents/agentRegistry";
```

Replace both usages:
- `if (!getAgentById(db, creatorId))` → `if (!agentRegistry.getById(creatorId))`
- `if (!getAgentById(db, assigneeId))` → `if (!agentRegistry.getById(assigneeId))`

Remove the `db` parameter from these validation calls (they no longer need it).

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts src/main/presenter/agentChatPresenterAdapter.ts src/main/presenter/mcpToolBridge.ts src/main/tasks/taskServer.ts
git commit -m "refactor: replace all agentDao usage with agentRegistry"
```

---

### Task 7: Update SkillPresenter to use market skills dir

**Files:**
- Modify: `src/main/presenter/skillPresenter.ts`

- [ ] **Step 1: Change constructor and builtin source**

The `SkillPresenter` constructor currently takes `builtinDir` and `_agentsBaseDir`. Change it to use `marketSkillsDir` as the primary source:

```typescript
import type { SkillInfo } from '@shared/types/skills'
import type { Skill } from '@/skills/types'
import { scanSkills, loadSkillContent } from '@/skills/loader'
import { paths } from '@/utils'

export class SkillPresenter {
  private marketCache: Skill[] | null = null

  constructor() {}

  private loadMarketCache(): Skill[] {
    if (!this.marketCache) {
      this.marketCache = scanSkills(paths.marketSkillsDir).map((s) => ({
        ...s,
        source: 'builtin' as const,
      }))
    }
    return this.marketCache
  }

  getSkillList(_agentId: string, _agentSkillsDir?: string, enabledSkills?: string[]): SkillInfo[] {
    const enabledSet = new Set(enabledSkills ?? [])
    const skills = this.loadMarketCache().filter((s) => enabledSet.has(s.name))
    return skills.map(({ name, description, source }) => ({ name, description, source }))
  }

  loadSkill(name: string): string {
    const skill = this.loadMarketCache()?.find((s) => s.name === name)
    if (skill) return loadSkillContent(skill.filePath)
    throw new Error(`Skill "${name}" not found`)
  }

  listLocalSkillsForAgent(_agentId: string, _dir: string): SkillInfo[] {
    return []
  }

  invalidateCache(): void {
    this.marketCache = null
  }

  invalidateAgentCache(_agentId: string): void {
    // no-op, agent-specific caches removed
  }
}
```

- [ ] **Step 2: Update SkillPresenter instantiation site**

Find where SkillPresenter is constructed (likely in Presenter.init or similar) and update constructor call to no-args:

```typescript
// Old: new SkillPresenter(paths.builtinSkillsDir, paths.agentsDir)
// New:
new SkillPresenter()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/skillPresenter.ts
git commit -m "refactor: SkillPresenter uses market skills dir"
```

---

### Task 8: Remove agents table and agentDao

**Files:**
- Modify: `src/main/db/database.ts`
- Delete: `src/main/db/models/agentDao.ts`
- Modify: `src/main/db/index.ts`

- [ ] **Step 1: Remove agents DDL from database.ts**

Remove the `CREATE TABLE IF NOT EXISTS agents (...)` block from the DDL string. Keep `agent_sessions`, `agent_session_configs`, `agent_messages` tables — they reference `agent_id` as plain TEXT (no FK constraint existed anyway).

- [ ] **Step 2: Delete agentDao.ts**

```bash
rm src/main/db/models/agentDao.ts
```

- [ ] **Step 3: Remove re-export from db/index.ts**

Remove:
```typescript
export * from "./models/agentDao";
```

- [ ] **Step 4: Run typecheck to verify no remaining references**

```bash
pnpm run typecheck
```

Fix any remaining imports of agentDao (should be none after Task 6).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove agents table DDL and agentDao"
```

---

### Task 9: Update UI — AgentEditForm

**Files:**
- Modify: `src/renderer/src/components/agents/AgentEditForm.vue`

- [ ] **Step 1: Add agent ID input field (for create mode)**

Add a new field before the name field:
```html
<div v-if="isCreateMode" class="space-y-1">
  <label class="text-xs text-muted-foreground">英文ID（全小写，短横线分隔）</label>
  <input
    v-model="form.id"
    type="text"
    class="w-full rounded border px-2 py-1 text-sm bg-muted"
    placeholder="my-agent"
    pattern="[a-z][a-z0-9-]*"
  />
  <p v-if="idError" class="text-xs text-red-400">{{ idError }}</p>
</div>
```

Add `id` to form reactive:
```typescript
const form = reactive({
  id: '',  // new
  name: '',
  // ... rest unchanged
})
```

Add validation:
```typescript
const idError = computed(() => {
  if (!isCreateMode.value || !form.id) return ''
  if (!/^[a-z][a-z0-9-]*$/.test(form.id)) return '只允许小写字母、数字和短横线，必须字母开头'
  if (form.id.length > 50) return '最长50字符'
  return ''
})
```

- [ ] **Step 2: Remove temperature and maxTokens fields from the form UI**

Remove the "参数" section that contains temperature and maxTokens inputs. Remove from `form` reactive:
```typescript
// Remove:
temperature: undefined as number | undefined,
maxTokens: undefined as number | undefined,
```

- [ ] **Step 3: Update save logic to pass id on create**

Modify the create path to pass `form.id`:
```typescript
await agentStore.createAgent({
  id: form.id,
  name: form.name,
  // ... rest
})
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/agents/AgentEditForm.vue
git commit -m "feat: AgentEditForm add ID input, remove temperature/maxTokens"
```

---

### Task 10: Update UI — AgentManageTab

**Files:**
- Modify: `src/renderer/src/components/agents/AgentManageTab.vue`

- [ ] **Step 1: Remove builtin/custom split**

Replace the two-list display (builtin agents + custom agents) with a single list. All agents except hal-ai (protected) are editable.

The list should show all agents from `agentStore.agents`, with hal-ai marked as non-deletable.

- [ ] **Step 2: Remove dev-only builtin agent creation button**

Remove the "+ 新建内置 Agent" button and related `isDev`/`builtinAgents` logic.

- [ ] **Step 3: Add empty state hint when no market agents**

When agent list only has hal-ai (no market agents), show a hint:
```html
<div v-if="agents.length <= 1" class="p-4 text-xs text-muted-foreground text-center">
  <p>克隆 slime-market 获取更多 Agent：</p>
  <code class="text-xs">git clone https://github.com/hexueyuan/slime-market ~/.slime/slime-market</code>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/agents/AgentManageTab.vue
git commit -m "feat: AgentManageTab unified agent list"
```

---

### Task 11: Remove moss-ai from Slime source, prepare slime-market

**Files:**
- Delete: `src/main/agents/moss-ai/` (entire directory)

- [ ] **Step 1: Delete moss-ai directory from Slime**

```bash
rm -rf src/main/agents/moss-ai
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove moss-ai from source (migrated to slime-market)"
```

---

### Task 12: Fix SkillPresenter instantiation and Presenter.init wiring

**Files:**
- Modify: `src/main/presenter/index.ts` (or wherever Presenter initializes sub-presenters)

- [ ] **Step 1: Find and update Presenter init**

Search for where `SkillPresenter` is constructed and `agentConfigPresenter.init()` is called. Update:
- SkillPresenter: remove constructor args
- agentConfigPresenter.init(): now calls `agentRegistry.load()` internally
- Remove `agentDao.ensureBuiltin(getDb())` call
- Remove `syncBuiltinAvatars()` call (no longer needed, avatars are in agent dirs)

- [ ] **Step 2: Run full build check**

```bash
pnpm run typecheck && pnpm run lint
```

- [ ] **Step 3: Fix any remaining issues**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: wire up new agent loading in Presenter init"
```

---

### Task 13: Format and final verification

- [ ] **Step 1: Run format**

```bash
pnpm run format
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

- [ ] **Step 4: Fix any failures**

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: format and fix lint after market extraction"
```

---

## Notes for Implementation

- **Avatar path change**: Old system stored relative paths like `avatars/hal.png` (relative to slimeDir). New system stores absolute paths to the avatar file in the agent directory. The renderer's `getAvatarUrl` needs to handle both formats during migration.
- **Existing sessions**: Sessions with `agent_id` pointing to agents that no longer exist (e.g., if user hasn't cloned slime-market) should gracefully degrade — show "Agent 已移除" in UI.
- **slime-market repo initialization**: This plan only handles the Slime side. The actual migration of moss-ai files to the slime-market repo is a separate git operation in that repo.
- **`BUILTIN_AGENTS` import**: Several files import from `../../agents` or `@/agents`. After refactoring, ensure the barrel export from `@/agents/agentRegistry` is properly aliased.
