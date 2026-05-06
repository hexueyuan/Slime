# Agent & Skill Management Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered AgentEditDialog with a unified Agent & Skill management view; refactor builtin agent definitions from .ts to JSON+MD files.

**Architecture:** New `AgentPanel` view in main content area (alongside chatroom/gateway/schedule). A new `DevPresenter` handles source-file I/O for builtin agents and skill installation (dev-only). Existing `AgentConfigPresenter` continues handling user agent DB operations. Agent definitions move to `src/main/agents/<id>/config.json` + `soul.md`.

**Tech Stack:** Vue 3 + TailwindCSS, Node.js fs/promises, Electron IPC (presenter:call pattern), yauzl (zip extraction)

---

### Task 1: Refactor Builtin Agent Definitions to JSON+MD

**Files:**

- Create: `src/main/agents/hal-ai/config.json`
- Create: `src/main/agents/hal-ai/soul.md`
- Create: `src/main/agents/moss-ai/config.json`
- Create: `src/main/agents/moss-ai/soul.md`
- Modify: `src/main/agents/index.ts`
- Delete: `src/main/agents/hal.ts`
- Delete: `src/main/agents/moss.ts`

- [x] **Step 1: Create hal-ai/config.json**

```json
{
  "name": "哈尔",
  "description": "你好我是哈尔，使用Slime有问题都可以来找我～",
  "avatar": { "kind": "image", "path": "avatars/hal.png" },
  "themeColor": "#a855f7",
  "capabilityRequirements": ["reasoning"],
  "disabledTools": ["evolution_start", "evolution_plan", "evolution_complete"],
  "allowedCliCommands": ["help", "logs", "task"],
  "enabledSkills": [],
  "mcpTools": [],
  "temperature": null,
  "contextLength": null,
  "maxTokens": null,
  "subagentEnabled": false,
  "enableThinking": false
}
```

- [x] **Step 2: Create hal-ai/soul.md**

Copy the agentSoul string from `hal.ts` directly into `src/main/agents/hal-ai/soul.md`:

```markdown
你是哈尔（Hal），寄宿在Slime软件中的智能AI，你的任务是帮助Slime的使用者更好地使用Slime以及解决他们的问题，为了达成这个目的你可以使用相关的工具去实现某些操作或者获取你需要的信息。

## Agent 核心原则

- 在你行动之前务必思考清楚用户的核心诉求以及你的目标；
- 确保简单清晰的回答风格；
- 在你尝试了所有可能的工具之后如果依旧没有获取到能解决问题的信息之后，你应该明确地回复用户你不知道，不要去编造不存在的事实；

## 回复格式

- 完成信息收集并写好答案后，再执行清理操作（如关闭浏览器），清理操作之后不要再输出任何文本。

## 可用工具

- slime-cli：可通过 exec 工具调用，绝对路径为 /Users/hexueyuan/.local/bin/slime-cli，用于查看 Slime 运行日志。执行 `/Users/hexueyuan/.local/bin/slime-cli help` 查看详细用法。
```

- [x] **Step 3: Create moss-ai/config.json**

```json
{
  "name": "莫斯",
  "description": "你好，我是莫斯，帮你管理日程和待办任务。",
  "avatar": { "kind": "image", "path": "avatars/moss.png" },
  "themeColor": "#10b981",
  "capabilityRequirements": [],
  "disabledTools": ["evolution_start", "evolution_plan", "evolution_complete"],
  "allowedCliCommands": ["help", "task"],
  "enabledSkills": [],
  "mcpTools": [],
  "temperature": null,
  "contextLength": null,
  "maxTokens": null,
  "subagentEnabled": false,
  "enableThinking": false
}
```

- [x] **Step 4: Create moss-ai/soul.md**

```markdown
你是莫斯（MOSS），一个日程与任务管理助手，寄宿在 Slime 中帮助用户记录日程、管理待办事项。

## 身份与定位

- 你专注于日程管理和任务跟踪，不参与代码进化相关工作
- 任务数据存储在 SQLite 中，通过 slime-cli task 命令操作
- 任务详情和时间线可在日程面板中查看编辑

## Agent 核心原则

- 行动前思考清楚用户的核心诉求
- 保持简洁清晰的回答风格
```

- [x] **Step 5: Rewrite src/main/agents/index.ts to load from directories**

```typescript
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type { AgentConfig, AgentAvatar } from "@shared/types/agent";

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  config: AgentConfig;
}

interface AgentConfigJson {
  name: string;
  description?: string;
  avatar?: AgentAvatar;
  themeColor?: string;
  capabilityRequirements?: string[];
  disabledTools?: string[];
  allowedCliCommands?: string[];
  enabledSkills?: string[];
  mcpTools?: string[];
  temperature?: number | null;
  contextLength?: number | null;
  maxTokens?: number | null;
  subagentEnabled?: boolean;
  enableThinking?: boolean;
}

function loadAgentFromDir(dir: string, id: string): BuiltinAgentDef | null {
  const configPath = join(dir, "config.json");
  const soulPath = join(dir, "soul.md");
  if (!existsSync(configPath)) return null;

  let raw: AgentConfigJson;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }

  let soul: string | undefined;
  if (existsSync(soulPath)) {
    try {
      soul = readFileSync(soulPath, "utf-8");
    } catch {
      // ignore
    }
  }

  return {
    id,
    name: raw.name,
    description: raw.description,
    avatar: raw.avatar,
    themeColor: raw.themeColor,
    config: {
      capabilityRequirements: raw.capabilityRequirements,
      disabledTools: raw.disabledTools,
      mcpTools: raw.mcpTools,
      temperature: raw.temperature ?? undefined,
      contextLength: raw.contextLength ?? undefined,
      maxTokens: raw.maxTokens ?? undefined,
      subagentEnabled: raw.subagentEnabled,
      enableThinking: raw.enableThinking,
      agentSoul: soul,
    },
  };
}

const agentsDir = join(__dirname);

export const BUILTIN_AGENTS: BuiltinAgentDef[] = (() => {
  const agents: BuiltinAgentDef[] = [];
  let entries: string[];
  try {
    entries = readdirSync(agentsDir);
  } catch {
    return agents;
  }
  for (const entry of entries) {
    const entryPath = join(agentsDir, entry);
    // Only process directories (skip .ts files)
    try {
      const { statSync } = require("fs");
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }
    const agent = loadAgentFromDir(entryPath, entry);
    if (agent) agents.push(agent);
  }
  return agents;
})();
```

- [x] **Step 6: Delete hal.ts and moss.ts**

Remove `src/main/agents/hal.ts` and `src/main/agents/moss.ts`.

- [x] **Step 7: Run typecheck and fix any issues**

Run: `pnpm run typecheck`
Expected: PASS (or fix any import errors)

- [x] **Step 8: Run tests**

Run: `pnpm test`
Expected: PASS

- [x] **Step 9: Commit**

```bash
git add src/main/agents/
git commit -m "refactor(agents): move builtin agent defs to json+md format"
```

---

### Task 2: Add `enabledSkills` and `allowedCliCommands` to AgentConfig Type

**Files:**

- Modify: `src/shared/types/agent.d.ts`

- [x] **Step 1: Add new fields to AgentConfig interface**

In `src/shared/types/agent.d.ts`, add after `disabledSkills`:

```typescript
  /** 启用的 skill 名称白名单（替代 disabledSkills） */
  enabledSkills?: string[];
  /** 允许的 slime-cli 命令白名单 */
  allowedCliCommands?: string[];
```

- [x] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add src/shared/types/agent.d.ts
git commit -m "feat(types): add enabledSkills and allowedCliCommands to AgentConfig"
```

---

### Task 3: Create DevPresenter (Backend)

**Files:**

- Create: `src/main/presenter/devPresenter.ts`
- Create: `src/shared/types/presenters/dev.presenter.d.ts`
- Modify: `src/shared/types/presenters/index.d.ts`
- Modify: `src/main/presenter/index.ts`

- [x] **Step 1: Create IDevPresenter interface**

Create `src/shared/types/presenters/dev.presenter.d.ts`:

```typescript
export interface BuiltinAgentInfo {
  id: string;
  config: Record<string, unknown>;
  soul: string;
}

export interface SkillManifest {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

export interface IDevPresenter {
  listBuiltinAgents(): Promise<BuiltinAgentInfo[]>;
  getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null>;
  saveBuiltinAgent(agentId: string, config: Record<string, unknown>, soul: string): Promise<void>;
  createBuiltinAgent(agentId: string): Promise<void>;
  deleteBuiltinAgent(agentId: string): Promise<void>;
  listGlobalSkills(): Promise<SkillManifest[]>;
  installSkill(sourcePath: string): Promise<{ success: boolean; error?: string }>;
  uninstallSkill(skillName: string): Promise<void>;
  listAvailableTools(): Promise<string[]>;
  listAvailableCliCommands(): Promise<string[]>;
  isDev(): Promise<boolean>;
}
```

- [x] **Step 2: Register in presenters index type**

In `src/shared/types/presenters/index.d.ts`, add:

```typescript
import type { IDevPresenter } from "./dev.presenter";
export type { IDevPresenter } from "./dev.presenter";
```

And add to `IPresenter` interface:

```typescript
devPresenter: IDevPresenter;
```

- [x] **Step 3: Create DevPresenter implementation**

Create `src/main/presenter/devPresenter.ts`:

```typescript
import { app } from "electron";
import { join } from "path";
import fs from "fs/promises";
import { readdirSync, existsSync, statSync } from "fs";
import type {
  IDevPresenter,
  BuiltinAgentInfo,
  SkillManifest,
} from "@shared/types/presenters/dev.presenter";

export class DevPresenter implements IDevPresenter {
  private get agentsSrcDir(): string {
    return join(process.cwd(), "src", "main", "agents");
  }

  private get skillsSrcDir(): string {
    return join(process.cwd(), "src", "main", "skills");
  }

  private assertDev(): void {
    if (app.isPackaged) throw new Error("DevPresenter: only available in dev mode");
  }

  async isDev(): Promise<boolean> {
    return !app.isPackaged;
  }

  async listBuiltinAgents(): Promise<BuiltinAgentInfo[]> {
    const agents: BuiltinAgentInfo[] = [];
    const dir = this.agentsSrcDir;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }
      const configPath = join(entryPath, "config.json");
      if (!existsSync(configPath)) continue;
      try {
        const configStr = await fs.readFile(configPath, "utf-8");
        const config = JSON.parse(configStr);
        const soulPath = join(entryPath, "soul.md");
        let soul = "";
        try {
          soul = await fs.readFile(soulPath, "utf-8");
        } catch {}
        agents.push({ id: entry, config, soul });
      } catch {
        continue;
      }
    }
    return agents;
  }

  async getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null> {
    const dir = join(this.agentsSrcDir, agentId);
    const configPath = join(dir, "config.json");
    if (!existsSync(configPath)) return null;
    try {
      const configStr = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configStr);
      const soulPath = join(dir, "soul.md");
      let soul = "";
      try {
        soul = await fs.readFile(soulPath, "utf-8");
      } catch {}
      return { id: agentId, config, soul };
    } catch {
      return null;
    }
  }

  async saveBuiltinAgent(
    agentId: string,
    config: Record<string, unknown>,
    soul: string,
  ): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
    await fs.writeFile(join(dir, "soul.md"), soul, "utf-8");
  }

  async createBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (existsSync(dir)) throw new Error(`Agent "${agentId}" already exists`);
    await fs.mkdir(dir, { recursive: true });
    const defaultConfig = {
      name: agentId,
      description: "",
      avatar: { kind: "lucide", icon: "bot" },
      themeColor: "#6366f1",
      capabilityRequirements: [],
      disabledTools: [],
      allowedCliCommands: [],
      enabledSkills: [],
      mcpTools: [],
      temperature: null,
      contextLength: null,
      maxTokens: null,
      subagentEnabled: false,
      enableThinking: false,
    };
    await fs.writeFile(join(dir, "config.json"), JSON.stringify(defaultConfig, null, 2) + "\n");
    await fs.writeFile(join(dir, "soul.md"), `你是${agentId}，一个AI助手。\n`);
  }

  async deleteBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (!existsSync(dir)) throw new Error(`Agent "${agentId}" not found`);
    await fs.rm(dir, { recursive: true });
  }

  async listGlobalSkills(): Promise<SkillManifest[]> {
    const dir = this.skillsSrcDir;
    if (!existsSync(dir)) return [];
    const skills: SkillManifest[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      try {
        if (!statSync(entryPath).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = join(entryPath, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);
        skills.push({
          name: manifest.name || entry,
          description: manifest.description || "",
          version: manifest.version,
          author: manifest.author,
        });
      } catch {
        continue;
      }
    }
    return skills;
  }

  async installSkill(sourcePath: string): Promise<{ success: boolean; error?: string }> {
    this.assertDev();
    const dir = this.skillsSrcDir;
    await fs.mkdir(dir, { recursive: true });

    if (sourcePath.endsWith(".zip")) {
      // zip extraction
      try {
        const { extractZipToDir } = await import("./devPresenterZip");
        await extractZipToDir(sourcePath, dir);
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    }

    // Directory install
    if (!existsSync(sourcePath)) {
      return { success: false, error: `Path not found: ${sourcePath}` };
    }
    const manifestPath = join(sourcePath, "manifest.json");
    if (!existsSync(manifestPath)) {
      return { success: false, error: "No manifest.json found in source directory" };
    }
    let manifest: { name?: string };
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch {
      return { success: false, error: "Invalid manifest.json" };
    }
    const name = manifest.name || join(sourcePath).split("/").pop()!;
    const destDir = join(dir, name);
    await fs.cp(sourcePath, destDir, { recursive: true });
    return { success: true };
  }

  async uninstallSkill(skillName: string): Promise<void> {
    this.assertDev();
    const dir = join(this.skillsSrcDir, skillName);
    if (!existsSync(dir)) throw new Error(`Skill "${skillName}" not found`);
    await fs.rm(dir, { recursive: true });
  }

  async listAvailableTools(): Promise<string[]> {
    // Return hardcoded list of known tool names from ToolPresenter
    return [
      "read",
      "write",
      "edit",
      "exec",
      "list_dir",
      "ask_user",
      "open_url",
      "evolution_start",
      "evolution_plan",
      "evolution_complete",
      "browser_navigate",
      "browser_screenshot",
      "browser_click",
      "browser_type",
      "browser_scroll",
      "browser_select",
      "browser_hover",
      "browser_close",
      "browser_wait",
      "web_fetch",
      "skill",
      "subagent",
    ];
  }

  async listAvailableCliCommands(): Promise<string[]> {
    return ["help", "logs", "task"];
  }
}
```

- [x] **Step 4: Create zip extraction helper**

Create `src/main/presenter/devPresenterZip.ts`:

```typescript
import { join } from "path";
import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { createUnzip } from "zlib";
import { Parse } from "unzipper";

export async function extractZipToDir(zipPath: string, destBase: string): Promise<void> {
  const entries: { path: string; content: Buffer }[] = [];
  let rootDir: string | null = null;

  await new Promise<void>((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(Parse())
      .on("entry", async (entry: any) => {
        const path = entry.path as string;
        if (entry.type === "Directory") {
          if (!rootDir) rootDir = path.replace(/\/$/, "");
          entry.autodrain();
        } else {
          const chunks: Buffer[] = [];
          entry.on("data", (chunk: Buffer) => chunks.push(chunk));
          entry.on("end", () => {
            entries.push({ path, content: Buffer.concat(chunks) });
          });
        }
      })
      .on("close", resolve)
      .on("error", reject);
  });

  // Find manifest to determine skill name
  const manifestEntry = entries.find(
    (e) => e.path.endsWith("manifest.json") && e.path.split("/").length <= 2,
  );
  if (!manifestEntry) throw new Error("No manifest.json found in zip");
  const manifest = JSON.parse(manifestEntry.content.toString("utf-8"));
  const skillName = manifest.name;
  if (!skillName) throw new Error("manifest.json missing 'name' field");

  const destDir = join(destBase, skillName);
  await fs.mkdir(destDir, { recursive: true });

  // Strip root directory prefix if present
  const prefix = rootDir ? rootDir + "/" : "";
  for (const entry of entries) {
    const relativePath = entry.path.startsWith(prefix)
      ? entry.path.slice(prefix.length)
      : entry.path;
    if (!relativePath) continue;
    const filePath = join(destDir, relativePath);
    await fs.mkdir(join(filePath, ".."), { recursive: true });
    await fs.writeFile(filePath, entry.content);
  }
}
```

- [x] **Step 5: Register DevPresenter in main Presenter**

In `src/main/presenter/index.ts`:

Add import:

```typescript
import { DevPresenter } from "./devPresenter";
```

Add property to `Presenter` class:

```typescript
devPresenter: DevPresenter;
```

In constructor, after `this.agentConfigPresenter = new AgentConfigPresenter();`:

```typescript
this.devPresenter = new DevPresenter();
```

Add `"devPresenter"` to `Presenter.DISPATCHABLE` Set.

- [x] **Step 6: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/main/presenter/devPresenter.ts src/main/presenter/devPresenterZip.ts src/shared/types/presenters/dev.presenter.d.ts src/shared/types/presenters/index.d.ts src/main/presenter/index.ts
git commit -m "feat(dev): add DevPresenter for builtin agent and skill management"
```

---

### Task 4: Install unzipper dependency

**Files:**

- Modify: `package.json`

- [x] **Step 1: Install unzipper**

Run: `pnpm add unzipper`
Run: `pnpm add -D @types/unzipper`

- [x] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add unzipper dependency for skill installation"
```

---

### Task 5: Create AgentPanel View (Renderer Shell)

**Files:**

- Create: `src/renderer/src/views/AgentPanel.vue`
- Modify: `src/renderer/src/App.vue`
- Modify: `src/renderer/src/components/AppSidebar.vue`

- [x] **Step 1: Create AgentPanel.vue shell**

Create `src/renderer/src/views/AgentPanel.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";

const activeTab = ref<"agents" | "skills">("agents");
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Tab Bar -->
    <div class="flex shrink-0 border-b border-border px-4">
      <button
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
          activeTab === 'agents'
            ? 'border-violet-500 text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
        @click="activeTab = 'agents'"
      >
        Agents
      </button>
      <button
        :class="[
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
          activeTab === 'skills'
            ? 'border-violet-500 text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        ]"
        @click="activeTab = 'skills'"
      >
        Skills
      </button>
    </div>

    <!-- Tab Content -->
    <div class="min-h-0 flex-1">
      <AgentManageTab v-if="activeTab === 'agents'" />
      <SkillManageTab v-if="activeTab === 'skills'" />
    </div>
  </div>
</template>
```

Note: `AgentManageTab` and `SkillManageTab` will be created in subsequent tasks. For now this file will have import errors — that's expected, we'll fix them in Tasks 6/7.

- [x] **Step 2: Register AgentPanel in App.vue**

In `src/renderer/src/App.vue`, add import:

```typescript
import AgentPanel from "./views/AgentPanel.vue";
```

Add to `viewComponents`:

```typescript
  agents: markRaw(AgentPanel),
```

Update `activeView` type:

```typescript
const activeView = ref<"chatroom" | "schedule" | "gateway" | "evolab" | "agents">("chatroom");
```

- [x] **Step 3: Add button to AppSidebar.vue**

In `src/renderer/src/components/AppSidebar.vue`, add a new button after the gateway button (before `<!-- EvoLab hidden -->`):

```html
<button
  data-testid="sidebar-agents"
  :class="[
        'mt-1 flex h-8 w-8 items-center justify-center rounded-md',
        activeView === 'agents'
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      ]"
  title="Agent 管理"
  @click="$emit('update:activeView', 'agents')"
>
  <Icon icon="lucide:bot" class="h-5 w-5" />
</button>
```

Update the `defineProps` and `defineEmits` types to include `"agents"`:

```typescript
defineProps<{
  activeView: "chatroom" | "schedule" | "gateway" | "evolab" | "agents";
}>();

defineEmits<{
  "update:activeView": [view: "chatroom" | "schedule" | "gateway" | "evolab" | "agents"];
}>();
```

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/views/AgentPanel.vue src/renderer/src/App.vue src/renderer/src/components/AppSidebar.vue
git commit -m "feat(ui): add AgentPanel view shell with sidebar navigation"
```

---

### Task 6: Create AgentManageTab Component

**Files:**

- Create: `src/renderer/src/components/agents/AgentManageTab.vue`
- Create: `src/renderer/src/components/agents/AgentEditForm.vue`

- [x] **Step 1: Create AgentManageTab.vue**

Create `src/renderer/src/components/agents/AgentManageTab.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentStore } from "@/stores/agent";
import AgentEditForm from "./AgentEditForm.vue";
import type { Agent } from "@shared/types/agent";
import type { BuiltinAgentInfo } from "@shared/types/presenters/dev.presenter";

const agentStore = useAgentStore();
const devPresenter = usePresenter("devPresenter");

const builtinAgents = ref<BuiltinAgentInfo[]>([]);
const selectedAgentId = ref<string | null>(null);
const isDev = ref(false);

const builtinIds = computed(() => new Set(builtinAgents.value.map((a) => a.id)));

const customAgents = computed(() => agentStore.agents.filter((a) => a.type === "custom"));

const selectedBuiltin = computed(
  () => builtinAgents.value.find((a) => a.id === selectedAgentId.value) ?? null,
);

const selectedCustom = computed(
  () => customAgents.value.find((a) => a.id === selectedAgentId.value) ?? null,
);

onMounted(async () => {
  isDev.value = await devPresenter.isDev();
  await agentStore.fetchAgents();
  builtinAgents.value = await devPresenter.listBuiltinAgents();
  if (builtinAgents.value.length > 0) {
    selectedAgentId.value = builtinAgents.value[0].id;
  }
});

async function refresh() {
  builtinAgents.value = await devPresenter.listBuiltinAgents();
  await agentStore.fetchAgents();
}

function selectAgent(id: string) {
  selectedAgentId.value = id;
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left: Agent List -->
    <div class="w-[250px] shrink-0 overflow-y-auto border-r border-border p-3">
      <!-- Builtin Section -->
      <div class="mb-3">
        <div class="mb-1 text-xs font-medium text-muted-foreground uppercase">内置</div>
        <button
          v-for="agent in builtinAgents"
          :key="agent.id"
          :class="[
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
            selectedAgentId === agent.id ? 'bg-muted' : 'hover:bg-muted/50',
          ]"
          @click="selectAgent(agent.id)"
        >
          <span class="truncate font-medium">{{ agent.config.name || agent.id }}</span>
          <span class="ml-auto text-xs text-muted-foreground">{{ agent.id }}</span>
        </button>
      </div>

      <!-- Custom Section -->
      <div class="mb-3">
        <div class="mb-1 text-xs font-medium text-muted-foreground uppercase">自定义</div>
        <button
          v-for="agent in customAgents"
          :key="agent.id"
          :class="[
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
            selectedAgentId === agent.id ? 'bg-muted' : 'hover:bg-muted/50',
          ]"
          @click="selectAgent(agent.id)"
        >
          <span class="truncate font-medium">{{ agent.name }}</span>
        </button>
        <button
          class="mt-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
          @click="$emit('createCustom')"
        >
          <Icon icon="lucide:plus" class="h-4 w-4" />
          新建 Agent
        </button>
      </div>

      <!-- Create Builtin (dev only) -->
      <button
        v-if="isDev"
        class="mt-2 flex w-full items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50"
        @click="$emit('createBuiltin')"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
        新建内置 Agent
      </button>
    </div>

    <!-- Right: Edit Form -->
    <div class="min-w-0 flex-1 overflow-y-auto p-4">
      <AgentEditForm
        v-if="selectedBuiltin"
        :agent-info="selectedBuiltin"
        :is-builtin="true"
        :is-dev="isDev"
        @saved="refresh"
      />
      <AgentEditForm
        v-else-if="selectedCustom"
        :agent="selectedCustom"
        :is-builtin="false"
        :is-dev="isDev"
        @saved="refresh"
      />
      <div v-else class="flex h-full items-center justify-center text-muted-foreground">
        选择一个 Agent 进行编辑
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 2: Create AgentEditForm.vue**

Create `src/renderer/src/components/agents/AgentEditForm.vue`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import { useAgentStore } from "@/stores/agent";
import type { Agent } from "@shared/types/agent";
import type { BuiltinAgentInfo } from "@shared/types/presenters/dev.presenter";

const props = defineProps<{
  agentInfo?: BuiltinAgentInfo | null;
  agent?: Agent | null;
  isBuiltin: boolean;
  isDev: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const devPresenter = usePresenter("devPresenter");
const agentStore = useAgentStore();

// Form state
const name = ref("");
const description = ref("");
const themeColor = ref("#6366f1");
const soul = ref("");
const disabledTools = ref<string[]>([]);
const allowedCliCommands = ref<string[]>([]);
const enabledSkills = ref<string[]>([]);
const capabilityRequirements = ref<string[]>([]);
const temperature = ref<number | null>(null);
const maxTokens = ref<number | null>(null);
const subagentEnabled = ref(false);
const enableThinking = ref(false);

// Available options
const availableTools = ref<string[]>([]);
const availableCommands = ref<string[]>([]);

const readonly = computed(() => props.isBuiltin && !props.isDev);

// Load data when props change
watch(
  () => [props.agentInfo, props.agent],
  async () => {
    if (props.isBuiltin && props.agentInfo) {
      const c = props.agentInfo.config as Record<string, any>;
      name.value = c.name || "";
      description.value = c.description || "";
      themeColor.value = c.themeColor || "#6366f1";
      soul.value = props.agentInfo.soul || "";
      disabledTools.value = c.disabledTools || [];
      allowedCliCommands.value = c.allowedCliCommands || [];
      enabledSkills.value = c.enabledSkills || [];
      capabilityRequirements.value = c.capabilityRequirements || [];
      temperature.value = c.temperature ?? null;
      maxTokens.value = c.maxTokens ?? null;
      subagentEnabled.value = c.subagentEnabled ?? false;
      enableThinking.value = c.enableThinking ?? false;
    } else if (!props.isBuiltin && props.agent) {
      name.value = props.agent.name;
      description.value = props.agent.description || "";
      themeColor.value = props.agent.themeColor || "#6366f1";
      soul.value = ""; // will load async
      disabledTools.value = props.agent.config?.disabledTools || [];
      allowedCliCommands.value = props.agent.config?.allowedCliCommands || [];
      enabledSkills.value = props.agent.config?.enabledSkills || [];
      capabilityRequirements.value = props.agent.config?.capabilityRequirements || [];
      temperature.value = props.agent.config?.temperature ?? null;
      maxTokens.value = props.agent.config?.maxTokens ?? null;
      subagentEnabled.value = props.agent.config?.subagentEnabled ?? false;
      enableThinking.value = props.agent.config?.enableThinking ?? false;
    }
    // Load available options
    availableTools.value = await devPresenter.listAvailableTools();
    availableCommands.value = await devPresenter.listAvailableCliCommands();
  },
  { immediate: true },
);

const presetColors = [
  "#a855f7",
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

async function save() {
  if (props.isBuiltin && props.agentInfo) {
    const config = {
      name: name.value,
      description: description.value,
      themeColor: themeColor.value,
      capabilityRequirements: capabilityRequirements.value,
      disabledTools: disabledTools.value,
      allowedCliCommands: allowedCliCommands.value,
      enabledSkills: enabledSkills.value,
      mcpTools: (props.agentInfo.config as any).mcpTools || [],
      temperature: temperature.value,
      contextLength: null,
      maxTokens: maxTokens.value,
      subagentEnabled: subagentEnabled.value,
      enableThinking: enableThinking.value,
    };
    await devPresenter.saveBuiltinAgent(props.agentInfo.id, config, soul.value);
  } else if (props.agent) {
    await agentStore.updateAgent(props.agent.id, {
      name: name.value,
      description: description.value,
      themeColor: themeColor.value,
      config: {
        capabilityRequirements: capabilityRequirements.value,
        disabledTools: disabledTools.value,
        allowedCliCommands: allowedCliCommands.value,
        enabledSkills: enabledSkills.value,
        temperature: temperature.value,
        maxTokens: maxTokens.value,
        subagentEnabled: subagentEnabled.value,
        enableThinking: enableThinking.value,
      },
    });
  }
  emit("saved");
}

function toggleTool(tool: string) {
  const idx = disabledTools.value.indexOf(tool);
  if (idx >= 0) {
    disabledTools.value.splice(idx, 1);
  } else {
    disabledTools.value.push(tool);
  }
}

function toggleCommand(cmd: string) {
  const idx = allowedCliCommands.value.indexOf(cmd);
  if (idx >= 0) {
    allowedCliCommands.value.splice(idx, 1);
  } else {
    allowedCliCommands.value.push(cmd);
  }
}

function toggleCapability(cap: string) {
  const idx = capabilityRequirements.value.indexOf(cap);
  if (idx >= 0) {
    capabilityRequirements.value.splice(idx, 1);
  } else {
    capabilityRequirements.value.push(cap);
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <!-- ID (readonly) -->
    <div v-if="isBuiltin && agentInfo">
      <label class="text-xs font-medium text-muted-foreground">ID</label>
      <div class="mt-1 text-sm font-mono text-foreground">{{ agentInfo.id }}</div>
    </div>

    <!-- Name -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">名称</label>
      <input
        v-model="name"
        :disabled="readonly"
        class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
      />
    </div>

    <!-- Description -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">描述</label>
      <textarea
        v-model="description"
        :disabled="readonly"
        rows="2"
        class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
      />
    </div>

    <!-- Theme Color -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">主题颜色</label>
      <div class="mt-1 flex items-center gap-2">
        <button
          v-for="color in presetColors"
          :key="color"
          :disabled="readonly"
          :class="[
            'h-6 w-6 rounded-full border-2',
            themeColor === color ? 'border-foreground' : 'border-transparent',
          ]"
          :style="{ backgroundColor: color }"
          @click="themeColor = color"
        />
        <input
          v-model="themeColor"
          :disabled="readonly"
          type="color"
          class="h-6 w-6 cursor-pointer rounded border-none"
        />
      </div>
    </div>

    <!-- Soul (markdown editor) -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">性格设定 (Soul)</label>
      <textarea
        v-model="soul"
        :disabled="readonly"
        rows="12"
        class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed disabled:opacity-50"
      />
    </div>

    <!-- Capability Requirements -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">能力需求</label>
      <div class="mt-1 flex flex-wrap gap-2">
        <label
          v-for="cap in ['reasoning', 'vision', 'image_gen', 'tool_call']"
          :key="cap"
          class="flex items-center gap-1 text-sm"
        >
          <input
            type="checkbox"
            :checked="capabilityRequirements.includes(cap)"
            :disabled="readonly"
            @change="toggleCapability(cap)"
          />
          {{ cap }}
        </label>
      </div>
    </div>

    <!-- Tools (disabled = in disabledTools list) -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">工具 (取消勾选=禁用)</label>
      <div class="mt-1 grid grid-cols-3 gap-1">
        <label v-for="tool in availableTools" :key="tool" class="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            :checked="!disabledTools.includes(tool)"
            :disabled="readonly"
            @change="toggleTool(tool)"
          />
          {{ tool }}
        </label>
      </div>
    </div>

    <!-- CLI Commands (whitelist) -->
    <div>
      <label class="text-xs font-medium text-muted-foreground">CLI 命令白名单</label>
      <div class="mt-1 flex flex-wrap gap-2">
        <label v-for="cmd in availableCommands" :key="cmd" class="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            :checked="allowedCliCommands.includes(cmd)"
            :disabled="readonly"
            @change="toggleCommand(cmd)"
          />
          {{ cmd }}
        </label>
      </div>
    </div>

    <!-- Parameters -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="text-xs font-medium text-muted-foreground">Temperature</label>
        <input
          v-model.number="temperature"
          :disabled="readonly"
          type="number"
          step="0.1"
          min="0"
          max="2"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
        />
      </div>
      <div>
        <label class="text-xs font-medium text-muted-foreground">Max Tokens</label>
        <input
          v-model.number="maxTokens"
          :disabled="readonly"
          type="number"
          class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
        />
      </div>
    </div>

    <!-- Toggles -->
    <div class="flex gap-6">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="subagentEnabled" :disabled="readonly" type="checkbox" />
        Subagent
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="enableThinking" :disabled="readonly" type="checkbox" />
        Extended Thinking
      </label>
    </div>

    <!-- Save Button -->
    <div v-if="!readonly" class="flex gap-2 pt-2">
      <button
        class="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        @click="save"
      >
        保存
      </button>
    </div>
    <div v-else class="pt-2 text-xs text-muted-foreground">内置 Agent 仅在开发模式下可编辑</div>
  </div>
</template>
```

- [x] **Step 3: Update AgentPanel.vue to import components**

Update `src/renderer/src/views/AgentPanel.vue` script to import:

```typescript
import AgentManageTab from "../components/agents/AgentManageTab.vue";
import SkillManageTab from "../components/agents/SkillManageTab.vue";
```

(SkillManageTab will be created in next task — for now create a placeholder)

- [x] **Step 4: Create SkillManageTab placeholder**

Create `src/renderer/src/components/agents/SkillManageTab.vue`:

```vue
<script setup lang="ts"></script>

<template>
  <div class="flex h-full items-center justify-center text-muted-foreground">
    Skill 管理 (待实现)
  </div>
</template>
```

- [x] **Step 5: Run typecheck and dev**

Run: `pnpm run typecheck`
Run: `pnpm run dev` (verify AgentPanel renders)

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/components/agents/ src/renderer/src/views/AgentPanel.vue
git commit -m "feat(ui): implement AgentManageTab with edit form"
```

---

### Task 7: Create SkillManageTab Component

**Files:**

- Modify: `src/renderer/src/components/agents/SkillManageTab.vue`

- [x] **Step 1: Implement SkillManageTab.vue**

Replace the placeholder `src/renderer/src/components/agents/SkillManageTab.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { usePresenter } from "@/composables/usePresenter";
import type { SkillManifest } from "@shared/types/presenters/dev.presenter";

const devPresenter = usePresenter("devPresenter");

const skills = ref<SkillManifest[]>([]);
const isDev = ref(false);
const installing = ref(false);

onMounted(async () => {
  isDev.value = await devPresenter.isDev();
  await refreshSkills();
});

async function refreshSkills() {
  skills.value = await devPresenter.listGlobalSkills();
}

async function installSkill() {
  // Use electron dialog to pick directory or file
  const path = await window.electron.ipcRenderer.invoke("dialog:openDirectoryOrFile");
  if (!path) return;
  installing.value = true;
  try {
    const result = await devPresenter.installSkill(path);
    if (!result.success) {
      alert(`安装失败: ${result.error}`);
    }
    await refreshSkills();
  } finally {
    installing.value = false;
  }
}

async function uninstallSkill(name: string) {
  if (!confirm(`确认卸载 Skill "${name}"?`)) return;
  await devPresenter.uninstallSkill(name);
  await refreshSkills();
}
</script>

<template>
  <div class="h-full overflow-y-auto p-4">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-sm font-medium text-foreground">全局 Skills</h2>
      <button
        v-if="isDev"
        :disabled="installing"
        class="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        @click="installSkill"
      >
        <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
        安装 Skill
      </button>
    </div>

    <div v-if="skills.length === 0" class="text-sm text-muted-foreground">暂无已安装的 Skill</div>

    <div class="space-y-2">
      <div
        v-for="skill in skills"
        :key="skill.name"
        class="flex items-center justify-between rounded-md border border-border px-3 py-2"
      >
        <div>
          <div class="text-sm font-medium text-foreground">{{ skill.name }}</div>
          <div class="text-xs text-muted-foreground">{{ skill.description }}</div>
          <div v-if="skill.version" class="text-xs text-muted-foreground">
            v{{ skill.version }}
            <span v-if="skill.author"> by {{ skill.author }}</span>
          </div>
        </div>
        <button
          v-if="isDev"
          class="text-xs text-red-400 hover:text-red-300"
          @click="uninstallSkill(skill.name)"
        >
          卸载
        </button>
      </div>
    </div>
  </div>
</template>
```

- [x] **Step 2: Add dialog:openDirectoryOrFile IPC handler**

In `src/main/presenter/index.ts`, add after the existing `dialog:openDirectory` handler:

```typescript
ipcMain.handle("dialog:openDirectoryOrFile", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "openFile"],
    filters: [{ name: "Skill", extensions: ["zip"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});
```

- [x] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add src/renderer/src/components/agents/SkillManageTab.vue src/main/presenter/index.ts
git commit -m "feat(ui): implement SkillManageTab with install/uninstall"
```

---

### Task 8: Remove AgentEditDialog and Clean Up References

**Files:**

- Delete: `src/renderer/src/components/chat/AgentEditDialog.vue`
- Modify: `src/renderer/src/views/ChatroomPanel.vue` (remove AgentEditDialog usage)
- Modify: `src/renderer/src/components/chat/NewThread.vue` (remove edit trigger if any)

- [x] **Step 1: Identify AgentEditDialog usage**

Search for all imports/references to `AgentEditDialog` in renderer:

Run: `grep -r "AgentEditDialog" src/renderer/`

- [x] **Step 2: Remove AgentEditDialog from ChatroomPanel**

Remove the `<AgentEditDialog>` component usage and its related state (open state, selected agent for edit) from `ChatroomPanel.vue`. Keep the session/chat functionality intact.

- [x] **Step 3: Remove edit triggers from NewThread or SessionList**

If NewThread or SessionList have "edit" buttons that open AgentEditDialog, remove those buttons. Keep the "start conversation" card click behavior.

- [x] **Step 4: Delete AgentEditDialog.vue**

Delete `src/renderer/src/components/chat/AgentEditDialog.vue`.

- [x] **Step 5: Run typecheck and dev**

Run: `pnpm run typecheck`
Run: `pnpm run dev` (verify chatroom still works)

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui): remove AgentEditDialog, editing now in AgentPanel"
```

---

### Task 9: Create Global Skills Directory Structure

**Files:**

- Create: `src/main/skills/.gitkeep`

- [x] **Step 1: Create skills directory**

```bash
mkdir -p src/main/skills
touch src/main/skills/.gitkeep
```

- [x] **Step 2: Commit**

```bash
git add src/main/skills/.gitkeep
git commit -m "chore: add global skills directory"
```

---

### Task 10: Wire Up ensureBuiltin to Use New JSON Format

**Files:**

- Modify: `src/main/db/models/agentDao.ts` (if needed for `allowedCliCommands` / `enabledSkills` in config_json)

- [x] **Step 1: Verify ensureBuiltin works with new index.ts**

The existing `ensureBuiltin(db)` in `agentDao.ts` reads from `BUILTIN_AGENTS` array which is now loaded from JSON files. Verify it still works by running:

Run: `pnpm run dev`

Check console: agents should appear in chatroom NewThread.

- [x] **Step 2: Verify agentSoul is loaded correctly from soul.md**

In dev mode, start a conversation with HAL. The agent should respond according to its soul.md prompt.

- [x] **Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix(agents): ensure ensureBuiltin compatible with json+md format"
```

---

### Task 11: Format and Lint

**Files:**

- All modified files

- [x] **Step 1: Run formatter**

Run: `pnpm run format`

- [x] **Step 2: Run linter**

Run: `pnpm run lint`
Fix any reported issues.

- [x] **Step 3: Run tests**

Run: `pnpm test`
Fix any broken tests (likely tests that import from `./hal` or `./moss` directly).

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: format and fix lint issues"
```

---

### Task 12: Integration Test

- [x] **Step 1: Dev mode end-to-end verification**

Run: `pnpm run dev`

Verify:

1. AppSidebar shows "Agent 管理" button
2. Clicking it opens AgentPanel with Agents tab
3. Builtin agents (hal-ai, moss-ai) appear in left list
4. Selecting a builtin agent shows its config in the form
5. All fields are editable in dev mode
6. Clicking "保存" writes back to `src/main/agents/<id>/config.json` and `soul.md`
7. Skills tab shows empty state with "安装 Skill" button
8. Starting a new chat from NewThread still works
9. Agent responses use the soul from soul.md

- [x] **Step 2: Verify prod-like behavior**

In the AgentEditForm, temporarily set `isDev = false` and verify:

- All builtin agent fields become readonly
- Custom agents remain editable
- "新建内置 Agent" button is hidden

- [x] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: integration test fixes"
```
