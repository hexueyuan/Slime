# Agent systemPrompt → SOUL.md 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 废弃 custom agent 的 `AgentConfig.systemPrompt` 字段，统一改用 SOUL.md 文件作为系统提示词来源，更新默认内容为有意义的中文提示词，并更新 UI。

**Architecture:** 修改 4 个文件：`agentConfigPresenter.ts`（默认内容 + 新增 `getAgentDir` 方法）、`agentChatPresenter.ts`（移除 deprecated fallback）、`contextBuilder.ts`（空 systemPrompt 时不注入 system 消息）、`AgentEditDialog.vue`（移除文本域，新增打开目录按钮）。同步更新 `IAgentConfigPresenter` 接口类型。

**Tech Stack:** TypeScript, Vue 3 Composition API, Electron (`shell.openPath`), Vitest

---

### Task 1: 修改 agentConfigPresenter — 默认 SOUL.md 内容 + 新增 getAgentDir

**Files:**

- Modify: `src/main/presenter/agentConfigPresenter.ts:69-72`
- Modify: `src/shared/types/presenters/agentConfig.presenter.d.ts`
- Test: `test/main/agentConfigPresenter.test.ts`

- [x] **Step 1: 在测试文件中新增 SOUL.md 内容断言**

打开 `test/main/agentConfigPresenter.test.ts`，在 `"createAgent generates id and emits event"` 测试后新增：

```typescript
it("createAgent writes default SOUL.md with agent name", async () => {
  const agentName = "MyBot";
  mockAgentDao.createAgent.mockReturnValue({ id: "gen-id", name: agentName, type: "custom" });
  await p.createAgent({ name: agentName });
  // mockFs.writeFile 应该被调用，内容包含 agent 名字
  expect(mockFs.writeFile).toHaveBeenCalledWith(
    expect.stringContaining("SOUL.md"),
    `你是${agentName}，一个人工智能，你的任务是帮助用户解决问题。`,
  );
});

it("getAgentDir returns dir for custom agent", async () => {
  mockAgentDao.getAgentById.mockReturnValue({ id: "a1", name: "Bot", type: "custom" });
  const dir = await p.getAgentDir("a1");
  expect(dir).toBeTruthy();
  expect(typeof dir).toBe("string");
});

it("getAgentDir returns null for builtin agent", async () => {
  mockAgentDao.getAgentById.mockReturnValue({ id: "hal-ai", name: "哈尔", type: "builtin" });
  const dir = await p.getAgentDir("hal-ai");
  expect(dir).toBeNull();
});
```

- [x] **Step 2: 运行新增测试，确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm test test/main/agentConfigPresenter.test.ts 2>&1 | tail -20
```

预期：3 个新测试 FAIL（`getAgentDir` 方法不存在，SOUL.md 内容不匹配）

- [x] **Step 3: 修改 agentConfigPresenter.ts**

修改 `createAgent` 中写入 SOUL.md 的内容（`src/main/presenter/agentConfigPresenter.ts:69-72`）：

```typescript
await fs.writeFile(
  getSoulPath(agentDir),
  `你是${agent.name}，一个人工智能，你的任务是帮助用户解决问题。`,
);
```

在 `getAgentSkillsDir` 方法后新增 `getAgentDir` 公有方法（`src/main/presenter/agentConfigPresenter.ts:188` 后）：

```typescript
async getAgentDir(agentId: string): Promise<string | null> {
  const agent = agentDao.getAgentById(getDb(), agentId);
  if (!agent) return null;
  return this.getAgentDirForAgent(agent);
}
```

- [x] **Step 4: 在 IAgentConfigPresenter 接口中新增方法**

修改 `src/shared/types/presenters/agentConfig.presenter.d.ts`，在 `getAgentSkillsDir` 后新增：

```typescript
getAgentDir(agentId: string): Promise<string | null>;
```

- [x] **Step 5: 运行测试，确认通过**

```bash
pnpm test test/main/agentConfigPresenter.test.ts 2>&1 | tail -20
```

预期：所有测试 PASS

- [x] **Step 6: 提交**

```bash
git add src/main/presenter/agentConfigPresenter.ts src/shared/types/presenters/agentConfig.presenter.d.ts test/main/agentConfigPresenter.test.ts
git commit -m "feat(agent): default SOUL.md content + getAgentDir method"
```

---

### Task 2: 修改 agentChatPresenter — 移除 deprecated config.systemPrompt fallback

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts:347-349`
- Test: `test/main/agentChat/agentChatPresenter.test.ts`

- [x] **Step 1: 确认测试文件中 buildContext 被 mock**

```bash
grep -n "buildContext\|agentConfigPresenter" test/main/agentChat/agentChatPresenter.test.ts | head -10
```

预期：`buildContext` 被 `vi.mock` 整体替换，现有测试不直接测 `agentSystemPrompt` 传值，无需新增测试（逻辑变更已由 contextBuilder 测试覆盖）。

- [x] **Step 2: 修改 agentChatPresenter.ts 第 347-349 行**

将：

```typescript
const agentSystemPrompt = this.agentConfigPresenter
  ? await this.agentConfigPresenter.readSoulMd(session.agentId)
  : (agent?.config?.systemPrompt ?? "");
```

改为：

```typescript
const agentSystemPrompt = this.agentConfigPresenter
  ? await this.agentConfigPresenter.readSoulMd(session.agentId)
  : "";
```

- [x] **Step 4: 运行相关测试，确认不退步**

```bash
pnpm test test/main/agentChat/agentChatPresenter.test.ts 2>&1 | tail -20
```

预期：全部 PASS

- [x] **Step 5: 提交**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(agent): remove deprecated config.systemPrompt fallback"
```

---

### Task 3: 修改 contextBuilder — 空 systemPrompt 时不注入 system 消息

**Files:**

- Modify: `src/main/presenter/agentChat/contextBuilder.ts:155-160, 200-201`
- Test: `test/main/agentChat/contextBuilder.test.ts`

- [x] **Step 1: 新增测试：agentSystemPrompt 为空时不注入 system 消息**

在 `test/main/agentChat/contextBuilder.test.ts` 中，在现有测试后新增：

```typescript
it("omits system message when agentSystemPrompt is empty and no config", () => {
  vi.mocked(configDao.getConfigById).mockReturnValue(undefined);
  const result = buildContext("sess-1", "Hello!", fakeDb, { agentSystemPrompt: "" });
  // 不应有 role: "system" 的消息（无 config.systemPrompt，agentSystemPrompt 为空）
  const systemMsgs = result.filter((m) => m.role === "system");
  expect(systemMsgs).toHaveLength(0);
  expect(result[0]).toEqual({ role: "user", content: "Hello!" });
});

it("includes system message when agentSystemPrompt is provided", () => {
  vi.mocked(configDao.getConfigById).mockReturnValue(undefined);
  const result = buildContext("sess-1", "Hi", fakeDb, { agentSystemPrompt: "你是小助手" });
  expect(result[0]).toEqual({ role: "system", content: "你是小助手" });
});

it("falls back to default when no agentSystemPrompt option passed (builtin agent path)", () => {
  vi.mocked(configDao.getConfigById).mockReturnValue(undefined);
  const result = buildContext("sess-1", "Hello!", fakeDb);
  // 不传 agentSystemPrompt 时走原有 fallback
  expect(result[0]).toEqual({ role: "system", content: "You are a helpful AI assistant." });
});
```

- [x] **Step 2: 运行新增测试，确认失败**

```bash
pnpm test test/main/agentChat/contextBuilder.test.ts 2>&1 | tail -20
```

预期：`omits system message` 测试 FAIL（当前仍注入默认 system 消息）

- [x] **Step 3: 修改 contextBuilder.ts**

将 `buildContext` 中第 155-160 行和 200-201 行改为：

```typescript
// 区分：options 中显式传入 agentSystemPrompt（custom agent 路径）vs 未传（builtin/默认路径）
const hasAgentSystemPromptOption = options !== undefined && "agentSystemPrompt" in options;
const rawSystemPrompt = hasAgentSystemPromptOption
  ? (options!.agentSystemPrompt ?? "")
  : config?.systemPrompt || "You are a helpful AI assistant.";
const systemPrompt = config?.systemPrompt || rawSystemPrompt;
const finalSystemPrompt = options?.skillListXML
  ? systemPrompt + "\n\n" + options.skillListXML
  : systemPrompt;
```

然后修改 return 语句（第 200-201 行）：

```typescript
const newUserMsg: CoreMessage = { role: "user", content: newUserContent };
// 空 systemPrompt 时不注入 system 消息
if (finalSystemPrompt) {
  const systemMsg: CoreMessage = { role: "system", content: finalSystemPrompt };
  return [systemMsg, ...summaryMessages, ...filtered, newUserMsg];
}
return [...summaryMessages, ...filtered, newUserMsg];
```

同时删除原来在 155-160 行之后、return 之前声明的 `const systemMsg` 变量（已移入 if 块）。

- [x] **Step 4: 运行全部 contextBuilder 测试，确认通过**

```bash
pnpm test test/main/agentChat/contextBuilder.test.ts 2>&1 | tail -30
```

预期：所有测试 PASS（包括原有的 `"builds context for new session"` 仍通过，因为不传 options 走 fallback 路径）

- [x] **Step 5: 提交**

```bash
git add src/main/presenter/agentChat/contextBuilder.ts test/main/agentChat/contextBuilder.test.ts
git commit -m "feat(agent): omit system msg when agentSystemPrompt empty"
```

---

### Task 4: 修改 AgentEditDialog.vue — 移除 systemPrompt 文本域，新增打开目录按钮

**Files:**

- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [x] **Step 1: 移除 systemPrompt 相关响应式状态和保存逻辑**

在 `<script setup>` 中：

1. 删除 `const systemPrompt = ref("")`（第 36 行）
2. 删除 `systemPrompt.value = cfg?.systemPrompt ?? ""`（第 102 行）
3. 删除 `systemPrompt.value = ""`（第 130 行）
4. 删除 `config` 对象中的 `systemPrompt: systemPrompt.value || undefined`（第 200 行）

- [x] **Step 2: 新增打开目录的方法**

在 `<script setup>` 中，在现有 import 区域后新增（使用已有的 `agentConfig` presenter）：

```typescript
async function openAgentDir() {
  if (!props.agentId) return;
  const dir = await agentConfig.getAgentDir(props.agentId);
  if (dir) {
    window.electron.ipcRenderer.invoke("shell:openPath", dir);
  }
}
```

- [x] **Step 3: 替换 UI — 移除文本域，新增按钮**

将 `<!-- System Prompt -->` 整块（第 389-398 行）替换为：

```vue
<!-- Agent 目录 -->
<div v-if="isEdit">
  <label class="mb-1 block text-xs text-muted-foreground">系统提示词</label>
  <p class="mb-1.5 text-xs text-muted-foreground">
    通过编辑 Agent 目录下的 <code class="rounded bg-muted px-1">SOUL.md</code> 文件设置系统提示词。
  </p>
  <button
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-foreground hover:bg-muted"
    @click="openAgentDir"
  >
    <Icon icon="lucide:folder-open" class="h-3.5 w-3.5" />
    打开 Agent 目录
  </button>
</div>
```

> 注意：`v-if="isEdit"` — 新建 agent 时目录尚未存在（createAgent 执行后才有），且新建时 agentId 也为 null，按钮无意义，故只在编辑模式显示。

- [x] **Step 4: 检查 shell:openPath IPC 是否已注册**

```bash
grep -rn "shell:openPath" src/main/ src/preload/
```

若未注册，在主进程 IPC 注册处（通常在 `src/main/index.ts` 或 `window.ts`）新增：

```typescript
import { shell } from "electron";
ipcMain.handle("shell:openPath", (_event, path: string) => {
  shell.openPath(path);
});
```

- [x] **Step 5: 运行 lint 和格式化**

```bash
pnpm run format && pnpm run lint
```

预期：无错误

- [x] **Step 6: 提交**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue src/main/index.ts
git commit -m "feat(agent): replace systemPrompt textarea with open-dir button"
```

---

### Task 5: 全量测试验证

- [x] **Step 1: 运行全部测试**

```bash
pnpm test 2>&1 | tail -30
```

预期：所有测试 PASS，无回退

- [x] **Step 2: 运行 typecheck**

```bash
pnpm run typecheck 2>&1 | tail -20
```

预期：无类型错误

- [x] **Step 3: 运行格式化检查**

```bash
pnpm run format:check 2>&1 | tail -10
```

预期：格式正确
