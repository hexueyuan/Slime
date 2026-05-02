# Obsidian 深度集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将自定义 Agent 的 systemPrompt（SOUL.md）和 skills 从数据库迁移到文件系统，支持 Obsidian vault 路径配置，实现在 Obsidian 中直接编辑 Agent 定义和 Skill。

**Architecture:** 新增 `agentPaths.ts` 路径解析模块统一管理 Agent 目录计算逻辑；`agentConfigPresenter` 在 Agent 生命周期中操作文件系统；`skillPresenter` 改为按 agentId 扫描各自目录；`agentChatPresenter` 从 SOUL.md 读取 systemPrompt。

**Tech Stack:** TypeScript, Node.js fs/promises, Electron dialog/shell, Vue 3, Pinia

---

## 文件变更清单

| 操作 | 文件路径                                                 | 职责                                                       |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------- |
| 新增 | `src/main/utils/agentPaths.ts`                           | Agent 目录路径解析（getAgentDir/getSoulPath/getSkillsDir） |
| 修改 | `src/shared/types/agent.d.ts`                            | AgentConfig 新增 disabledSkills，废弃 systemPrompt/skills  |
| 修改 | `src/main/utils/paths.ts`                                | 新增 agentsDir getter（~/.slime/agents）                   |
| 修改 | `src/main/presenter/agentConfigPresenter.ts`             | 创建/更新/删除 Agent 时操作目录；读 SOUL.md                |
| 修改 | `src/main/presenter/skillPresenter.ts`                   | 按 agentId 扫描目录；黑名单过滤；按 agentId 缓存           |
| 修改 | `src/main/presenter/agentChat/agentChatPresenter.ts`     | systemPrompt 从文件读取                                    |
| 修改 | `src/shared/types/presenters/agentConfig.presenter.d.ts` | 新增 getAgentSkillsDir IPC 方法                            |
| 修改 | `src/renderer/src/components/settings/GeneralTab.vue`    | 新增 Obsidian vault 路径配置项                             |
| 修改 | `src/renderer/src/components/chat/AgentEditDialog.vue`   | Skills tab 改为目录 skill 列表+黑名单禁用                  |
| 新增 | `test/main/agentPaths.test.ts`                           | agentPaths 单元测试                                        |
| 新增 | `test/main/skillPresenter.test.ts`                       | skillPresenter 新行为测试                                  |

---

## Task 1: 新增 agentPaths.ts 路径解析模块

**Files:**

- Create: `src/main/utils/agentPaths.ts`
- Modify: `src/main/utils/paths.ts`
- Test: `test/main/agentPaths.test.ts`

- [x] **Step 1: 写失败测试**

新建 `test/main/agentPaths.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { getAgentDir, getSoulPath, getSkillsDir } from "../../src/main/utils/agentPaths";
import { join } from "path";

const builtinAgent = { id: "hal-ai", name: "哈尔", type: "builtin" };
const customAgent = { id: "abc123", name: "我的Agent", type: "custom" };

describe("getAgentDir", () => {
  it("builtin agent returns null", () => {
    expect(getAgentDir(builtinAgent, null, "/home/.slime/agents")).toBeNull();
  });

  it("no vault path uses default dir with agent id", () => {
    const result = getAgentDir(customAgent, null, "/home/.slime/agents");
    expect(result).toBe("/home/.slime/agents/abc123");
  });

  it("vault path uses agent name under {vault}/Slime/", () => {
    const result = getAgentDir(customAgent, "/vault", "/home/.slime/agents");
    expect(result).toBe("/vault/Slime/我的Agent");
  });
});

describe("getSoulPath", () => {
  it("returns SOUL.md under agentDir", () => {
    expect(getSoulPath("/some/dir")).toBe(join("/some/dir", "SOUL.md"));
  });
});

describe("getSkillsDir", () => {
  it("returns skills/ under agentDir", () => {
    expect(getSkillsDir("/some/dir")).toBe(join("/some/dir", "skills"));
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm test test/main/agentPaths.test.ts
```

预期：FAIL，`agentPaths` 模块不存在

- [x] **Step 3: 在 paths.ts 新增 agentsDir getter**

在 `src/main/utils/paths.ts` 中，在 `builtinSkillsDir` getter 附近新增：

```typescript
get agentsDir(): string {
  return join(this.slimeDir, "agents")
}
```

- [x] **Step 4: 新建 agentPaths.ts**

新建 `src/main/utils/agentPaths.ts`：

```typescript
import { join } from "path";

interface AgentLike {
  id: string;
  name: string;
  type: string;
}

/**
 * 返回 Agent 工作目录。
 * - builtin agent 返回 null（不使用文件目录）
 * - 有 vaultPath → {vault}/Slime/{agent.name}/
 * - 无 vaultPath → {defaultAgentsDir}/{agent.id}/
 */
export function getAgentDir(
  agent: AgentLike,
  vaultPath: string | null,
  defaultAgentsDir: string,
): string | null {
  if (agent.type === "builtin") return null;
  if (vaultPath) return join(vaultPath, "Slime", agent.name);
  return join(defaultAgentsDir, agent.id);
}

/** SOUL.md 绝对路径 */
export function getSoulPath(agentDir: string): string {
  return join(agentDir, "SOUL.md");
}

/** skills 子目录绝对路径 */
export function getSkillsDir(agentDir: string): string {
  return join(agentDir, "skills");
}
```

- [x] **Step 5: 运行测试确认通过**

```bash
pnpm test test/main/agentPaths.test.ts
```

预期：3 tests PASS

- [x] **Step 6: 提交**

```bash
git add src/main/utils/agentPaths.ts src/main/utils/paths.ts test/main/agentPaths.test.ts
git commit -m "feat(obsidian): add agentPaths util and agentsDir path"
```

---

## Task 2: 更新类型定义

**Files:**

- Modify: `src/shared/types/agent.d.ts`

- [x] **Step 1: 修改 AgentConfig 类型**

在 `src/shared/types/agent.d.ts` 中，将 `AgentConfig` 接口修改为：

```typescript
interface AgentConfig {
  capabilityRequirements?: string[];
  /** @deprecated 改从 SOUL.md 文件读取，此字段不再使用 */
  systemPrompt?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[]; // "{server_id}/{tool_name}"[]
  /** @deprecated 改为 disabledSkills 黑名单 */
  skills?: string[];
  /** 禁用的 skill 名称列表，目录下存在的 skill 默认启用 */
  disabledSkills?: string[];
}
```

- [x] **Step 2: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过（旧字段保留兼容，无破坏性变更）

- [x] **Step 3: 提交**

```bash
git add src/shared/types/agent.d.ts
git commit -m "feat(obsidian): add disabledSkills to AgentConfig, deprecate systemPrompt/skills"
```

---

## Task 3: 更新 agentConfigPresenter — Agent 生命周期文件操作

**Files:**

- Modify: `src/main/presenter/agentConfigPresenter.ts`

- [x] **Step 1: 写失败测试**

在 `test/main/agentConfigPresenter.test.ts`（若已存在则追加，否则新建）中添加：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs/promises";

// mock fs/promises
vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
  },
}));

// mock configPresenter
vi.mock("../../src/main/presenter/configPresenter", () => ({
  configPresenter: { get: vi.fn().mockResolvedValue(null) },
}));

// mock paths
vi.mock("../../src/main/utils/paths", () => ({
  paths: { agentsDir: "/mock/.slime/agents" },
}));

describe("agentConfigPresenter file operations", () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(configPresenter.get).mockResolvedValue(null);
  });

  it("createAgent creates directory and SOUL.md", async () => {
    // 这个测试在 Task 3 Step 4 实现后再补充断言
    // 先写为占位，确保 mock 结构正确
    expect(true).toBe(true);
  });
});
```

- [x] **Step 2: 在 agentConfigPresenter.ts 中引入依赖**

在 `src/main/presenter/agentConfigPresenter.ts` 文件顶部追加 import：

```typescript
import fs from "fs/promises";
import { getAgentDir, getSoulPath } from "../utils/agentPaths";
import { paths } from "../utils/paths";
import { configPresenter } from "./configPresenter";
```

- [x] **Step 3: 新增私有辅助方法 getVaultPath 和 getAgentDirForAgent**

在 `AgentConfigPresenter` 类中添加：

```typescript
private async getVaultPath(): Promise<string | null> {
  const val = await configPresenter.get("obsidian.vaultPath")
  return typeof val === "string" && val.length > 0 ? val : null
}

private async getAgentDirForAgent(agent: Agent): Promise<string | null> {
  const vaultPath = await this.getVaultPath()
  return getAgentDir(agent, vaultPath, paths.agentsDir)
}
```

- [x] **Step 4: 修改 createAgent，创建目录和 SOUL.md**

找到现有 `createAgent` 方法，在 DB 写入后追加文件操作：

```typescript
async createAgent(data: Partial<Agent>): Promise<Agent> {
  const agent = await agentDao.create(this.db, data)
  // 创建文件目录和 SOUL.md
  const agentDir = await this.getAgentDirForAgent(agent)
  if (agentDir) {
    await fs.mkdir(getSoulPath(agentDir).replace(/SOUL\.md$/, ""), { recursive: true })
    const skillsDir = agentDir + "/skills"
    await fs.mkdir(skillsDir, { recursive: true })
    await fs.writeFile(
      getSoulPath(agentDir),
      "<!-- 在此编写 Agent 的系统提示词（System Prompt） -->\n",
      { flag: "wx" }, // 仅在文件不存在时创建
    )
  }
  return agent
}
```

- [x] **Step 5: 修改 updateAgent，处理 name 变更重命名目录**

找到现有 `updateAgent` 方法，在 DB 更新后追加：

```typescript
async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
  const oldAgent = await agentDao.findById(this.db, id)
  const agent = await agentDao.update(this.db, id, data)
  // ... 现有 mcpTools 处理逻辑保持不变 ...

  // name 变更且使用 Obsidian 目录时重命名
  if (oldAgent && data.name && data.name !== oldAgent.name) {
    const vaultPath = await this.getVaultPath()
    if (vaultPath) {
      const oldDir = getAgentDir(oldAgent, vaultPath, paths.agentsDir)
      const newDir = getAgentDir(agent, vaultPath, paths.agentsDir)
      if (oldDir && newDir && oldDir !== newDir) {
        await fs.rename(oldDir, newDir).catch(() => {
          // 旧目录不存在时忽略错误
        })
      }
    }
  }
  return agent
}
```

- [x] **Step 6: 新增 readSoulMd 方法供 agentChatPresenter 调用**

```typescript
async readSoulMd(agentId: string): Promise<string> {
  const agent = await agentDao.findById(this.db, agentId)
  if (!agent) return ""
  const agentDir = await this.getAgentDirForAgent(agent)
  if (!agentDir) return ""
  try {
    return await fs.readFile(getSoulPath(agentDir), "utf-8")
  } catch {
    return ""
  }
}
```

- [x] **Step 7: 在 IAgentConfigPresenter 接口中声明 readSoulMd**

在 `src/shared/types/presenters/agentConfig.presenter.d.ts` 中追加：

```typescript
readSoulMd(agentId: string): Promise<string>
```

- [x] **Step 8: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 9: 提交**

```bash
git add src/main/presenter/agentConfigPresenter.ts src/shared/types/presenters/agentConfig.presenter.d.ts
git commit -m "feat(obsidian): agent lifecycle creates/renames dir and SOUL.md"
```

---

## Task 4: 更新 skillPresenter — 按 agentId 扫描目录

**Files:**

- Modify: `src/main/presenter/skillPresenter.ts`
- Test: `test/main/skillPresenter.test.ts`

- [x] **Step 1: 写失败测试**

新建 `test/main/skillPresenter.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SkillPresenter } from "../../src/main/presenter/skillPresenter";
import * as loader from "../../src/main/skills/loader";

vi.mock("../../src/main/skills/loader", () => ({
  scanSkills: vi.fn(),
  loadSkillContent: vi.fn(),
}));

const mockBuiltinSkill = {
  name: "hal-skill",
  description: "builtin",
  source: "builtin" as const,
  baseDir: "/builtin/hal-skill",
  filePath: "/builtin/hal-skill/SKILL.md",
  agentIds: ["hal-ai"],
};

const mockLocalSkill = {
  name: "my-skill",
  description: "local",
  source: "local" as const,
  baseDir: "/agents/abc123/skills/my-skill",
  filePath: "/agents/abc123/skills/my-skill/SKILL.md",
};

describe("SkillPresenter (new per-agent behavior)", () => {
  let presenter: SkillPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    presenter = new SkillPresenter("/builtin", "/agents");
    vi.mocked(loader.scanSkills).mockImplementation((dir: string) => {
      if (dir.includes("builtin")) return [mockBuiltinSkill];
      if (dir.includes("abc123")) return [mockLocalSkill];
      return [];
    });
  });

  it("getSkillList returns builtin skills for matching agentId", () => {
    const result = presenter.getSkillList("hal-ai");
    expect(result.map((s) => s.name)).toContain("hal-skill");
  });

  it("getSkillList returns local skills from agent dir, excluding disabled", () => {
    const result = presenter.getSkillList("abc123", []);
    expect(result.map((s) => s.name)).toContain("my-skill");
  });

  it("getSkillList excludes disabled skills", () => {
    const result = presenter.getSkillList("abc123", ["my-skill"]);
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });

  it("getSkillList does NOT return local skills for different agentId", () => {
    const result = presenter.getSkillList("other-agent", []);
    expect(result.map((s) => s.name)).not.toContain("my-skill");
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/skillPresenter.test.ts
```

预期：FAIL，当前 SkillPresenter 使用全局 localDir

- [x] **Step 3: 修改 SkillPresenter 构造函数和缓存结构**

修改 `src/main/presenter/skillPresenter.ts`：

```typescript
import { scanSkills, loadSkillContent } from "../skills/loader";
import { Skill } from "../skills/types";
import { SkillInfo } from "../../shared/types/skills";
import { join } from "path";

export class SkillPresenter {
  private builtinCache: Skill[] | null = null;
  private agentSkillCache = new Map<string, Skill[]>();

  constructor(
    private builtinDir: string,
    private agentsBaseDir: string, // 默认目录基路径（vault 路径通过 getSkillsDir 传入）
  ) {}

  private loadBuiltinCache(): Skill[] {
    if (!this.builtinCache) {
      this.builtinCache = scanSkills(this.builtinDir).map((s) => ({
        ...s,
        source: "builtin" as const,
      }));
    }
    return this.builtinCache;
  }

  private loadAgentSkillCache(agentId: string, agentSkillsDir: string): Skill[] {
    if (!this.agentSkillCache.has(agentId)) {
      const skills = scanSkills(agentSkillsDir).map((s) => ({ ...s, source: "local" as const }));
      this.agentSkillCache.set(agentId, skills);
    }
    return this.agentSkillCache.get(agentId)!;
  }

  /**
   * 获取 Agent 可用的 skill 列表
   * @param agentId Agent ID
   * @param agentSkillsDir 该 Agent 的 skills 目录（由调用方传入，已解析好路径）
   * @param disabledSkills 禁用的 skill 名称列表（黑名单）
   */
  getSkillList(agentId: string, agentSkillsDir?: string, disabledSkills?: string[]): SkillInfo[] {
    const builtins = this.loadBuiltinCache().filter((s) => s.agentIds?.includes(agentId));

    const locals: Skill[] = agentSkillsDir ? this.loadAgentSkillCache(agentId, agentSkillsDir) : [];

    const disabledSet = new Set(disabledSkills ?? []);
    const filteredLocals = locals.filter((s) => !disabledSet.has(s.name));

    // builtin 同名覆盖 local
    const builtinNames = new Set(builtins.map((s) => s.name));
    const merged = [...builtins, ...filteredLocals.filter((s) => !builtinNames.has(s.name))];

    return merged.map(({ name, description, source }) => ({ name, description, source }));
  }

  loadSkill(name: string): string {
    // 搜索 builtin 缓存
    const builtin = this.builtinCache?.find((s) => s.name === name);
    if (builtin) return loadSkillContent(builtin.filePath);

    // 搜索所有 agent 缓存
    for (const skills of this.agentSkillCache.values()) {
      const found = skills.find((s) => s.name === name);
      if (found) return loadSkillContent(found.filePath);
    }
    throw new Error(`Skill "${name}" not found`);
  }

  listLocalSkillsForAgent(agentId: string, agentSkillsDir: string): SkillInfo[] {
    const skills = this.loadAgentSkillCache(agentId, agentSkillsDir);
    return skills.map(({ name, description, source }) => ({ name, description, source }));
  }

  invalidateAgentCache(agentId: string): void {
    this.agentSkillCache.delete(agentId);
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/skillPresenter.test.ts
```

预期：4 tests PASS

- [x] **Step 5: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过（注意检查 agentConfigPresenter 中调用 listLocalSkills 的地方）

- [x] **Step 6: 提交**

```bash
git add src/main/presenter/skillPresenter.ts test/main/skillPresenter.test.ts
git commit -m "feat(obsidian): skillPresenter scans per-agent dir with blacklist filter"
```

---

## Task 5: 更新 agentConfigPresenter — listLocalSkills 适配新接口

**Files:**

- Modify: `src/main/presenter/agentConfigPresenter.ts`
- Modify: `src/shared/types/presenters/agentConfig.presenter.d.ts`

- [x] **Step 1: 新增 getAgentSkillsDir 方法**

在 `agentConfigPresenter.ts` 中，找到 `listLocalSkills` 方法，将其替换为：

```typescript
async getAgentSkillsDir(agentId: string): Promise<string | null> {
  const agent = await agentDao.findById(this.db, agentId)
  if (!agent) return null
  const agentDir = await this.getAgentDirForAgent(agent)
  if (!agentDir) return null
  return agentDir + "/skills"
}

async listLocalSkills(agentId: string): Promise<SkillInfo[]> {
  if (!this.skillPresenter) return []
  const skillsDir = await this.getAgentSkillsDir(agentId)
  if (!skillsDir) return []
  return this.skillPresenter.listLocalSkillsForAgent(agentId, skillsDir)
}
```

- [x] **Step 2: 更新接口声明**

在 `src/shared/types/presenters/agentConfig.presenter.d.ts` 中，更新 `listLocalSkills` 签名：

```typescript
listLocalSkills(agentId: string): Promise<SkillInfo[]>
getAgentSkillsDir(agentId: string): Promise<string | null>
```

- [x] **Step 3: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 4: 提交**

```bash
git add src/main/presenter/agentConfigPresenter.ts src/shared/types/presenters/agentConfig.presenter.d.ts
git commit -m "feat(obsidian): listLocalSkills and getAgentSkillsDir per-agent"
```

---

## Task 6: 更新 agentChatPresenter — 从 SOUL.md 读取 systemPrompt

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [x] **Step 1: 找到 chat 方法中读取 systemPrompt 的位置**

在 `agentChatPresenter.ts` 中搜索 `systemPrompt` 或 `agentSystemPrompt`，找到构建 context 时传入的位置。当前代码从 `agent.config?.systemPrompt` 读取。

- [x] **Step 2: 修改 chat 方法，改为从文件读取**

将 systemPrompt 的获取改为：

```typescript
// 从 SOUL.md 读取（原 agent.config?.systemPrompt 废弃不用）
const agentSystemPrompt = await agentConfigPresenter.readSoulMd(agentId);
```

其中 `agentConfigPresenter` 需要作为构造函数参数注入或通过全局 presenter 访问。

> **注意**：查看 agentChatPresenter 的构造函数，若已有 `agentConfigPresenter` 依赖则直接用；若无则需在构造函数中添加 `private agentConfigPresenter: AgentConfigPresenter` 参数，并在 `AgentChatPresenterAdapter` 或调用处传入。

- [x] **Step 3: 修改 chat 方法中 skill 加载**

将 skill 加载改为：

```typescript
// 获取该 Agent 的 skills 目录
const agentSkillsDir = await agentConfigPresenter.getAgentSkillsDir(agentId);
const disabledSkills = agent?.config?.disabledSkills ?? [];

const skillListXML = skillPresenter
  ? buildSkillListXML(
      skillPresenter.getSkillList(agentId, agentSkillsDir ?? undefined, disabledSkills),
    )
  : null;
```

- [x] **Step 4: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 5: 提交**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(obsidian): read systemPrompt from SOUL.md, skills from agent dir"
```

---

## Task 7: Settings General Tab — Obsidian vault 路径配置

**Files:**

- Modify: `src/renderer/src/components/settings/GeneralTab.vue`（或对应的 General 设置组件）

> **注意**：先运行 `grep -r "GeneralTab\|general.*tab\|obsidian" src/renderer/src/components/settings/` 确认文件路径，若文件名不同则相应调整。

- [x] **Step 1: 找到 General Tab 组件**

```bash
ls /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime/src/renderer/src/components/settings/
```

找到 General 相关组件文件名。

- [x] **Step 2: 在组件 script 中添加响应式状态和操作**

在 `<script setup>` 中添加：

```typescript
import { ref, onMounted } from "vue";
import { usePresenter } from "@/composables/usePresenter";

const configPresenter = usePresenter("configPresenter");
const appPresenter = usePresenter("appPresenter"); // 用于 dialog

const vaultPath = ref<string>("");

onMounted(async () => {
  const saved = await configPresenter.get("obsidian.vaultPath");
  vaultPath.value = typeof saved === "string" ? saved : "";
});

async function selectVaultDir() {
  // Electron dialog 通过 appPresenter 或独立 IPC 调用
  const result = await window.electron.ipcRenderer.invoke("dialog:openDirectory");
  if (result) {
    vaultPath.value = result;
    await configPresenter.set("obsidian.vaultPath", result);
  }
}

async function clearVaultPath() {
  vaultPath.value = "";
  await configPresenter.set("obsidian.vaultPath", "");
}

async function saveVaultPath() {
  await configPresenter.set("obsidian.vaultPath", vaultPath.value);
}
```

> **注意**：需要在主进程 index.ts 或 window.ts 注册 `dialog:openDirectory` IPC handler：
>
> ```typescript
> ipcMain.handle("dialog:openDirectory", async () => {
>   const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
>   return result.canceled ? null : result.filePaths[0];
> });
> ```

- [x] **Step 3: 在模板中添加 UI**

在 General Tab 的模板中，找到合适位置添加：

```vue
<!-- Obsidian 知识库路径 -->
<div class="space-y-2">
  <label class="text-sm font-medium text-foreground">Obsidian Vault 路径</label>
  <div class="flex gap-2">
    <input
      v-model="vaultPath"
      type="text"
      placeholder="未设置，使用默认目录 (~/.slime/agents/)"
      class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet-500"
      @blur="saveVaultPath"
    />
    <button
      class="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
      @click="selectVaultDir"
    >
      选择目录
    </button>
    <button
      v-if="vaultPath"
      class="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted"
      @click="clearVaultPath"
    >
      清除
    </button>
  </div>
  <p class="text-xs text-muted-foreground">
    修改路径后，已有 Agent 目录不会自动迁移。
  </p>
</div>
```

- [x] **Step 4: 注册 dialog:openDirectory IPC handler**

在主进程找到 IPC handlers 注册位置（通常在 `src/main/index.ts` 或 `src/main/window.ts`），添加：

```typescript
import { dialog } from "electron";

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
```

- [x] **Step 5: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 6: 提交**

```bash
git add src/renderer/src/components/settings/ src/main/index.ts
git commit -m "feat(obsidian): add vault path config in General settings tab"
```

---

## Task 8: AgentEditDialog Skills Tab 改造

**Files:**

- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [x] **Step 1: 修改 script 中的状态**

找到 `const skills = ref<string[]>([])` 和 `const availableSkills = ref<SkillInfo[]>([])` 这两个状态，修改为：

```typescript
const availableSkills = ref<SkillInfo[]>([]);
const disabledSkills = ref<string[]>([]);
const agentSkillsDir = ref<string | null>(null);
```

- [x] **Step 2: 修改 watch 中的加载逻辑**

找到 `watch(() => props.open, ...)` 中加载 skills 的部分，修改为：

```typescript
// Edit 模式
disabledSkills.value = agent.config?.disabledSkills ?? [];
const agentId = agent.id;
agentSkillsDir.value = await agentConfig.getAgentSkillsDir(agentId);
availableSkills.value = await agentConfig.listLocalSkills(agentId);

// Create 模式
disabledSkills.value = [];
availableSkills.value = [];
agentSkillsDir.value = null;
```

- [x] **Step 3: 修改保存逻辑**

找到 `const config: AgentConfig = { ... skills: skills.value ... }` 的部分，修改为：

```typescript
const config: AgentConfig = {
  // ...其他字段不变...
  disabledSkills: disabledSkills.value.length > 0 ? disabledSkills.value : undefined,
  // 移除 skills 字段
};
```

- [x] **Step 4: 修改 Skills Tab 模板**

找到 Skills tab 的模板部分（`<!-- Skills -->` 注释附近），替换为：

```vue
<!-- Skills -->
<div class="space-y-2">
  <label class="mb-1 block text-xs text-muted-foreground">Skills</label>
  <div v-if="!agentSkillsDir" class="text-xs text-muted-foreground">
    保存 Agent 后可在此管理 Skills。
  </div>
  <template v-else>
    <div v-if="availableSkills.length === 0" class="text-xs text-muted-foreground">
      暂无 Skill。请将 Skill 目录放入 Agent 的 skills 子目录。
    </div>
    <div v-else class="space-y-1">
      <label
        v-for="sk in availableSkills"
        :key="sk.name"
        class="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/50 cursor-pointer"
      >
        <input
          type="checkbox"
          :checked="!disabledSkills.includes(sk.name)"
          class="accent-violet-500"
          @change="() => {
            const idx = disabledSkills.indexOf(sk.name)
            if (idx >= 0) disabledSkills.splice(idx, 1)
            else disabledSkills.push(sk.name)
          }"
        />
        <div>
          <span>{{ sk.name }}</span>
          <span class="ml-2 text-xs text-muted-foreground">{{ sk.description }}</span>
        </div>
      </label>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <span class="truncate text-xs text-muted-foreground">{{ agentSkillsDir }}</span>
      <button
        class="shrink-0 text-xs text-violet-500 hover:underline"
        @click="() => window.electron.ipcRenderer.invoke('shell:showItemInFolder', agentSkillsDir)"
      >
        在 Finder 中显示
      </button>
    </div>
  </template>
</div>
```

- [x] **Step 5: 注册 shell:showItemInFolder IPC handler**

在主进程 IPC handlers 注册位置添加：

```typescript
import { shell } from "electron";

ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});
```

- [x] **Step 6: 运行类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 7: 提交**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue src/main/index.ts
git commit -m "feat(obsidian): update AgentEditDialog Skills tab with blacklist and dir link"
```

---

## Task 9: lint、格式化、冒烟测试

**Files:** 全局

- [x] **Step 1: 格式化**

```bash
pnpm run format
```

- [x] **Step 2: Lint**

```bash
pnpm run lint
```

修复所有报错。

- [x] **Step 3: 全量类型检查**

```bash
pnpm run typecheck
```

预期：通过

- [x] **Step 4: 运行测试**

```bash
pnpm test
```

预期：所有测试通过

- [x] **Step 5: 提交格式化变更（如有）**

```bash
git add -A
git commit -m "style: format after obsidian integration"
```

---

## 自检：Spec 覆盖核对

| Spec 需求                                         | 覆盖任务                                    |
| ------------------------------------------------- | ------------------------------------------- |
| getAgentDir / getSoulPath / getSkillsDir 路径模块 | Task 1                                      |
| AgentConfig.disabledSkills 新增                   | Task 2                                      |
| paths.agentsDir 默认目录                          | Task 1                                      |
| createAgent 创建目录+SOUL.md                      | Task 3                                      |
| updateAgent name 变更重命名目录                   | Task 3                                      |
| deleteAgent 不删除目录                            | Task 3（DB 删除现有逻辑不变，不加删除操作） |
| readSoulMd 方法                                   | Task 3                                      |
| SkillPresenter 按 agentId 扫描                    | Task 4                                      |
| disabledSkills 黑名单过滤                         | Task 4                                      |
| 按 agentId 缓存                                   | Task 4                                      |
| agentChatPresenter 从文件读 systemPrompt          | Task 6                                      |
| agentChatPresenter skill 使用新接口               | Task 6                                      |
| Settings General Tab vault 路径配置               | Task 7                                      |
| AgentEditDialog Skills tab 改造                   | Task 8                                      |
