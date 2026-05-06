# Remove SLIME_REPLY + Add Thinking Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉 Agent 对话中的 `<SLIME_REPLY>` 特殊展示逻辑，所有内容直接流式展示；thinking block 折叠展示在消息内；Agent 配置新增 `enableThinking` 开关，打开后向 Anthropic API 发送 `thinking: { type: "enabled", budget_tokens: 10000 }` 参数。

**Architecture:** 三个独立变更串行执行：① 删除 SLIME_REPLY 相关代码并修复渲染；② thinking block 在消息内折叠展示并在 ThoughtChainPanel 中也能展示；③ Agent config 加 `enableThinking` 开关，通过 ChatOptions → requestBuilder 传递给 Anthropic API。

**Tech Stack:** TypeScript, Vue 3 Composition API, Vitest

---

## File Map

| 文件                                                        | 变更类型 | 说明                                                          |
| ----------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| `src/shared/types/agent.d.ts`                               | Modify   | AgentConfig 加 `enableThinking?: boolean`；删 `is_final` 字段 |
| `src/main/llm/core/types.ts`                                | Modify   | ChatOptions 加 `thinkingBudget?: number`                      |
| `src/main/llm/providers/anthropic/types.ts`                 | Modify   | AnthropicRequestBody 加 `thinking` 字段                       |
| `src/main/llm/providers/anthropic/requestBuilder.ts`        | Modify   | 有 thinkingBudget 时构建 thinking 参数                        |
| `src/main/presenter/agentChat/agentChatPresenter.ts`        | Modify   | 删 SLIME_REPLY 逻辑；传 thinkingBudget                        |
| `src/main/agents/hal.ts`                                    | Modify   | 删 system prompt 中 SLIME_REPLY 相关指令                      |
| `src/renderer/src/components/chat/ChatMessageAssistant.vue` | Modify   | 重写 block 渲染：直接展示所有 block，thinking block 折叠      |
| `src/renderer/src/components/chat/ThoughtChainPanel.vue`    | Modify   | 增加 thinking block 渲染                                      |
| `src/renderer/src/components/chat/AgentEditDialog.vue`      | Modify   | 加 `enableThinking` 状态和开关 UI                             |
| `src/renderer/src/views/ChatroomPanel.vue`                  | Modify   | `thoughtChainBlocks` 去掉 `is_final` 过滤                     |

---

## Task 1: 删除 SLIME_REPLY — 类型和后端

**Files:**

- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`
- Modify: `src/main/agents/hal.ts`

- [ ] **Step 1: 删除 `AssistantMessageBlock` 中的 `is_final` 字段**

`src/shared/types/agent.d.ts` 的 `AssistantMessageBlock` 接口，删除 `is_final` 一行：

```typescript
export interface AssistantMessageBlock {
  id?: string;
  type: AssistantBlockType;
  content?: string;
  status: "pending" | "success" | "error" | "loading";
  timestamp: number;
  tool_call?: ToolCallBlockData;
  image_data?: { data: string; mimeType: string };
  thinking?: string;
  signature?: string;
  // 删掉: is_final?: boolean;
}
```

- [ ] **Step 2: 删除 agentChatPresenter.ts 中 SLIME_REPLY 相关代码**

删除文件头部的正则和两个函数（第 22-54 行）：

```typescript
// 删除以下全部：
const SLIME_REPLY_FULL_RE = /<SLIME_REPLY>([\s\S]*?)<\/SLIME_REPLY>/;
const SLIME_REPLY_OPEN_RE = /<SLIME_REPLY>([\s\S]*)/;

function stripSlimeReplyTags(text: string): string {
  return text.replace(/<\/?SLIME_REPLY>/g, "").trim();
}

function markFinalBlock(blocks: AssistantMessageBlock[]): void {
  // ... 整个函数
}
```

同时删除两处 `markFinalBlock(blocks)` 调用（在 `// Finalize blocks` 之后，以及 abort 分支里）。

- [ ] **Step 3: 删除 hal.ts 中 SLIME_REPLY system prompt 指令**

`src/main/agents/hal.ts` 的 `systemPrompt` 删除以下这一行：

```
- 将最终呈现给用户的答案用 <SLIME_REPLY>...</SLIME_REPLY> 标签包裹，标签外的所有文字（包括思考过程、工具操作描述等）均为中间步骤，不会展示给用户；
```

修改后的 `## 回复格式` 段落只保留：

```
## 回复格式
- 完成信息收集并写好答案后，再执行清理操作（如关闭浏览器），清理操作之后不要再输出任何文本。
```

- [ ] **Step 4: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无 error（可能有 `is_final` 不存在的 warning，下一步修）

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/presenter/agentChat/agentChatPresenter.ts src/main/agents/hal.ts
git commit -m "feat: remove SLIME_REPLY logic from presenter and hal agent"
```

---

## Task 2: 修复渲染层 — 去掉 is_final 过滤

**Files:**

- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`
- Modify: `src/renderer/src/views/ChatroomPanel.vue`

- [ ] **Step 1: 重写 ChatMessageAssistant.vue 的 block 计算逻辑**

删除 `finalBlocks` 和 `intermediateBlocks` 两个 computed，改为一个直接展示所有 block 的 computed（thinking block 除外，thinking 在下一个 Task 处理，此处先过滤掉）：

```typescript
// 替换 finalBlocks + intermediateBlocks，改为：
const visibleBlocks = computed<{ block: AssistantMessageBlock; originalIdx: number }[]>(() => {
  if (props.isStreaming) return [];
  return parsedBlocks.value
    .filter((b) => b.type !== "thinking")
    .map((block) => ({ block, originalIdx: parsedBlocks.value.indexOf(block) }));
});
```

同时删除 `intermediateBlocks` 引用，将模板里所有 `finalBlocks` 替换为 `visibleBlocks`。

- [ ] **Step 2: 删除"查看思考链"按钮（暂时）**

删除 ChatMessageAssistant.vue 模板中的：

```html
<button
  v-if="!isStreaming && intermediateBlocks.length > 0"
  class="rounded p-1 text-muted-foreground hover:text-foreground"
  title="查看思考链"
  @click="message && emit('show-thought-chain', message.id)"
>
  <Icon icon="lucide:list-tree" class="h-3.5 w-3.5" />
</button>
```

（Task 3 会在 thinking block 集成后重新加回来）

- [ ] **Step 3: 修复 ChatroomPanel.vue 中的 is_final 过滤**

`src/renderer/src/views/ChatroomPanel.vue` 第 83-102 行 `thoughtChainBlocks` computed，删掉 `is_final` 过滤：

```typescript
const thoughtChainBlocks = computed<import("@shared/types/agent").AssistantMessageBlock[] | null>(
  () => {
    if (showStreamingThought.value) {
      return chatStore.streamingBlocks;
    }
    if (selectedThoughtMessageId.value) {
      const msg = chatStore.messages.find((m) => m.id === selectedThoughtMessageId.value);
      if (!msg || msg.role !== "assistant") return null;
      try {
        const blocks = JSON.parse(
          msg.content,
        ) as import("@shared/types/agent").AssistantMessageBlock[];
        return blocks; // 删掉 .filter((b) => !b.is_final)
      } catch {
        return null;
      }
    }
    return null;
  },
);
```

- [ ] **Step 4: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无 error

- [ ] **Step 5: Lint**

```bash
pnpm run lint
```

Expected: 无 error

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue src/renderer/src/views/ChatroomPanel.vue
git commit -m "feat: remove is_final filter, show all content blocks directly"
```

---

## Task 3: thinking block 渲染

**Files:**

- Modify: `src/renderer/src/components/chat/ChatMessageAssistant.vue`
- Modify: `src/renderer/src/components/chat/ThoughtChainPanel.vue`

- [ ] **Step 1: ChatMessageAssistant.vue — 区分 thinking block 和可见 block**

将 Task 2 里的 `visibleBlocks` 改为包含 thinking block（只排除 thinking，但 thinking 单独另一个 computed）：

```typescript
const visibleBlocks = computed<{ block: AssistantMessageBlock; originalIdx: number }[]>(() => {
  if (props.isStreaming) return [];
  return parsedBlocks.value
    .filter((b) => b.type !== "thinking")
    .map((block) => ({ block, originalIdx: parsedBlocks.value.indexOf(block) }));
});

const thinkingBlocks = computed<AssistantMessageBlock[]>(() => {
  if (props.isStreaming) return [];
  return parsedBlocks.value.filter((b) => b.type === "thinking");
});
```

- [ ] **Step 2: ChatMessageAssistant.vue — 模板加 thinking block 折叠展示**

在 `<!-- Content blocks -->` 区域内，`<template v-else>` 的最前面加 thinking block 渲染（在 `visibleBlocks` 循环之前）：

```html
<!-- Thinking blocks (折叠) -->
<details
  v-for="(tb, idx) in thinkingBlocks"
  :key="`thinking-${idx}`"
  class="mb-2 rounded-md border border-violet-500/20 bg-violet-500/5"
>
  <summary
    class="cursor-pointer px-3 py-1.5 text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1.5"
  >
    <Icon icon="lucide:brain" class="h-3 w-3" />
    思考过程
  </summary>
  <div class="whitespace-pre-wrap px-3 pb-2 pt-1 text-xs text-muted-foreground leading-relaxed">
    {{ tb.thinking }}
  </div>
</details>
```

- [ ] **Step 3: ChatMessageAssistant.vue — 恢复"查看思考链"按钮（有 thinking block 时显示）**

在 Action bar 里加回按钮，条件改为 `thinkingBlocks.length > 0`：

```html
<button
  v-if="!isStreaming && thinkingBlocks.length > 0"
  class="rounded p-1 text-muted-foreground hover:text-foreground"
  title="查看思考链"
  @click="message && emit('show-thought-chain', message.id)"
>
  <Icon icon="lucide:list-tree" class="h-3.5 w-3.5" />
</button>
```

- [ ] **Step 4: ThoughtChainPanel.vue — 增加 thinking block 渲染**

在模板 `<template v-for="(block, idx) in blocks">` 循环里，在 `<!-- Content step -->` 之前加：

```html
<!-- Thinking step -->
<details
  v-if="block.type === 'thinking'"
  class="rounded-md border border-violet-500/20 bg-violet-500/5"
>
  <summary
    class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-violet-400 hover:text-violet-300"
  >
    <span class="min-w-[20px] text-center">{{ idx + 1 }}</span>
    <Icon icon="lucide:brain" class="h-3 w-3 shrink-0" />
    <span>思考过程</span>
    <span v-if="block.status === 'loading'" class="ml-1 text-[10px] text-violet-400/60"
      >思考中...</span
    >
  </summary>
  <div class="whitespace-pre-wrap px-3 pb-2 pt-1 text-xs text-muted-foreground leading-relaxed">
    {{ block.thinking }}
  </div>
</details>
```

- [ ] **Step 5: 类型检查 + Lint**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: 无 error

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/chat/ChatMessageAssistant.vue src/renderer/src/components/chat/ThoughtChainPanel.vue
git commit -m "feat: render thinking blocks as collapsible sections in chat and thought chain panel"
```

---

## Task 4: enableThinking 配置 — 类型和 LLM 层

**Files:**

- Modify: `src/shared/types/agent.d.ts`
- Modify: `src/main/llm/core/types.ts`
- Modify: `src/main/llm/providers/anthropic/types.ts`
- Modify: `src/main/llm/providers/anthropic/requestBuilder.ts`

- [ ] **Step 1: AgentConfig 加 enableThinking 字段**

`src/shared/types/agent.d.ts` 的 `AgentConfig` 接口，在 `disabledSkills` 之后加：

```typescript
export interface AgentConfig {
  capabilityRequirements?: string[];
  systemPrompt?: string;
  temperature?: number;
  contextLength?: number;
  maxTokens?: number;
  disabledTools?: string[];
  subagentEnabled?: boolean;
  mcpTools?: string[];
  skills?: string[];
  disabledSkills?: string[];
  /** 启用 Anthropic extended thinking 模式 */
  enableThinking?: boolean;
}
```

- [ ] **Step 2: ChatOptions 加 thinkingBudget**

`src/main/llm/core/types.ts` 的 `ChatOptions` 接口，加一个可选字段：

```typescript
export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** 传入时向 Anthropic API 发送 extended thinking 参数，值为 budget_tokens */
  thinkingBudget?: number;
}
```

- [ ] **Step 3: AnthropicRequestBody 加 thinking 字段**

`src/main/llm/providers/anthropic/types.ts` 的 `AnthropicRequestBody` 接口，加：

```typescript
export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  stream: boolean;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  cache_control?: { type: string; ttl?: string };
  /** Extended thinking 配置，type 为 "enabled" 时需提供 budget_tokens */
  thinking?: { type: "enabled"; budget_tokens: number };
}
```

- [ ] **Step 4: requestBuilder.ts 根据 thinkingBudget 构建 thinking 参数**

`src/main/llm/providers/anthropic/requestBuilder.ts` 的 `buildAnthropicRequest` 函数，在 return 语句前加逻辑：

```typescript
export function buildAnthropicRequest(
  messages: CoreMessage[],
  tools: Record<string, Tool>,
  options: ChatOptions,
): AnthropicRequestBody {
  // ... 现有逻辑不变 ...

  const body: AnthropicRequestBody = {
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
    system,
    messages: anthropicMessages,
    tools: anthropicTools,
    temperature: options.temperature,
    cache_control: { type: "ephemeral" },
  };

  if (options.thinkingBudget) {
    body.thinking = { type: "enabled", budget_tokens: options.thinkingBudget };
    // thinking 模式要求 temperature 为 1，不传或传 1 均可
    body.temperature = undefined;
  }

  return body;
}
```

注意：原来的 `return { ... }` 字面量改为先赋值给 `body` 再 return，以便追加 `thinking` 字段。

- [ ] **Step 5: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无 error

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/agent.d.ts src/main/llm/core/types.ts src/main/llm/providers/anthropic/types.ts src/main/llm/providers/anthropic/requestBuilder.ts
git commit -m "feat: add enableThinking to AgentConfig and thinkingBudget to LLM request builder"
```

---

## Task 5: agentChatPresenter 读取 enableThinking 并传递

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [ ] **Step 1: 在 chat() 中读取 enableThinking 并传给 collectStreamResult**

`agentChatPresenter.ts` 的 `chat()` 方法，找到调用 `collectStreamResult` 的地方（约第 381 行），在 `options` 对象中加入 `thinkingBudget`：

```typescript
const { textContent, toolCalls } = await this.collectStreamResult(
  client,
  messages,
  tools,
  {
    model: groupName,
    maxTokens: config?.maxTokens ?? agent?.config?.maxTokens ?? undefined,
    thinkingBudget: (config?.enableThinking ?? agent?.config?.enableThinking) ? 10000 : undefined,
  },
  sessionId,
  assistantMessageId,
  blocks,
  abortController.signal,
);
```

注意：`config` 是 `SessionConfig`（会话级覆盖），`agent?.config` 是 `AgentConfig`（Agent 默认），`SessionConfig` 没有 `enableThinking` 字段，所以只读 `agent?.config?.enableThinking`。

实际代码改为：

```typescript
thinkingBudget: agent?.config?.enableThinking ? 10000 : undefined,
```

- [ ] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

Expected: 无 error

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat: pass thinkingBudget from agent config to LLM client"
```

---

## Task 6: AgentEditDialog 加 enableThinking 开关

**Files:**

- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [ ] **Step 1: 加 enableThinking 响应式状态**

`<script setup>` 顶部的 ref 声明区，在 `subagentEnabled` 之后加：

```typescript
const enableThinking = ref(false);
```

- [ ] **Step 2: watch 里加 enableThinking 的加载和重置**

在 `watch(() => props.open, ...)` 的两个分支里：

Edit 模式（`if (props.agentId)` 分支），在 `subagentEnabled.value = cfg?.subagentEnabled ?? false` 之后加：

```typescript
enableThinking.value = cfg?.enableThinking ?? false;
```

Create 模式（`else` 分支），在 `subagentEnabled.value = false` 之后加：

```typescript
enableThinking.value = false;
```

- [ ] **Step 3: onSave 里加 enableThinking**

`onSave` 函数中 `const config: AgentConfig = { ... }` 对象，在 `subagentEnabled` 之后加：

```typescript
const config: AgentConfig = {
  capabilityRequirements: capabilities.value,
  temperature: temperature.value,
  contextLength: contextLength.value,
  maxTokens: maxTokens.value,
  disabledTools: disabledTools.value.length > 0 ? disabledTools.value : undefined,
  mcpTools: mcpTools.value.length > 0 ? mcpTools.value : undefined,
  disabledSkills: disabledSkills.value.length > 0 ? disabledSkills.value : undefined,
  subagentEnabled: subagentEnabled.value,
  enableThinking: enableThinking.value || undefined,
};
```

（`false` 时传 `undefined` 避免存储无意义的 false）

- [ ] **Step 4: 模板加开关 UI**

在 `<!-- Toggles -->` 区域，"子 Agent 调度" 开关之后、"启用" 开关之前，加：

```html
<div v-if="!isProtected" class="flex items-center justify-between">
  <div class="flex flex-col">
    <span class="text-sm text-foreground">思考模式</span>
    <span class="text-xs text-muted-foreground">启用后模型将输出思考链（需模型支持）</span>
  </div>
  <button
    :class="[
      'relative h-5 w-9 rounded-full transition-colors',
      enableThinking ? 'bg-violet-500' : 'bg-muted-foreground/30',
    ]"
    @click="enableThinking = !enableThinking"
  >
    <span
      :class="[
        'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
        enableThinking ? 'translate-x-4' : 'translate-x-0.5',
      ]"
    />
  </button>
</div>
```

- [ ] **Step 5: 类型检查 + Lint**

```bash
pnpm run typecheck && pnpm run lint
```

Expected: 无 error

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue
git commit -m "feat: add enableThinking toggle to AgentEditDialog"
```

---

## Task 7: 最终 lint + format

- [ ] **Step 1: Format**

```bash
pnpm run format
```

- [ ] **Step 2: Lint**

```bash
pnpm run lint
```

Expected: 无 error

- [ ] **Step 3: Typecheck**

```bash
pnpm run typecheck
```

Expected: 无 error

- [ ] **Step 4: Commit（如有格式变更）**

```bash
git add -A
git commit -m "style: format after thinking mode feature"
```
