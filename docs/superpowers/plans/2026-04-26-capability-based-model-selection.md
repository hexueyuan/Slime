# Capability-Based Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Slot system with capability tags + dynamic selection engine, enabling components to declare required model capabilities and the system to match optimal models.

**Architecture:** New `models` table stores per-channel model entries with JSON capability tags and priority. A `CapabilitySelector` module performs matching (independent/unified modes) against enabled+healthy models. Slot-related types, DB fields, UI, and resolution logic are fully removed. Onboarding step 3 changes from SlotMapping to CapabilityTag.

**Tech Stack:** TypeScript, better-sqlite3, Vue 3 Composition API, Pinia, Vitest

---

## File Structure

### Create
- `src/main/db/models/modelDao.ts` — CRUD for models table
- `src/main/gateway/selector.ts` — CapabilitySelector (select, hasCapability, availableCapabilities, modelsWithCapability)
- `src/renderer/src/components/onboarding/CapabilityTagStep.vue` — replaces SlotMappingStep
- `src/renderer/src/composables/useCapability.ts` — useCapabilityCheck composable
- `test/main/modelDao.test.ts` — modelDao unit tests
- `test/main/selector.test.ts` — CapabilitySelector unit tests

### Modify
- `src/main/db/database.ts` — add models table DDL
- `src/shared/types/gateway.d.ts` — add Model/Capability types, remove Slot types
- `src/shared/types/presenters/gateway.presenter.d.ts` — add model CRUD + select methods, remove resolveSlot
- `src/main/presenter/gatewayPresenter.ts` — add model CRUD + selector, remove resolveSlot
- `src/main/presenter/agentPresenter.ts` — replace resolveSlot with selector.select
- `src/main/gateway/router.ts` — remove getGroupsWithSlot
- `src/main/gateway/index.ts` — remove resolveSlot export, add selector export
- `src/main/db/models/groupDao.ts` — remove slot fields from create/update
- `src/renderer/src/components/onboarding/OnboardingWizard.vue` — replace SlotMappingStep with CapabilityTagStep, update complete()
- `src/renderer/src/components/settings/GatewaySettings.vue` — remove Slot mapping UI
- `src/renderer/src/components/gateway/ChannelTab.vue` — add model capability management in channel detail
- `src/renderer/src/stores/gateway.ts` — add models state + load methods
- `test/main/db.test.ts` — add models table tests, update group tests
- `test/main/gatewayPresenter.test.ts` — add model/selector tests, remove resolveSlot tests
- `test/renderer/components/OnboardingWizard.test.ts` — update for CapabilityTagStep
- `test/renderer/components/SettingsDialog.test.ts` — update for removed Slot UI

### Delete
- `src/main/gateway/registry.ts` — resolveSlot is replaced by selector
- `src/renderer/src/components/onboarding/SlotMappingStep.vue` — replaced by CapabilityTagStep

---

### Task 1: Types — Add Capability/Model types, remove Slot types

**Files:**
- Modify: `src/shared/types/gateway.d.ts`

- [ ] **Step 1: Add Capability and Model types, remove Slot types**

In `src/shared/types/gateway.d.ts`, add after the `ChannelKey` interface:

```typescript
export type Capability = 'reasoning' | 'chat' | 'vision' | 'image_gen'

export interface Model {
  id: number
  channelId: number
  modelName: string
  capabilities: Capability[]
  priority: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type CapabilityRequirement = (Capability | Capability[])[]

export interface ModelMatch {
  modelId: number
  modelName: string
  channelId: number
  groupName: string
  capabilities: Capability[]
}

export interface SelectResult {
  matched: Record<string, ModelMatch>
  missing: string[]
}
```

Remove these lines:

```typescript
export type ModelCategory = "text" | "image";
export type TextModelTier = "chat" | "reasoning";
export type ReasoningLevel = "lite" | "pro" | "max" | "auto";

export interface ModelSlot {
  category: ModelCategory;
  tier?: TextModelTier;
  level?: ReasoningLevel;
}
```

Remove `slot?: ModelSlot` from the `Group` interface.

- [ ] **Step 2: Run typecheck to see all breakage points**

Run: `pnpm run typecheck 2>&1 | head -60`
Expected: Multiple errors where ModelSlot/slot is referenced. This confirms the scope of changes needed.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/gateway.d.ts
git commit -m "feat: add Capability/Model types, remove Slot types"
```

---

### Task 2: Database — Add models table DDL + modelDao

**Files:**
- Modify: `src/main/db/database.ts`
- Create: `src/main/db/models/modelDao.ts`
- Create: `test/main/modelDao.test.ts`

- [ ] **Step 1: Write modelDao tests**

Create `test/main/modelDao.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, closeDb } from '@/db'
import * as modelDao from '@/db/models/modelDao'
import * as channelDao from '@/db/models/channelDao'
import type BetterSqlite3 from 'better-sqlite3'

let db: BetterSqlite3.Database

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  closeDb()
})

function makeChannel() {
  return channelDao.createChannel(db, {
    name: 'test-ch',
    type: 'openai',
    baseUrls: ['https://api.openai.com'],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  })
}

describe('modelDao', () => {
  it('createModel returns full object', () => {
    const ch = makeChannel()
    const m = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: 'gpt-4o',
      capabilities: ['reasoning', 'chat', 'vision'],
      priority: 10,
      enabled: true,
    })
    expect(m.id).toBeGreaterThan(0)
    expect(m.modelName).toBe('gpt-4o')
    expect(m.capabilities).toEqual(['reasoning', 'chat', 'vision'])
    expect(m.priority).toBe(10)
    expect(m.enabled).toBe(true)
  })

  it('listModels returns all sorted by priority DESC', () => {
    const ch = makeChannel()
    modelDao.createModel(db, { channelId: ch.id, modelName: 'low', capabilities: ['chat'], priority: 1, enabled: true })
    modelDao.createModel(db, { channelId: ch.id, modelName: 'high', capabilities: ['chat'], priority: 10, enabled: true })
    const list = modelDao.listModels(db)
    expect(list).toHaveLength(2)
    expect(list[0].modelName).toBe('high')
    expect(list[1].modelName).toBe('low')
  })

  it('listModelsByChannel filters by channel', () => {
    const ch1 = makeChannel()
    const ch2 = channelDao.createChannel(db, { name: 'ch2', type: 'anthropic', baseUrls: ['https://api.anthropic.com'], models: [], enabled: true, priority: 0, weight: 1 })
    modelDao.createModel(db, { channelId: ch1.id, modelName: 'a', capabilities: ['chat'], priority: 0, enabled: true })
    modelDao.createModel(db, { channelId: ch2.id, modelName: 'b', capabilities: ['chat'], priority: 0, enabled: true })
    expect(modelDao.listModelsByChannel(db, ch1.id)).toHaveLength(1)
    expect(modelDao.listModelsByChannel(db, ch1.id)[0].modelName).toBe('a')
  })

  it('updateModel partial update', () => {
    const ch = makeChannel()
    const m = modelDao.createModel(db, { channelId: ch.id, modelName: 'x', capabilities: ['chat'], priority: 0, enabled: true })
    modelDao.updateModel(db, m.id, { capabilities: ['reasoning', 'vision'], priority: 20 })
    const updated = modelDao.getModel(db, m.id)!
    expect(updated.capabilities).toEqual(['reasoning', 'vision'])
    expect(updated.priority).toBe(20)
    expect(updated.enabled).toBe(true)
  })

  it('deleteModel removes row', () => {
    const ch = makeChannel()
    const m = modelDao.createModel(db, { channelId: ch.id, modelName: 'x', capabilities: [], priority: 0, enabled: true })
    modelDao.deleteModel(db, m.id)
    expect(modelDao.getModel(db, m.id)).toBeUndefined()
  })

  it('UNIQUE(channel_id, model_name) constraint', () => {
    const ch = makeChannel()
    modelDao.createModel(db, { channelId: ch.id, modelName: 'dup', capabilities: [], priority: 0, enabled: true })
    expect(() =>
      modelDao.createModel(db, { channelId: ch.id, modelName: 'dup', capabilities: [], priority: 0, enabled: true })
    ).toThrow()
  })

  it('cascade delete when channel is deleted', () => {
    const ch = makeChannel()
    modelDao.createModel(db, { channelId: ch.id, modelName: 'x', capabilities: [], priority: 0, enabled: true })
    channelDao.deleteChannel(db, ch.id)
    expect(modelDao.listModels(db)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/main/modelDao.test.ts 2>&1 | tail -20`
Expected: FAIL — module `@/db/models/modelDao` not found

- [ ] **Step 3: Add models table DDL to database.ts**

In `src/main/db/database.ts`, add to the DDL string after the `stats_daily` table:

```sql
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(channel_id, model_name),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_models_channel ON models(channel_id);
```

- [ ] **Step 4: Implement modelDao.ts**

Create `src/main/db/models/modelDao.ts`:

```typescript
import type BetterSqlite3 from 'better-sqlite3'
import type { Model, Capability } from '@shared/types/gateway'

interface ModelRow {
  id: number
  channel_id: number
  model_name: string
  capabilities: string
  priority: number
  enabled: number
  created_at: string
  updated_at: string
}

function rowToModel(row: ModelRow): Model {
  return {
    id: row.id,
    channelId: row.channel_id,
    modelName: row.model_name,
    capabilities: JSON.parse(row.capabilities) as Capability[],
    priority: row.priority,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listModels(db: BetterSqlite3.Database): Model[] {
  const rows = db.prepare('SELECT * FROM models ORDER BY priority DESC, id').all() as ModelRow[]
  return rows.map(rowToModel)
}

export function listModelsByChannel(db: BetterSqlite3.Database, channelId: number): Model[] {
  const rows = db
    .prepare('SELECT * FROM models WHERE channel_id = ? ORDER BY priority DESC, id')
    .all(channelId) as ModelRow[]
  return rows.map(rowToModel)
}

export function getModel(db: BetterSqlite3.Database, id: number): Model | undefined {
  const row = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as ModelRow | undefined
  return row ? rowToModel(row) : undefined
}

export function createModel(
  db: BetterSqlite3.Database,
  data: Omit<Model, 'id' | 'createdAt' | 'updatedAt'>,
): Model {
  const result = db
    .prepare(
      'INSERT INTO models (channel_id, model_name, capabilities, priority, enabled) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      data.channelId,
      data.modelName,
      JSON.stringify(data.capabilities),
      data.priority,
      data.enabled ? 1 : 0,
    )
  return getModel(db, Number(result.lastInsertRowid))!
}

export function updateModel(
  db: BetterSqlite3.Database,
  id: number,
  data: Partial<Omit<Model, 'id' | 'channelId' | 'createdAt' | 'updatedAt'>>,
): void {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.modelName !== undefined) {
    sets.push('model_name = ?')
    values.push(data.modelName)
  }
  if (data.capabilities !== undefined) {
    sets.push('capabilities = ?')
    values.push(JSON.stringify(data.capabilities))
  }
  if (data.priority !== undefined) {
    sets.push('priority = ?')
    values.push(data.priority)
  }
  if (data.enabled !== undefined) {
    sets.push('enabled = ?')
    values.push(data.enabled ? 1 : 0)
  }

  if (sets.length === 0) return
  sets.push("updated_at = datetime('now')")
  values.push(id)
  db.prepare(`UPDATE models SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteModel(db: BetterSqlite3.Database, id: number): void {
  db.prepare('DELETE FROM models WHERE id = ?').run(id)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test test/main/modelDao.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/db/database.ts src/main/db/models/modelDao.ts test/main/modelDao.test.ts
git commit -m "feat: add models table DDL + modelDao with tests"
```

---

### Task 3: CapabilitySelector — Core selection engine

**Files:**
- Create: `src/main/gateway/selector.ts`
- Create: `test/main/selector.test.ts`

- [ ] **Step 1: Write selector tests**

Create `test/main/selector.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, closeDb, getDb } from '@/db'
import * as channelDao from '@/db/models/channelDao'
import * as modelDao from '@/db/models/modelDao'
import * as groupDao from '@/db/models/groupDao'
import { createCapabilitySelector } from '@/gateway/selector'
import { createCircuitBreaker } from '@/gateway/circuit'
import type BetterSqlite3 from 'better-sqlite3'

let db: BetterSqlite3.Database

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  closeDb()
})

function setup() {
  const ch = channelDao.createChannel(db, {
    name: 'test',
    type: 'openai',
    baseUrls: ['https://api.openai.com'],
    models: [],
    enabled: true,
    priority: 0,
    weight: 1,
  })

  // Create groups for each model (needed for groupName in ModelMatch)
  function addModel(name: string, caps: string[], priority: number) {
    const g = groupDao.createGroup(db, { name, balanceMode: 'failover' })
    groupDao.setGroupItems(db, g.id, [{ channelId: ch.id, modelName: name, priority: 0, weight: 1 }])
    return modelDao.createModel(db, {
      channelId: ch.id,
      modelName: name,
      capabilities: caps as any,
      priority,
      enabled: true,
    })
  }

  return { ch, addModel }
}

describe('CapabilitySelector', () => {
  it('select independent mode — returns best model per capability', () => {
    const { addModel } = setup()
    addModel('claude-sonnet', ['reasoning', 'chat', 'vision'], 10)
    addModel('deepseek-r1', ['reasoning', 'chat'], 5)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['reasoning', 'vision'])
    expect(result.missing).toEqual([])
    expect(result.matched.reasoning.modelName).toBe('claude-sonnet')
    expect(result.matched.vision.modelName).toBe('claude-sonnet')
  })

  it('select independent mode — different models for different caps', () => {
    const { addModel } = setup()
    addModel('deepseek-r1', ['reasoning'], 10)
    addModel('qwen-vl', ['vision'], 5)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['reasoning', 'vision'])
    expect(result.missing).toEqual([])
    expect(result.matched.reasoning.modelName).toBe('deepseek-r1')
    expect(result.matched.vision.modelName).toBe('qwen-vl')
  })

  it('select unified mode — single model must match all', () => {
    const { addModel } = setup()
    addModel('claude-sonnet', ['reasoning', 'vision'], 10)
    addModel('deepseek-r1', ['reasoning'], 5)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select([['reasoning', 'vision']])
    expect(result.missing).toEqual([])
    expect(result.matched['reasoning+vision'].modelName).toBe('claude-sonnet')
  })

  it('select unified mode — no single model matches → missing', () => {
    const { addModel } = setup()
    addModel('deepseek-r1', ['reasoning'], 10)
    addModel('qwen-vl', ['vision'], 5)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select([['reasoning', 'vision']])
    expect(result.missing).toEqual(['reasoning+vision'])
    expect(result.matched['reasoning+vision']).toBeUndefined()
  })

  it('select mixed mode', () => {
    const { addModel } = setup()
    addModel('claude-sonnet', ['reasoning', 'vision'], 10)
    addModel('dalle', ['image_gen'], 5)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select([['reasoning', 'vision'], 'image_gen'])
    expect(result.missing).toEqual([])
    expect(result.matched['reasoning+vision'].modelName).toBe('claude-sonnet')
    expect(result.matched.image_gen.modelName).toBe('dalle')
  })

  it('select respects priority ordering', () => {
    const { addModel } = setup()
    addModel('cheap', ['reasoning'], 1)
    addModel('expensive', ['reasoning'], 100)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['reasoning'])
    expect(result.matched.reasoning.modelName).toBe('expensive')
  })

  it('select skips disabled models', () => {
    const { ch, addModel } = setup()
    addModel('enabled', ['reasoning'], 5)
    const disabled = modelDao.createModel(db, {
      channelId: ch.id,
      modelName: 'disabled',
      capabilities: ['reasoning'],
      priority: 100,
      enabled: false,
    })
    groupDao.createGroup(db, { name: 'disabled', balanceMode: 'failover' })
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['reasoning'])
    expect(result.matched.reasoning.modelName).toBe('enabled')
  })

  it('select returns missing when no model has capability', () => {
    setup()
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['image_gen'])
    expect(result.missing).toEqual(['image_gen'])
  })

  it('hasCapability returns true/false', () => {
    const { addModel } = setup()
    addModel('m', ['reasoning', 'chat'], 1)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    expect(selector.hasCapability('reasoning')).toBe(true)
    expect(selector.hasCapability('image_gen')).toBe(false)
  })

  it('availableCapabilities returns deduplicated list', () => {
    const { addModel } = setup()
    addModel('a', ['reasoning', 'chat'], 1)
    addModel('b', ['reasoning', 'vision'], 2)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const caps = selector.availableCapabilities()
    expect(caps.sort()).toEqual(['chat', 'reasoning', 'vision'])
  })

  it('modelsWithCapability returns matching models sorted by priority', () => {
    const { addModel } = setup()
    addModel('low', ['reasoning'], 1)
    addModel('high', ['reasoning'], 10)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const models = selector.modelsWithCapability('reasoning')
    expect(models).toHaveLength(2)
    expect(models[0].modelName).toBe('high')
    expect(models[1].modelName).toBe('low')
  })

  it('groupName in ModelMatch corresponds to a group with same name as model', () => {
    const { addModel } = setup()
    addModel('claude-sonnet', ['reasoning'], 10)
    const selector = createCapabilitySelector(db, createCircuitBreaker())

    const result = selector.select(['reasoning'])
    expect(result.matched.reasoning.groupName).toBe('claude-sonnet')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/main/selector.test.ts 2>&1 | tail -10`
Expected: FAIL — module `@/gateway/selector` not found

- [ ] **Step 3: Implement selector.ts**

Create `src/main/gateway/selector.ts`:

```typescript
import type BetterSqlite3 from 'better-sqlite3'
import type {
  Capability,
  CapabilityRequirement,
  ModelMatch,
  SelectResult,
  Model,
} from '@shared/types/gateway'
import type { CircuitBreaker } from './circuit'
import * as modelDao from '@/db/models/modelDao'
import * as groupDao from '@/db/models/groupDao'

export interface CapabilitySelector {
  select(requirements: CapabilityRequirement): SelectResult
  hasCapability(cap: Capability): boolean
  availableCapabilities(): Capability[]
  modelsWithCapability(cap: Capability): ModelMatch[]
}

export function createCapabilitySelector(
  db: BetterSqlite3.Database,
  circuit: CircuitBreaker,
): CapabilitySelector {
  function getEnabledModels(): Model[] {
    return modelDao.listModels(db).filter((m) => m.enabled)
  }

  function toMatch(model: Model): ModelMatch {
    return {
      modelId: model.id,
      modelName: model.modelName,
      channelId: model.channelId,
      groupName: model.modelName,
      capabilities: model.capabilities,
    }
  }

  function modelsWithAllCaps(models: Model[], caps: Capability[]): Model[] {
    return models.filter((m) => caps.every((c) => m.capabilities.includes(c)))
  }

  return {
    select(requirements) {
      const models = getEnabledModels()
      const matched: Record<string, ModelMatch> = {}
      const missing: string[] = []

      for (const req of requirements) {
        if (typeof req === 'string') {
          const candidates = modelsWithAllCaps(models, [req])
          if (candidates.length > 0) {
            matched[req] = toMatch(candidates[0])
          } else {
            missing.push(req)
          }
        } else {
          const key = req.join('+')
          const candidates = modelsWithAllCaps(models, req)
          if (candidates.length > 0) {
            matched[key] = toMatch(candidates[0])
          } else {
            missing.push(key)
          }
        }
      }

      return { matched, missing }
    },

    hasCapability(cap) {
      return getEnabledModels().some((m) => m.capabilities.includes(cap))
    },

    availableCapabilities() {
      const caps = new Set<Capability>()
      for (const m of getEnabledModels()) {
        for (const c of m.capabilities) caps.add(c)
      }
      return [...caps]
    },

    modelsWithCapability(cap) {
      return getEnabledModels()
        .filter((m) => m.capabilities.includes(cap))
        .map(toMatch)
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/main/selector.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/gateway/selector.ts test/main/selector.test.ts
git commit -m "feat: add CapabilitySelector with tests"
```

---

### Task 4: Remove Slot infrastructure — Router, Registry, GroupDao, Gateway index

**Files:**
- Delete: `src/main/gateway/registry.ts`
- Modify: `src/main/gateway/router.ts`
- Modify: `src/main/gateway/index.ts`
- Modify: `src/main/db/models/groupDao.ts`

- [ ] **Step 1: Delete registry.ts**

Run: `rm src/main/gateway/registry.ts`

- [ ] **Step 2: Remove getGroupsWithSlot from router.ts**

In `src/main/gateway/router.ts`, remove the `getGroupsWithSlot` method from the Router interface and implementation. The interface becomes:

```typescript
export interface Router {
  reload(db: BetterSqlite3.Database): void;
  resolve(model: string): { group: Group; items: GroupItem[] } | undefined;
  listGroupNames(): string[];
}
```

Remove the `getGroupsWithSlot` function body from the `createRouter` return object.

- [ ] **Step 3: Update gateway/index.ts — remove resolveSlot, add selector**

In `src/main/gateway/index.ts`:
- Remove: `export { resolveSlot } from "./registry";`
- Add: `export { createCapabilitySelector, type CapabilitySelector } from "./selector";`

- [ ] **Step 4: Remove slot fields from groupDao.ts**

In `src/main/db/models/groupDao.ts`:
- Remove `import type { ... ModelSlot } from "@shared/types/gateway"` (keep Group, GroupItem)
- Remove `slot_category`, `slot_tier`, `slot_level` from `GroupRow` interface
- Remove slot-related logic from `rowToGroup` (the `if (row.slot_category)` block)
- Remove slot params from `createGroup` INSERT statement (only insert `name`, `balance_mode`)
- Remove the slot `if (data.slot !== undefined)` block from `updateGroup`

- [ ] **Step 5: Run all existing tests to check breakage**

Run: `pnpm test 2>&1 | tail -30`
Expected: Some tests may fail due to slot references. Note failing tests.

- [ ] **Step 6: Fix test/main/db.test.ts — remove slot-related group tests**

In `test/main/db.test.ts`, in the groupDao describe block:
- Update "createGroup with slot" test — remove slot param, just test basic creation
- Update "updateGroup balanceMode and slot" — remove slot assertion, only test balanceMode

- [ ] **Step 7: Fix test/main/gatewayPresenter.test.ts — remove resolveSlot tests**

In `test/main/gatewayPresenter.test.ts`:
- Remove the entire `describe("resolveSlot", ...)` block (the two tests: "slot 有匹配" and "无匹配")
- Remove any `slot` params from createGroup calls

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test test/main/db.test.ts test/main/gatewayPresenter.test.ts test/main/gateway-router.test.ts`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove Slot infrastructure (registry, router.getGroupsWithSlot, groupDao slot fields)"
```

---

### Task 5: GatewayPresenter — Add model CRUD + selector, remove resolveSlot

**Files:**
- Modify: `src/shared/types/presenters/gateway.presenter.d.ts`
- Modify: `src/main/presenter/gatewayPresenter.ts`
- Modify: `test/main/gatewayPresenter.test.ts`

- [ ] **Step 1: Write tests for new model CRUD + selector methods**

Add to `test/main/gatewayPresenter.test.ts`:

```typescript
describe('Model CRUD', () => {
  it('创建/列表/更新/删除', () => {
    const ch = gw.createChannel({
      name: 'ch',
      type: 'openai',
      baseUrls: ['https://api.openai.com'],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    })

    const model = gw.createModel({
      channelId: ch.id,
      modelName: 'gpt-4o',
      capabilities: ['reasoning', 'chat', 'vision'],
      priority: 10,
      enabled: true,
    })
    expect(model.id).toBeGreaterThan(0)
    expect(model.capabilities).toEqual(['reasoning', 'chat', 'vision'])

    expect(gw.listModels()).toHaveLength(1)
    expect(gw.listModelsByChannel(ch.id)).toHaveLength(1)

    gw.updateModel(model.id, { priority: 20 })
    expect(gw.listModels()[0].priority).toBe(20)

    gw.deleteModel(model.id)
    expect(gw.listModels()).toHaveLength(0)
  })
})

describe('CapabilitySelector via presenter', () => {
  it('select returns matched model', () => {
    const ch = gw.createChannel({
      name: 'ch',
      type: 'openai',
      baseUrls: ['https://api.openai.com'],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    })
    gw.createGroup({ name: 'gpt-4o', balanceMode: 'failover' })
    gw.createModel({
      channelId: ch.id,
      modelName: 'gpt-4o',
      capabilities: ['reasoning', 'chat'],
      priority: 10,
      enabled: true,
    })

    const result = gw.select(['reasoning'])
    expect(result.matched.reasoning.modelName).toBe('gpt-4o')
    expect(result.missing).toEqual([])
  })

  it('hasCapability / availableCapabilities', () => {
    const ch = gw.createChannel({
      name: 'ch',
      type: 'openai',
      baseUrls: ['https://api.openai.com'],
      models: [],
      enabled: true,
      priority: 0,
      weight: 1,
    })
    gw.createModel({
      channelId: ch.id,
      modelName: 'm',
      capabilities: ['reasoning', 'vision'],
      priority: 0,
      enabled: true,
    })

    expect(gw.hasCapability('reasoning')).toBe(true)
    expect(gw.hasCapability('image_gen')).toBe(false)
    expect(gw.availableCapabilities().sort()).toEqual(['reasoning', 'vision'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/main/gatewayPresenter.test.ts 2>&1 | tail -10`
Expected: FAIL — `gw.createModel` is not a function

- [ ] **Step 3: Update gateway.presenter.d.ts**

In `src/shared/types/presenters/gateway.presenter.d.ts`:

Add imports: `Model, Capability, CapabilityRequirement, SelectResult`

Remove: `ModelSlot` import and `resolveSlot(slot: ModelSlot): string | undefined;`

Add these methods:

```typescript
  // Models
  listModels(): Model[];
  listModelsByChannel(channelId: number): Model[];
  createModel(data: Omit<Model, 'id' | 'createdAt' | 'updatedAt'>): Model;
  updateModel(id: number, data: Partial<Model>): void;
  deleteModel(id: number): void;

  // Capability Selection
  select(requirements: CapabilityRequirement): SelectResult;
  hasCapability(cap: Capability): boolean;
  availableCapabilities(): Capability[];
```

- [ ] **Step 4: Implement in gatewayPresenter.ts**

In `src/main/presenter/gatewayPresenter.ts`:

Add imports:
```typescript
import * as modelDao from '@/db/models/modelDao'
import { createCapabilitySelector } from '@/gateway/selector'
import type { CapabilitySelector } from '@/gateway/selector'
import type { Model, Capability, CapabilityRequirement, SelectResult } from '@shared/types/gateway'
```

Remove: `resolveSlot` import and `resolveSlot` method.

Add a private `selector` field initialized in constructor:
```typescript
private selector: CapabilitySelector;
// In constructor, after creating circuitBreaker:
this.selector = createCapabilitySelector(getDb(), circuitBreaker);
```

Add model CRUD methods:
```typescript
  listModels(): Model[] {
    return modelDao.listModels(getDb())
  }

  listModelsByChannel(channelId: number): Model[] {
    return modelDao.listModelsByChannel(getDb(), channelId)
  }

  createModel(data: Omit<Model, 'id' | 'createdAt' | 'updatedAt'>): Model {
    return modelDao.createModel(getDb(), data)
  }

  updateModel(id: number, data: Partial<Model>): void {
    modelDao.updateModel(getDb(), id, data)
  }

  deleteModel(id: number): void {
    modelDao.deleteModel(getDb(), id)
  }
```

Add selector proxy methods:
```typescript
  select(requirements: CapabilityRequirement): SelectResult {
    return this.selector.select(requirements)
  }

  hasCapability(cap: Capability): boolean {
    return this.selector.hasCapability(cap)
  }

  availableCapabilities(): Capability[] {
    return this.selector.availableCapabilities()
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test test/main/gatewayPresenter.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/presenters/gateway.presenter.d.ts src/main/presenter/gatewayPresenter.ts test/main/gatewayPresenter.test.ts
git commit -m "feat: add model CRUD + capability selector to GatewayPresenter"
```

---

### Task 6: AgentPresenter — Replace resolveSlot with selector.select

**Files:**
- Modify: `src/main/presenter/agentPresenter.ts`

- [ ] **Step 1: Replace resolveSlot call**

In `src/main/presenter/agentPresenter.ts`, around line 296-309, replace:

```typescript
    const slotModel = this.gatewayPresenter.resolveSlot({
      category: "text",
      tier: "reasoning",
      level: "auto",
    });
    if (!slotModel) {
```

With:

```typescript
    const selectResult = this.gatewayPresenter.select(["reasoning"]);
    const slotModel = selectResult.matched.reasoning?.groupName;
    if (!slotModel) {
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck 2>&1 | tail -20`
Expected: No errors related to agentPresenter

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/agentPresenter.ts
git commit -m "refactor: AgentPresenter uses selector.select instead of resolveSlot"
```

---

### Task 7: Gateway Settings — Remove Slot mapping UI

**Files:**
- Modify: `src/renderer/src/components/settings/GatewaySettings.vue`
- Modify: `test/renderer/components/SettingsDialog.test.ts`

- [ ] **Step 1: Remove Slot mapping from GatewaySettings.vue**

In `src/renderer/src/components/settings/GatewaySettings.vue`:

Template: Remove the entire `<!-- Slot 映射 -->` fieldset block (the `<fieldset>` containing the slot `v-for` with selects).

Script: Remove the following:
- `import type { ModelSlot } from "@shared/types/gateway"`
- The `SlotDef` interface
- The `SLOTS` array
- The `slotGroupMap` computed
- The `slotToKey` function
- The `onSlotChange` function
- `useGatewayStore` import and `gatewayStore` usage (if only used for slots)
- The `groups` computed

Keep: port, circuit breaker, data retention fields, and the save button logic.

- [ ] **Step 2: Update SettingsDialog test if needed**

In `test/renderer/components/SettingsDialog.test.ts`, the existing tests just check open/close and default tab. They should still pass. Verify:

Run: `pnpm test test/renderer/components/SettingsDialog.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/settings/GatewaySettings.vue test/renderer/components/SettingsDialog.test.ts
git commit -m "refactor: remove Slot mapping UI from GatewaySettings"
```

---

### Task 8: Onboarding — Replace SlotMappingStep with CapabilityTagStep

**Files:**
- Create: `src/renderer/src/components/onboarding/CapabilityTagStep.vue`
- Delete: `src/renderer/src/components/onboarding/SlotMappingStep.vue`
- Modify: `src/renderer/src/components/onboarding/OnboardingWizard.vue`
- Modify: `test/renderer/components/OnboardingWizard.test.ts`

- [ ] **Step 1: Create CapabilityTagStep.vue**

Create `src/renderer/src/components/onboarding/CapabilityTagStep.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Capability } from '@shared/types/gateway'

const ALL_CAPS: { key: Capability; label: string; icon: string }[] = [
  { key: 'reasoning', label: 'reasoning', icon: '🧠' },
  { key: 'chat', label: 'chat', icon: '💬' },
  { key: 'vision', label: 'vision', icon: '👁' },
  { key: 'image_gen', label: 'image_gen', icon: '🎨' },
]

const props = defineProps<{
  selectedModels: string[]
  modelCapabilities: Record<string, Capability[]>
}>()

const emit = defineEmits<{
  'update:modelCapabilities': [value: Record<string, Capability[]>]
  next: []
  prev: []
}>()

function toggleCap(model: string, cap: Capability) {
  const current = props.modelCapabilities[model] || []
  const updated = current.includes(cap) ? current.filter((c) => c !== cap) : [...current, cap]
  emit('update:modelCapabilities', { ...props.modelCapabilities, [model]: updated })
}

function hasCap(model: string, cap: Capability): boolean {
  return (props.modelCapabilities[model] || []).includes(cap)
}

const hasReasoning = computed(() =>
  Object.values(props.modelCapabilities).some((caps) => caps.includes('reasoning')),
)
</script>

<template>
  <div
    data-testid="capability-tag-step"
    class="flex w-full max-w-[420px] flex-col items-center gap-4"
  >
    <h2 class="text-[17px] font-semibold text-slate-200">标注模型能力</h2>
    <p class="text-sm text-slate-400">
      为每个模型标注其支持的能力，Slime 会据此解锁对应的功能组件。
    </p>

    <div class="flex w-full flex-col gap-3">
      <div
        v-for="model in selectedModels"
        :key="model"
        class="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3"
      >
        <div class="mb-2 text-sm font-medium text-slate-200">{{ model }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="cap in ALL_CAPS"
            :key="cap.key"
            :data-testid="`cap-${model}-${cap.key}`"
            class="rounded-md border px-3 py-1 text-xs transition-colors"
            :class="
              hasCap(model, cap.key)
                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                : 'border-slate-600 bg-transparent text-slate-500'
            "
            @click="toggleCap(model, cap.key)"
          >
            {{ cap.icon }} {{ cap.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Warning -->
    <div
      v-if="!hasReasoning"
      class="w-full rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-400"
    >
      ⚠ Slime 的基础功能需要推理能力，请确保至少标注一个模型为 reasoning。
    </div>

    <!-- Nav -->
    <div class="mt-2 flex gap-2.5">
      <button
        data-testid="prev-btn"
        class="rounded-[20px] border border-violet-500/30 bg-transparent px-6 py-2.5 text-sm text-violet-300"
        @click="emit('prev')"
      >
        &larr; 返回
      </button>
      <button
        data-testid="next-btn"
        class="rounded-[20px] px-6 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        style="background: linear-gradient(135deg, #7c3aed, #a855f7)"
        :disabled="!hasReasoning"
        @click="emit('next')"
      >
        下一步 &rarr;
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Update OnboardingWizard.vue**

In `src/renderer/src/components/onboarding/OnboardingWizard.vue`:

Replace SlotMappingStep import with CapabilityTagStep:
```typescript
import CapabilityTagStep from './CapabilityTagStep.vue'
```

Remove: `import SlotMappingStep from "./SlotMappingStep.vue"`

Remove: `import type { ... ModelSlot } from "@shared/types/gateway"` (keep `ChannelType`)

Add to `config` reactive:
```typescript
modelCapabilities: {} as Record<string, string[]>,
```

Remove: `slotMapping: {} as Record<string, string>,`

Remove the `SLOT_MAP` constant.

Remove the `watch` for auto-filling slots.

In the template, replace the SlotMappingStep `v-else-if="currentStep === 2"` block with:
```vue
<CapabilityTagStep
  v-else-if="currentStep === 2"
  v-model:model-capabilities="config.modelCapabilities"
  :selected-models="config.selectedModels"
  @next="next"
  @prev="prev"
/>
```

In the IdentityCompleteStep, remove `:slot-mapping` prop.

In the `complete()` function, replace the slot assignment loop (step 4) with model creation:

```typescript
    // 3. Create groups + models for selected models
    for (const model of config.selectedModels) {
      const group = (await gw('createGroup', {
        name: model,
        balanceMode: 'failover',
      })) as { id: number }
      await gw('setGroupItems', group.id, [
        { channelId: channel.id, modelName: model, priority: 0, weight: 1 },
      ])
      const caps = config.modelCapabilities[model] || []
      await gw('createModel', {
        channelId: channel.id,
        modelName: model,
        capabilities: caps,
        priority: 0,
        enabled: true,
      })
    }
```

Remove the old step 4 (slot assignment for-loop).

- [ ] **Step 3: Delete SlotMappingStep.vue**

Run: `rm src/renderer/src/components/onboarding/SlotMappingStep.vue`

- [ ] **Step 4: Update OnboardingWizard test**

In `test/renderer/components/OnboardingWizard.test.ts`, the existing tests only check WelcomeStep and navigation to AddChannelStep — neither touches SlotMappingStep. But verify they still pass. No changes needed if they pass.

Run: `pnpm test test/renderer/components/OnboardingWizard.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace SlotMappingStep with CapabilityTagStep in onboarding"
```

---

### Task 9: Gateway Store + ChannelTab — Model capability management UI

**Files:**
- Modify: `src/renderer/src/stores/gateway.ts`
- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`

- [ ] **Step 1: Add models state to gateway store**

In `src/renderer/src/stores/gateway.ts`:

Add import: `import type { ... Model } from "@shared/types/gateway"`

Add ref:
```typescript
const models = ref<Map<number, Model[]>>(new Map())
```

Add load function:
```typescript
async function loadModelsByChannel(channelId: number) {
  const list = await gw.listModelsByChannel(channelId)
  models.value = new Map(models.value).set(channelId, list)
}
```

Add to return object: `models`, `loadModelsByChannel`

- [ ] **Step 2: Add model capability management to ChannelTab.vue**

In `src/renderer/src/components/gateway/ChannelTab.vue`:

Add imports:
```typescript
import type { Capability, Model } from '@shared/types/gateway'
```

Add to script:
```typescript
const ALL_CAPS: { key: Capability; label: string; icon: string }[] = [
  { key: 'reasoning', label: 'reasoning', icon: '🧠' },
  { key: 'chat', label: 'chat', icon: '💬' },
  { key: 'vision', label: 'vision', icon: '👁' },
  { key: 'image_gen', label: 'image_gen', icon: '🎨' },
]

const selectedChannelId = ref<number | null>(null)

async function selectChannel(ch: Channel) {
  selectedChannelId.value = ch.id
  await store.loadModelsByChannel(ch.id)
}

const channelModels = computed(() =>
  selectedChannelId.value ? store.models.get(selectedChannelId.value) ?? [] : [],
)

async function toggleModelCap(model: Model, cap: Capability) {
  const caps = model.capabilities.includes(cap)
    ? model.capabilities.filter((c) => c !== cap)
    : [...model.capabilities, cap]
  await gw.updateModel(model.id, { capabilities: caps })
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value)
}

async function updateModelPriority(model: Model, priority: number) {
  await gw.updateModel(model.id, { priority })
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value)
}

async function toggleModelEnabled(model: Model) {
  await gw.updateModel(model.id, { enabled: !model.enabled })
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value)
}

async function addModelToChannel(channelId: number, modelName: string) {
  await gw.createModel({ channelId, modelName, capabilities: [], priority: 0, enabled: true })
  await store.loadModelsByChannel(channelId)
}

async function removeModelFromChannel(modelId: number) {
  await gw.deleteModel(modelId)
  if (selectedChannelId.value) await store.loadModelsByChannel(selectedChannelId.value)
}

const newModelName = ref('')
```

In the template, after the channel list item `v-for`, add a click handler to select:
```
@click="selectChannel(ch)"
```

After the channel list section, add a model list section that shows when a channel is selected. This section displays model cards with capability tag toggles, priority input, and enable/disable button — matching the design mockup from the brainstorming session.

The template structure is: channel list on left → when a channel is selected, show its models below (or beside, depending on available space). Each model card shows:
- Model name + enabled badge
- Priority input
- Capability tag buttons (toggle on click)
- Delete button

Add model input: text field + "添加" button that calls `addModelToChannel`.

- [ ] **Step 3: Run format and lint**

Run: `pnpm run format && pnpm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/gateway.ts src/renderer/src/components/gateway/ChannelTab.vue
git commit -m "feat: add model capability management to ChannelTab"
```

---

### Task 10: useCapability composable

**Files:**
- Create: `src/renderer/src/composables/useCapability.ts`

- [ ] **Step 1: Implement useCapabilityCheck composable**

Create `src/renderer/src/composables/useCapability.ts`:

```typescript
import { ref, onMounted } from 'vue'
import { usePresenter } from './usePresenter'
import type { Capability, CapabilityRequirement } from '@shared/types/gateway'

export function useCapabilityCheck(requirements: CapabilityRequirement) {
  const gw = usePresenter('gatewayPresenter')
  const available = ref(false)
  const missing = ref<string[]>([])

  async function check() {
    const result = await gw.select(requirements)
    missing.value = result.missing
    available.value = result.missing.length === 0
  }

  onMounted(check)

  return { available, missing, refresh: check }
}

export function useAvailableCapabilities() {
  const gw = usePresenter('gatewayPresenter')
  const capabilities = ref<Capability[]>([])

  async function load() {
    capabilities.value = await gw.availableCapabilities()
  }

  onMounted(load)

  return { capabilities, refresh: load }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/composables/useCapability.ts
git commit -m "feat: add useCapabilityCheck composable"
```

---

### Task 11: Cleanup + remove groups_ slot columns from DDL + format/lint/typecheck

**Files:**
- Modify: `src/main/db/database.ts`

- [ ] **Step 1: Remove slot columns from groups_ DDL**

In `src/main/db/database.ts`, update the `groups_` table DDL — remove the three slot columns:

```sql
CREATE TABLE IF NOT EXISTS groups_ (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  balance_mode TEXT NOT NULL DEFAULT 'round_robin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Note: Existing databases with the old columns will still work — SQLite ignores extra columns. For new databases the columns simply won't exist.

- [ ] **Step 2: Run full format + lint + typecheck**

Run: `pnpm run format && pnpm run lint && pnpm run typecheck`
Expected: All pass. If there are remaining references to Slot types, fix them.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove slot columns from DDL, final cleanup"
```

---

## Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Types — Add Capability/Model, remove Slot | 3 min |
| 2 | Database — models table DDL + modelDao + tests | 5 min |
| 3 | CapabilitySelector — core engine + tests | 5 min |
| 4 | Remove Slot infrastructure | 5 min |
| 5 | GatewayPresenter — model CRUD + selector | 5 min |
| 6 | AgentPresenter — replace resolveSlot | 2 min |
| 7 | GatewaySettings — remove Slot UI | 3 min |
| 8 | Onboarding — CapabilityTagStep | 5 min |
| 9 | ChannelTab — model capability management | 5 min |
| 10 | useCapability composable | 2 min |
| 11 | Cleanup + format/lint/typecheck | 3 min |
