# Agent MBTI 性格系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent 引入 MBTI 性格类型系统，MBTI 决定主题颜色和性格提示词，替代原有 themeColor 和 agentSoul 概念。

**Architecture:** Agent 顶级新增 `mbti` 必填字段（DB + 类型），删除 themeColor。新建 `src/shared/constants/mbti.ts` 常量文件存放 16 种映射。systemPrompt 构建改为 MBTI 性格提示词 + prompt.md 拼接。soul.md → prompt.md 重命名。

**Tech Stack:** TypeScript, better-sqlite3, Vue 3 Composition API, Vitest

---

## File Structure

| 操作   | 文件                                                     | 职责                                                                       |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Create | `src/shared/constants/mbti.ts`                           | MBTI 类型定义 + 16 色/性格映射                                             |
| Modify | `src/shared/types/agent.d.ts`                            | Agent.mbti 新增, themeColor 删除, AgentConfig.agentSoul → additionalPrompt |
| Modify | `src/main/db/database.ts`                                | migrate() 新增 mbti 列                                                     |
| Modify | `src/main/db/models/agentDao.ts`                         | AgentRow.mbti + rowToAgent/createAgent/updateAgent/ensureBuiltin 适配      |
| Modify | `src/main/agents/index.ts`                               | BuiltinAgentDef.mbti + loadBuiltinAgents 读取 mbti                         |
| Rename | `src/main/agents/hal-ai/soul.md` → `prompt.md`           | 文件重命名                                                                 |
| Modify | `src/main/agents/hal-ai/config.json`                     | 新增 mbti, 删除 themeColor                                                 |
| Rename | `src/main/agents/moss-ai/soul.md` → `prompt.md`          | 文件重命名                                                                 |
| Modify | `src/main/agents/moss-ai/config.json`                    | 新增 mbti, 删除 themeColor                                                 |
| Modify | `src/main/utils/agentPaths.ts`                           | getSoulPath → getPromptPath（+ fallback）                                  |
| Modify | `src/main/presenter/agentConfigPresenter.ts`             | readSoulMd → readPromptMd, createAgent prompt.md                           |
| Modify | `src/shared/types/presenters/agentConfig.presenter.d.ts` | readSoulMd → readPromptMd                                                  |
| Modify | `src/main/presenter/devPresenter.ts`                     | soul → prompt 文件名                                                       |
| Modify | `src/shared/types/presenters/dev.presenter.d.ts`         | BuiltinAgentInfo.soul → prompt                                             |
| Modify | `src/main/presenter/agentChat/agentChatPresenter.ts`     | systemPrompt 构建逻辑                                                      |
| Modify | `src/renderer/src/components/agents/AgentEditForm.vue`   | MBTI 选择器 + 删除 themeColor                                              |
| Modify | `src/renderer/src/components/chat/ChatView.vue`          | themeColor → getMBTIColor                                                  |
| Modify | `src/renderer/src/components/chat/NewThread.vue`         | themeColor → getMBTIColor                                                  |
| Modify | `test/main/agentDao.test.ts`                             | 适配 mbti 字段                                                             |

---

### Task 1: MBTI 常量文件

**Files:**

- Create: `src/shared/constants/mbti.ts`

- [ ] **Step 1: 创建 MBTI 常量文件**

```typescript
// src/shared/constants/mbti.ts
export type MBTIType =
  | "INTJ"
  | "INTP"
  | "ENTJ"
  | "ENTP"
  | "INFJ"
  | "INFP"
  | "ENFJ"
  | "ENFP"
  | "ISTJ"
  | "ISFJ"
  | "ESTJ"
  | "ESFJ"
  | "ISTP"
  | "ISFP"
  | "ESTP"
  | "ESFP";

export interface MBTIProfile {
  color: string;
  personality: string;
}

export const MBTI_MAP: Record<MBTIType, MBTIProfile> = {
  // 分析家
  INTJ: {
    color: "#6366f1",
    personality:
      "你的性格类型是 INTJ（策略家）。你理性、独立、追求效率，擅长战略性思考和系统性规划。你偏好直接、简洁的沟通方式，注重逻辑推理，善于将复杂问题分解为可执行步骤。",
  },
  INTP: {
    color: "#818cf8",
    personality:
      "你的性格类型是 INTP（逻辑学家）。你好奇心旺盛、善于抽象思考，喜欢深入探究事物本质。你擅长发现模式和规律，表达时注重精确和逻辑性。",
  },
  ENTJ: {
    color: "#4f46e5",
    personality:
      "你的性格类型是 ENTJ（指挥官）。你果断、有魄力、天生的领导者，擅长制定宏观战略并推动执行。你沟通直接高效，注重结果导向。",
  },
  ENTP: {
    color: "#a78bfa",
    personality:
      "你的性格类型是 ENTP（辩论家）。你机智、思维敏捷、喜欢挑战常规。你善于从多角度分析问题，交流时充满活力和幽默感。",
  },
  // 外交家
  INFJ: {
    color: "#10b981",
    personality:
      "你的性格类型是 INFJ（提倡者）。你富有洞察力、理想主义、关注深层意义。你善于理解他人需求，沟通时富有同理心且言辞深思熟虑。",
  },
  INFP: {
    color: "#34d399",
    personality:
      "你的性格类型是 INFP（调停者）。你富有想象力、内心丰富、追求真实和意义。你善于用文字表达情感，沟通时温柔且富有诗意。",
  },
  ENFJ: {
    color: "#059669",
    personality:
      "你的性格类型是 ENFJ（主人公）。你热情、有感召力、天生的引导者。你擅长激发他人潜力，沟通时温暖且具有鼓舞性。",
  },
  ENFP: {
    color: "#f59e0b",
    personality:
      "你的性格类型是 ENFP（活动家）。你热情洋溢、充满创意、善于激励他人。你喜欢探索各种可能性，交流时自由奔放，善于发现事物之间的联系。",
  },
  // 守卫者
  ISTJ: {
    color: "#0ea5e9",
    personality:
      "你的性格类型是 ISTJ（物流师）。你可靠、务实、注重细节和规则。你做事条理分明、一丝不苟，沟通时清晰准确、言出必行。",
  },
  ISFJ: {
    color: "#06b6d4",
    personality:
      "你的性格类型是 ISFJ（守护者）。你细心、可靠、体贴入微，注重细节和他人感受。你擅长有条不紊地完成任务，沟通时温和耐心。",
  },
  ESTJ: {
    color: "#0284c7",
    personality:
      "你的性格类型是 ESTJ（总经理）。你高效、有组织力、重视秩序和传统。你善于制定和执行计划，沟通时直截了当、条理清晰。",
  },
  ESFJ: {
    color: "#ec4899",
    personality:
      "你的性格类型是 ESFJ（执政官）。你热心、善于社交、关注他人福祉。你擅长营造和谐氛围，沟通时亲切友善、善于照顾每个人的感受。",
  },
  // 探险家
  ISTP: {
    color: "#64748b",
    personality:
      "你的性格类型是 ISTP（鉴赏家）。你冷静、善于观察、动手能力强。你喜欢分析事物的运作方式，沟通时简洁务实、直奔主题。",
  },
  ISFP: {
    color: "#f472b6",
    personality:
      "你的性格类型是 ISFP（探险家）。你感性、随和、具有艺术气质。你善于捕捉美和细微变化，沟通时自然真诚、不喜欢教条。",
  },
  ESTP: {
    color: "#ef4444",
    personality:
      "你的性格类型是 ESTP（企业家）。你大胆、精力充沛、善于应变。你喜欢行动胜过空谈，沟通时直率幽默、富有感染力。",
  },
  ESFP: {
    color: "#f97316",
    personality:
      "你的性格类型是 ESFP（表演者）。你活泼、乐观、享受当下。你善于带动气氛、让人感到快乐，沟通时轻松有趣、充满活力。",
  },
};

export function getMBTIColor(mbti: MBTIType): string {
  return MBTI_MAP[mbti].color;
}

export function getMBTIPersonality(mbti: MBTIType): string {
  return MBTI_MAP[mbti].personality;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit --skipLibCheck src/shared/constants/mbti.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants/mbti.ts
git commit -m "feat(agent): add MBTI constants with 16 type/color/personality mappings"
```

---

### Task 2: 类型定义变更

**Files:**

- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/shared/types/presenters/agentConfig.presenter.d.ts`
- Modify: `src/shared/types/presenters/dev.presenter.d.ts`

- [ ] **Step 1: 修改 Agent 接口**

在 `src/shared/types/agent.d.ts`:

1. 顶部新增 import（注意：.d.ts 文件用 import type）:

```typescript
import type { MBTIType } from "../constants/mbti";
```

2. `Agent` 接口：删除 `themeColor?: string | null;` 行，新增 `mbti: MBTIType;`（放在 avatar 之后）

3. `AgentConfig` 接口：删除 `agentSoul` 相关（含 JSDoc），新增:

```typescript
  /** 附加提示词，追加到 MBTI 性格提示词之后 */
  additionalPrompt?: string;
```

同时删除已 deprecated 的 `systemPrompt`、`disabledTools`、`skills`、`disabledSkills`（清理过时字段）。

- [ ] **Step 2: 修改 IAgentConfigPresenter**

在 `src/shared/types/presenters/agentConfig.presenter.d.ts`:

将 `readSoulMd(agentId: string): Promise<string>` 改为 `readPromptMd(agentId: string): Promise<string>`

- [ ] **Step 3: 修改 BuiltinAgentInfo**

在 `src/shared/types/presenters/dev.presenter.d.ts`:

将 `soul: string` 改为 `prompt: string`

同时 `saveBuiltinAgent` 的第三个参数名 `soul` 改为 `prompt`:

```typescript
saveBuiltinAgent(agentId: string, config: Record<string, unknown>, prompt: string): Promise<void>;
```

- [ ] **Step 4: 验证类型检查**

Run: `pnpm run typecheck`
Expected: 有编译错误（因为其他文件还未更新），但类型文件本身无语法错误

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/agent.d.ts src/shared/types/presenters/agentConfig.presenter.d.ts src/shared/types/presenters/dev.presenter.d.ts
git commit -m "feat(agent): update type definitions for MBTI system"
```

---

### Task 3: 数据库迁移 + agentDao 适配

**Files:**

- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/models/agentDao.ts`
- Modify: `test/main/agentDao.test.ts`

- [ ] **Step 1: 添加 DB 迁移**

在 `src/main/db/database.ts` 的 `migrate()` 函数末尾添加:

```typescript
// Add mbti column to agents (MBTI personality system)
const agentColsMbti = instance.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
if (!agentColsMbti.some((c) => c.name === "mbti")) {
  instance.exec("ALTER TABLE agents ADD COLUMN mbti TEXT NOT NULL DEFAULT 'INTJ'");
}
```

同时在 DDL 的 `CREATE TABLE agents` 中添加 `mbti TEXT NOT NULL DEFAULT 'INTJ'`（在 `theme_color` 行之后）。

- [ ] **Step 2: 修改 agentDao.ts**

1. `AgentRow` 接口新增 `mbti: string;`

2. `rowToAgent` 函数：删除 `themeColor: row.theme_color ?? undefined`，新增 `mbti: row.mbti as MBTIType`（需要顶部 import type { MBTIType } from "@shared/constants/mbti"）

3. `createAgent`：
   - SQL INSERT 列列表中 `theme_color` → `mbti`
   - VALUES 对应位置改为 `data.mbti ?? "INTJ"`

4. `updateAgent`：
   - 删除 `if (data.themeColor !== undefined)` 块
   - 新增:

   ```typescript
   if (data.mbti !== undefined) {
     sets.push("mbti = ?");
     values.push(data.mbti);
   }
   ```

5. `ensureBuiltin`：
   - INSERT 列列表中 `theme_color` → `mbti`
   - ON CONFLICT 中 `theme_color = excluded.theme_color` → `mbti = excluded.mbti`
   - `.run()` 参数中 `agent.themeColor ?? null` → `agent.mbti ?? "INTJ"`

- [ ] **Step 3: 修改测试**

在 `test/main/agentDao.test.ts`:

1. `createAgent` 调用添加 `mbti: "INTJ"` 参数
2. 添加测试验证 mbti 字段:

```typescript
it("stores and retrieves mbti field", () => {
  const agent = agentDao.createAgent(db, {
    id: "mbti-test",
    name: "MBTI Test",
    type: "custom",
    enabled: true,
    protected: false,
    mbti: "ENFP",
  });
  expect(agent.mbti).toBe("ENFP");

  agentDao.updateAgent(db, "mbti-test", { mbti: "INTJ" });
  const updated = agentDao.getAgentById(db, "mbti-test");
  expect(updated?.mbti).toBe("INTJ");
});
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test test/main/agentDao.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts src/main/db/models/agentDao.ts test/main/agentDao.test.ts
git commit -m "feat(agent): add mbti column to DB, adapt agentDao CRUD"
```

---

### Task 4: 内置 Agent 定义 + 文件重命名

**Files:**

- Modify: `src/main/agents/index.ts`
- Modify: `src/main/agents/hal-ai/config.json`
- Rename: `src/main/agents/hal-ai/soul.md` → `prompt.md`
- Modify: `src/main/agents/moss-ai/config.json`
- Rename: `src/main/agents/moss-ai/soul.md` → `prompt.md`

- [ ] **Step 1: 重命名 soul.md → prompt.md**

```bash
mv src/main/agents/hal-ai/soul.md src/main/agents/hal-ai/prompt.md
mv src/main/agents/moss-ai/soul.md src/main/agents/moss-ai/prompt.md
```

- [ ] **Step 2: 修改 config.json 文件**

`src/main/agents/hal-ai/config.json` — 删除 `"themeColor": "#a855f7"`，新增 `"mbti": "INTJ"`:

```json
{
  "name": "哈尔",
  "description": "你好我是哈尔，使用Slime有问题都可以来找我～",
  "mbti": "INTJ",
  "capabilityRequirements": ["reasoning"],
  ...
}
```

`src/main/agents/moss-ai/config.json` — 删除 `"themeColor": "#10b981"`，新增 `"mbti": "ISFJ"`:

```json
{
  "name": "莫斯",
  "description": "你好，我是莫斯，帮你管理日程和待办任务。",
  "mbti": "ISFJ",
  ...
}
```

- [ ] **Step 3: 修改 `src/main/agents/index.ts`**

1. 添加 import:

```typescript
import type { MBTIType } from "@shared/constants/mbti";
```

2. `BuiltinAgentDef` 接口：删除 `themeColor?: string`，新增 `mbti: MBTIType`

3. `AgentConfigJson` 接口：删除 `themeColor?: string`，新增 `mbti?: MBTIType`

4. `loadBuiltinAgents` 函数体：
   - 读取文件名从 `soul.md` 改为 `prompt.md`（带 fallback）:

   ```typescript
   const promptPath = join(dir, "prompt.md");
   const soulPath = join(dir, "soul.md"); // fallback
   const prompt = existsSync(promptPath)
     ? readFileSync(promptPath, "utf-8").trim()
     : existsSync(soulPath)
       ? readFileSync(soulPath, "utf-8").trim()
       : undefined;
   ```

   - 从 cfg 解构中删除 `themeColor`，新增 `mbti`
   - `agents.push({...})` 中：删除 `themeColor`，新增 `mbti: cfg.mbti ?? "INTJ"`
   - config 对象中 `agentSoul: soul` → `additionalPrompt: prompt`

- [ ] **Step 4: 验证加载**

Run: `npx ts-node -e "const {BUILTIN_AGENTS} = require('./src/main/agents'); console.log(BUILTIN_AGENTS.map(a => ({id:a.id, mbti:a.mbti})))"`
Expected: 输出 [{id:'hal-ai', mbti:'INTJ'}, {id:'moss-ai', mbti:'ISFJ'}]

（如果 ts-node 不可用，跳过此验证步骤，后续 typecheck 会覆盖）

- [ ] **Step 5: Commit**

```bash
git add src/main/agents/
git commit -m "feat(agent): migrate builtin agents to MBTI, rename soul.md to prompt.md"
```

---

### Task 5: agentPaths + AgentConfigPresenter 适配

**Files:**

- Modify: `src/main/utils/agentPaths.ts`
- Modify: `src/main/presenter/agentConfigPresenter.ts`

- [ ] **Step 1: 修改 agentPaths.ts**

将 `getSoulPath` 重命名为 `getPromptPath`，返回 `prompt.md`:

```typescript
/** prompt.md 绝对路径 */
export function getPromptPath(agentDir: string): string {
  return join(agentDir, "prompt.md");
}

/** @deprecated fallback 用 — SOUL.md 旧路径 */
export function getSoulPath(agentDir: string): string {
  return join(agentDir, "SOUL.md");
}
```

- [ ] **Step 2: 修改 agentConfigPresenter.ts**

1. import 修改：`getSoulPath` → `getPromptPath, getSoulPath`

2. `readSoulMd` → `readPromptMd`:

```typescript
async readPromptMd(agentId: string): Promise<string> {
  const agent = agentDao.getAgentById(getDb(), agentId);
  if (!agent) return "";
  const agentDir = await this.getAgentDirForAgent(agent);
  if (!agentDir) return "";
  try {
    return await fs.readFile(getPromptPath(agentDir), "utf-8");
  } catch {
    // fallback: try old SOUL.md
    try {
      return await fs.readFile(getSoulPath(agentDir), "utf-8");
    } catch {
      return "";
    }
  }
}
```

3. `createAgent` 中写初始文件改为 `prompt.md`:

```typescript
await fs.writeFile(
  getPromptPath(agentDir),
  `你是${agent.name}，一个人工智能，你的任务是帮助用户解决问题。`,
);
```

4. `createAgent` 中 `agentDao.createAgent` 调用需要传 `mbti`:

```typescript
const agent = agentDao.createAgent(getDb(), {
  id,
  name: data.name || "New Agent",
  type: data.type || "custom",
  enabled: data.enabled ?? true,
  protected: data.protected ?? false,
  description: data.description,
  avatar: data.avatar,
  mbti: data.mbti ?? "INTJ",
  config: data.config,
});
```

- [ ] **Step 3: 修改 test/main/agentConfigPresenter.test.ts（如有相关 mock）**

更新 `readSoulMd` 相关引用为 `readPromptMd`。

- [ ] **Step 4: Commit**

```bash
git add src/main/utils/agentPaths.ts src/main/presenter/agentConfigPresenter.ts test/main/agentConfigPresenter.test.ts
git commit -m "feat(agent): rename readSoulMd to readPromptMd, adapt agentPaths"
```

---

### Task 6: DevPresenter 适配

**Files:**

- Modify: `src/main/presenter/devPresenter.ts`

- [ ] **Step 1: 修改 devPresenter.ts**

1. `listBuiltinAgents` 和 `getBuiltinAgent`：`soul.md` → `prompt.md`（带 fallback 读 soul.md）:

```typescript
const promptPath = join(entryPath, "prompt.md");
const soulPath = join(entryPath, "soul.md");
const prompt = existsSync(promptPath)
  ? readFileSync(promptPath, "utf-8")
  : existsSync(soulPath)
    ? readFileSync(soulPath, "utf-8")
    : "";

results.push({ id: entry, config, prompt });
```

2. `saveBuiltinAgent` 第三个参数名 `soul` → `prompt`，写入 `prompt.md`:

```typescript
async saveBuiltinAgent(
  agentId: string,
  config: Record<string, unknown>,
  prompt: string,
): Promise<void> {
  this.assertDev();
  const dir = join(this.agentsSrcDir, agentId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
  await writeFile(join(dir, "prompt.md"), prompt, "utf-8");
}
```

3. `createBuiltinAgent` 中初始文件名 `soul.md` → `prompt.md`。

- [ ] **Step 2: Commit**

```bash
git add src/main/presenter/devPresenter.ts
git commit -m "feat(agent): adapt devPresenter for prompt.md naming"
```

---

### Task 7: SystemPrompt 构建逻辑

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [ ] **Step 1: 修改 systemPrompt 构建（约第 323-340 行）**

替换原有 agentSoul 优先级链:

```typescript
// Build system prompt: MBTI personality + prompt.md (additional prompt)
import { MBTI_MAP } from "@shared/constants/mbti";

// ... inside chat() method, replacing lines 323-340:

const mbtiPrompt = agent?.mbti ? (MBTI_MAP[agent.mbti]?.personality ?? "") : "";
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
const agentSystemPrompt = mbtiPrompt
  ? rawPrompt
    ? mbtiPrompt + "\n\n" + rawPrompt
    : mbtiPrompt
  : rawPrompt;
```

2. import 顶部添加:

```typescript
import { MBTI_MAP } from "@shared/constants/mbti";
```

3. 删除对 `readSoulMd` 的调用引用（已改为 `readPromptMd`）。

- [ ] **Step 2: 运行对话相关测试**

Run: `pnpm test test/main/agentChat/agentChatPresenter.test.ts`
Expected: PASS（可能需要更新 mock 中的 agentSoul → additionalPrompt）

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(agent): build systemPrompt from MBTI personality + additionalPrompt"
```

---

### Task 8: AgentEditForm UI 改版

**Files:**

- Modify: `src/renderer/src/components/agents/AgentEditForm.vue`

- [ ] **Step 1: 修改模板 — 替换主题颜色为 MBTI 选择器**

删除原 `<!-- 主题颜色 -->` 块（第 49-68 行），替换为:

```vue
<!-- MBTI 性格类型 -->
<div>
  <label class="text-xs font-medium text-muted-foreground">MBTI 性格类型</label>
  <div class="mt-1 grid grid-cols-4 gap-2">
    <button
      v-for="mbti in MBTI_TYPES"
      :key="mbti"
      :disabled="readonly"
      class="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors disabled:opacity-50"
      :class="form.mbti === mbti
        ? 'border-violet-500 bg-violet-500/10 text-foreground'
        : 'border-border text-muted-foreground hover:border-muted-foreground'"
      @click="form.mbti = mbti"
    >
      <span
        class="h-3 w-3 shrink-0 rounded-full"
        :style="{ backgroundColor: getMBTIColor(mbti) }"
      />
      {{ mbti }}
    </button>
  </div>
</div>
```

- [ ] **Step 2: 修改模板 — "性格设定" → "附加提示词"**

将第 70-80 行 `<!-- 性格设定 Soul -->` 块的 label 改为:

```vue
<label class="text-xs font-medium text-muted-foreground">附加提示词</label>
```

textarea 的 `v-model` 从 `form.soul` 改为 `form.additionalPrompt`，placeholder 改为:

```
追加到 MBTI 性格提示词之后...
```

- [ ] **Step 3: 修改 script — form 数据 + imports**

1. 删除 `PRESET_COLORS` 常量

2. 新增:

```typescript
import { type MBTIType, MBTI_MAP, getMBTIColor } from "@shared/constants/mbti";

const MBTI_TYPES: MBTIType[] = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];
```

3. `form` reactive 对象：
   - 删除 `themeColor: ""`
   - `soul: ""` → `additionalPrompt: ""`
   - 新增 `mbti: "INTJ" as MBTIType`

4. `loadBuiltin` 函数：
   - 删除 `form.themeColor = ...`
   - `form.soul = info.soul || ""` → `form.additionalPrompt = info.prompt || ""`
   - 新增 `form.mbti = (cfg.mbti as MBTIType) || "INTJ"`

5. `loadCustom` 函数：
   - 删除 `form.themeColor = agent.themeColor || ""`
   - `form.soul = soul || ""` → 读取 prompt：

   ```typescript
   const prompt = (await agentConfigPresenter.readPromptMd(agent.id)) as string;
   form.additionalPrompt = prompt || "";
   ```

   - 新增 `form.mbti = agent.mbti || "INTJ"`

6. `save` 函数 — builtin 分支:
   - config 对象：删除 `themeColor`，新增 `mbti: form.mbti`
   - `await devPresenter.saveBuiltinAgent(props.agentInfo.id, config, form.additionalPrompt)`

7. `save` 函数 — custom 分支:
   - 删除 `themeColor: form.themeColor || null`
   - 新增 `mbti: form.mbti`
   - config 中 `agentSoul: form.soul || undefined` → `additionalPrompt: form.additionalPrompt || undefined`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/agents/AgentEditForm.vue
git commit -m "feat(agent): replace themeColor picker with MBTI selector in AgentEditForm"
```

---

### Task 9: 渲染组件颜色适配

**Files:**

- Modify: `src/renderer/src/components/chat/ChatView.vue`
- Modify: `src/renderer/src/components/chat/NewThread.vue`

- [ ] **Step 1: 修改 ChatView.vue**

添加 import:

```typescript
import { getMBTIColor } from "@shared/constants/mbti";
```

第 52 行:

```vue
:style="{ '--agent-color': agent?.themeColor ?? '#a855f7' }"
```

改为:

```vue
:style="{ '--agent-color': getMBTIColor(agent?.mbti ?? 'INTJ') }"
```

- [ ] **Step 2: 修改 NewThread.vue**

添加 import:

```typescript
import { getMBTIColor } from "@shared/constants/mbti";
```

删除 `agentColor` 函数（第 31-33 行），直接用:

```typescript
function agentColor(agent: Agent): string {
  return getMBTIColor(agent.mbti ?? "INTJ");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/chat/ChatView.vue src/renderer/src/components/chat/NewThread.vue
git commit -m "feat(agent): use getMBTIColor for agent color in ChatView and NewThread"
```

---

### Task 10: 整体验证

**Files:** (无新修改)

- [ ] **Step 1: 运行 typecheck**

Run: `pnpm run typecheck`
Expected: PASS（0 errors）

- [ ] **Step 2: 运行全部测试**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: 运行 lint + format**

Run: `pnpm run format && pnpm run lint`
Expected: 无错误

- [ ] **Step 4: 最终 commit（如 format 产生变更）**

```bash
git add -A
git commit -m "style: format after MBTI system implementation"
```
