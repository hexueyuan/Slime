# Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement manual Agent Loop with tool calling, streaming output, and user question support.

**Architecture:** Replace AI SDK's `maxSteps` auto-loop with manual while loop. Collect tool-call events from stream, execute tools manually via ToolPresenter, build messages for next iteration. New `ask_user` tool pauses loop via Promise, resumes when user answers.

**Tech Stack:** AI SDK v6 (streamText), Zod, Vue 3, Pinia

---

## File Structure

| Action  | File                                               | Responsibility                    |
| ------- | -------------------------------------------------- | --------------------------------- |
| Modify  | `src/shared/events.ts`                             | Add QUESTION event constant       |
| Modify  | `src/shared/types/chat.d.ts`                       | Add PendingQuestion type          |
| Modify  | `src/shared/types/presenters/agent.presenter.d.ts` | Add answerQuestion method         |
| Modify  | `src/main/presenter/toolPresenter.ts`              | Add ask_user tool                 |
| Rewrite | `src/main/presenter/agentPresenter.ts`             | Manual while loop, tool execution |
| Modify  | `src/renderer/src/stores/chat.ts`                  | Add pendingQuestion state         |
| Modify  | `src/renderer/src/stores/messageIpc.ts`            | Add QUESTION event listener       |
| Modify  | `src/renderer/src/components/chat/ChatInput.vue`   | Add question UI                   |
| Modify  | `test/main/toolPresenter.test.ts`                  | Add ask_user tool test            |
| Create  | `test/main/agentLoop.test.ts`                      | Agent loop integration tests      |

---

### Task 1: Add QUESTION Event Constant

**Files:**

- Modify: `src/shared/events.ts:15-19`

- [ ] **Step 1: Add QUESTION to STREAM_EVENTS**

```typescript
// src/shared/events.ts
export const STREAM_EVENTS = {
  RESPONSE: "stream:response",
  END: "stream:end",
  ERROR: "stream:error",
  QUESTION: "stream:question",
} as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/events.ts
git commit -m "feat(events): add QUESTION event for agent pause"
```

---

### Task 2: Add PendingQuestion Type

**Files:**

- Modify: `src/shared/types/chat.d.ts`

- [ ] **Step 1: Add PendingQuestion interface**

```typescript
// src/shared/types/chat.d.ts - append at end
export interface PendingQuestion {
  messageId: string;
  toolCallId: string;
  question: string;
  options?: string[];
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/chat.d.ts
git commit -m "feat(types): add PendingQuestion interface"
```

---

### Task 3: Add answerQuestion to IAgentPresenter

**Files:**

- Modify: `src/shared/types/presenters/agent.presenter.d.ts`

- [ ] **Step 1: Add answerQuestion method to interface**

```typescript
// src/shared/types/presenters/agent.presenter.d.ts
import type { UserMessageContent } from "../chat";

export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
  answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void>;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: Error in agentPresenter.ts (missing method) - expected at this stage

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/presenters/agent.presenter.d.ts
git commit -m "feat(types): add answerQuestion to IAgentPresenter"
```

---

### Task 4: Add ask_user Tool to ToolPresenter

**Files:**

- Modify: `src/main/presenter/toolPresenter.ts`
- Test: `test/main/toolPresenter.test.ts`

- [ ] **Step 1: Write test for ask_user tool existence**

```typescript
// test/main/toolPresenter.test.ts - add to existing describe block
it("should include ask_user tool in toolset", () => {
  const tools = tp.getToolSet("s1");
  expect(Object.keys(tools)).toContain("ask_user");
  expect(Object.keys(tools)).toHaveLength(9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- test/main/toolPresenter.test.ts`
Expected: FAIL - ask_user not in toolset, length is 8 not 9

- [ ] **Step 3: Add ask_user tool to getToolSet**

```typescript
// src/main/presenter/toolPresenter.ts - add to getToolSet return object after step_update
ask_user: createTool({
  description:
    "Ask the user a question and wait for their response. Use when you need clarification or user input before proceeding.",
  parameters: z.object({
    question: z.string().describe("The question to ask the user"),
    options: z.array(z.string()).optional().describe("Optional list of choices for the user"),
  }),
  execute: async () => {
    throw new Error("ask_user should be handled by AgentPresenter");
  },
}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- test/main/toolPresenter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/toolPresenter.ts test/main/toolPresenter.test.ts
git commit -m "feat(tools): add ask_user tool for agent pause"
```

---

### Task 5: Rewrite AgentPresenter with Manual Loop

**Files:**

- Rewrite: `src/main/presenter/agentPresenter.ts`

- [ ] **Step 1: Rewrite AgentPresenter with manual while loop**

```typescript
// src/main/presenter/agentPresenter.ts
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { IAgentPresenter } from "@shared/types/presenters";
import type {
  UserMessageContent,
  AssistantMessageBlock,
  ChatMessageRecord,
} from "@shared/types/chat";
import { STREAM_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger } from "@/utils";
import type { SessionPresenter } from "./sessionPresenter";
import type { ConfigPresenter } from "./configPresenter";
import type { ToolPresenter } from "./toolPresenter";
import { EVOLAB_SYSTEM_PROMPT } from "./systemPrompt";

interface ToolCall {
  id: string;
  name: string;
  args: string;
}

interface PendingQuestionState {
  toolCallId: string;
  resolve: (answer: string) => void;
}

export class AgentPresenter implements IAgentPresenter {
  private abortControllers = new Map<string, AbortController>();
  private pendingQuestions = new Map<string, PendingQuestionState>();

  constructor(
    private sessionPresenter: SessionPresenter,
    private configPresenter: ConfigPresenter,
    private toolPresenter: ToolPresenter,
  ) {}

  private async getConfig() {
    return {
      provider:
        ((await this.configPresenter.get("ai.provider")) as string) ||
        process.env.SLIME_AI_PROVIDER ||
        "anthropic",
      apiKey:
        ((await this.configPresenter.get("ai.apiKey")) as string) ||
        process.env.SLIME_AI_API_KEY ||
        "",
      model:
        ((await this.configPresenter.get("ai.model")) as string) ||
        process.env.SLIME_AI_MODEL ||
        "claude-sonnet-4-20250514",
      baseUrl:
        ((await this.configPresenter.get("ai.baseUrl")) as string) ||
        process.env.SLIME_AI_BASE_URL ||
        undefined,
    };
  }

  private createModel(config: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }) {
    if (config.provider === "anthropic") {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
      return provider(config.model);
    }
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    return provider(config.model);
  }

  private async buildMessages(sessionId: string): Promise<
    Array<{
      role: "user" | "assistant" | "tool";
      content: string;
      tool_calls?: any[];
      tool_call_id?: string;
    }>
  > {
    const records = await this.sessionPresenter.getMessages(sessionId);
    const messages: Array<{
      role: "user" | "assistant" | "tool";
      content: string;
      tool_calls?: any[];
      tool_call_id?: string;
    }> = [];
    for (const record of records) {
      if (record.role === "user") {
        const parsed = JSON.parse(record.content) as UserMessageContent;
        messages.push({ role: "user", content: parsed.text });
      } else {
        const blocks = JSON.parse(record.content) as AssistantMessageBlock[];
        const text = blocks
          .filter((b) => b.type === "content")
          .map((b) => b.content || "")
          .join("");
        if (text) messages.push({ role: "assistant", content: text });
      }
    }
    return messages;
  }

  private pushToRenderer(
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
  ): void {
    eventBus.sendToRenderer(STREAM_EVENTS.RESPONSE, sessionId, messageId, [...blocks]);
  }

  private updateToolBlockStatus(
    blocks: AssistantMessageBlock[],
    toolCallId: string,
    status: AssistantMessageBlock["status"],
  ): void {
    const block = blocks.find((b) => b.type === "tool_call" && b.id === toolCallId);
    if (block) block.status = status;
  }

  private updateToolBlockResult(
    blocks: AssistantMessageBlock[],
    toolCallId: string,
    status: AssistantMessageBlock["status"],
    result: unknown,
  ): void {
    const block = blocks.find((b) => b.type === "tool_call" && b.id === toolCallId);
    if (block && block.tool_call) {
      block.status = status;
      block.tool_call.response = typeof result === "string" ? result : JSON.stringify(result);
    }
  }

  private async collectStream(
    stream: AsyncIterable<any>,
    sessionId: string,
    messageId: string,
    blocks: AssistantMessageBlock[],
    abortSignal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
    let textContent = "";
    const toolCalls: ToolCall[] = [];
    let currentContentBlock: AssistantMessageBlock | null = null;
    let currentReasoningBlock: AssistantMessageBlock | null = null;

    for await (const event of stream) {
      if (abortSignal.aborted) break;
      const e = event as any;

      if (e.type === "text-delta") {
        textContent += e.textDelta;
        if (!currentContentBlock) {
          currentContentBlock = {
            type: "content",
            content: "",
            status: "loading",
            timestamp: Date.now(),
          };
          blocks.push(currentContentBlock);
        }
        currentContentBlock.content += e.textDelta;
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "reasoning" || e.type === "reasoning-delta") {
        const delta = e.textDelta || e.text || "";
        if (!currentReasoningBlock) {
          currentReasoningBlock = {
            type: "reasoning_content",
            content: "",
            status: "loading",
            timestamp: Date.now(),
            reasoning_time: { start: Date.now(), end: 0 },
          };
          blocks.unshift(currentReasoningBlock);
        }
        currentReasoningBlock.content += delta;
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "tool-call") {
        toolCalls.push({
          id: e.toolCallId,
          name: e.toolName,
          args: JSON.stringify(e.args),
        });
        blocks.push({
          type: "tool_call",
          id: e.toolCallId,
          content: "",
          status: "loading",
          timestamp: Date.now(),
          tool_call: {
            name: e.toolName,
            params: JSON.stringify(e.args),
          },
        });
        this.pushToRenderer(sessionId, messageId, blocks);
      } else if (e.type === "finish" || e.type === "step-finish") {
        if (currentContentBlock && currentContentBlock.status === "loading") {
          currentContentBlock.status = "success";
        }
        if (currentReasoningBlock) {
          if (currentReasoningBlock.status === "loading") {
            currentReasoningBlock.status = "success";
          }
          if (currentReasoningBlock.reasoning_time) {
            currentReasoningBlock.reasoning_time.end = Date.now();
          }
        }
        currentContentBlock = null;
        currentReasoningBlock = null;
      }
    }

    return { textContent, toolCalls };
  }

  private async handleAskUser(
    sessionId: string,
    toolCallId: string,
    args: { question: string; options?: string[] },
    messageId: string,
  ): Promise<string> {
    eventBus.sendToRenderer(STREAM_EVENTS.QUESTION, sessionId, {
      messageId,
      toolCallId,
      question: args.question,
      options: args.options,
    });

    const answer = await new Promise<string>((resolve) => {
      this.pendingQuestions.set(sessionId, { toolCallId, resolve });
    });

    return answer;
  }

  private async executeTool(
    sessionId: string,
    toolCall: ToolCall,
    blocks: AssistantMessageBlock[],
    messageId: string,
  ): Promise<string> {
    const { id, name, args } = toolCall;
    const parsedArgs = JSON.parse(args);

    this.updateToolBlockStatus(blocks, id, "loading");
    this.pushToRenderer(sessionId, messageId, blocks);

    try {
      let result: unknown;

      if (name === "ask_user") {
        result = await this.handleAskUser(sessionId, id, parsedArgs, messageId);
      } else {
        result = await this.toolPresenter.callTool(sessionId, name, parsedArgs);
      }

      this.updateToolBlockResult(blocks, id, "success", result);
      this.pushToRenderer(sessionId, messageId, blocks);

      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateToolBlockResult(blocks, id, "error", `Error: ${errorMsg}`);
      this.pushToRenderer(sessionId, messageId, blocks);
      return `Error: ${errorMsg}`;
    }
  }

  async chat(sessionId: string, content: UserMessageContent): Promise<void> {
    const MAX_STEPS = 128;
    let stepCount = 0;

    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const config = await this.getConfig();
    if (!config.apiKey) {
      this.abortControllers.delete(sessionId);
      eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, "API key not configured");
      return;
    }

    const userMessage: ChatMessageRecord = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: JSON.stringify(content),
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.sessionPresenter.saveMessage(userMessage);

    const messages = await this.buildMessages(sessionId);
    const model = this.createModel(config);
    const tools = this.toolPresenter.getToolSet(sessionId);

    const blocks: AssistantMessageBlock[] = [];
    const assistantMessageId = crypto.randomUUID();

    try {
      while (stepCount < MAX_STEPS) {
        if (abortController.signal.aborted) break;
        stepCount++;

        const result = streamText({
          model,
          system: EVOLAB_SYSTEM_PROMPT,
          messages: messages as any,
          tools: tools as any,
          abortSignal: abortController.signal,
        });

        const { textContent, toolCalls } = await this.collectStream(
          result.fullStream,
          sessionId,
          assistantMessageId,
          blocks,
          abortController.signal,
        );

        if (toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: "assistant",
          content: textContent,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: tc.args },
          })),
        });

        for (const tc of toolCalls) {
          if (abortController.signal.aborted) break;

          const toolResult = await this.executeTool(sessionId, tc, blocks, assistantMessageId);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
      }

      for (const block of blocks) {
        if (block.status === "loading") block.status = "success";
      }

      const assistantMessage: ChatMessageRecord = {
        id: assistantMessageId,
        sessionId,
        role: "assistant",
        content: JSON.stringify(blocks),
        status: "sent",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.sessionPresenter.saveMessage(assistantMessage);
      eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
    } catch (err) {
      if (abortController.signal.aborted) {
        for (const block of blocks) block.status = "cancel";
        eventBus.sendToRenderer(STREAM_EVENTS.END, sessionId, assistantMessageId);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error("AgentPresenter chat error", { sessionId, error: errorMsg });
        eventBus.sendToRenderer(STREAM_EVENTS.ERROR, sessionId, errorMsg);
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  async stopGeneration(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
      logger.info("Generation stopped", { sessionId });
    }

    const pending = this.pendingQuestions.get(sessionId);
    if (pending) {
      pending.resolve("[User cancelled]");
      this.pendingQuestions.delete(sessionId);
    }
  }

  async answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void> {
    const pending = this.pendingQuestions.get(sessionId);
    if (pending?.toolCallId === toolCallId) {
      pending.resolve(answer);
      this.pendingQuestions.delete(sessionId);
    }
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/presenter/agentPresenter.ts
git commit -m "feat(agent): rewrite with manual while loop for tool calling"
```

---

### Task 6: Add pendingQuestion State to Chat Store

**Files:**

- Modify: `src/renderer/src/stores/chat.ts`

- [ ] **Step 1: Add pendingQuestion state and methods**

```typescript
// src/renderer/src/stores/chat.ts - add imports
import type {
  ChatMessageRecord,
  AssistantMessageBlock,
  UserMessageContent,
  PendingQuestion,
} from "@shared/types/chat";

// Add after streamError ref (around line 17)
const pendingQuestion = ref<PendingQuestion | null>(null);

// Add methods after clearStreamError
function setPendingQuestion(q: PendingQuestion | null): void {
  pendingQuestion.value = q;
}

function clearPendingQuestion(): void {
  pendingQuestion.value = null;
}

async function answerQuestion(sessionId: string, answer: string): Promise<void> {
  if (!pendingQuestion.value) return;
  const { toolCallId } = pendingQuestion.value;
  clearPendingQuestion();
  await agentPresenter.answerQuestion(sessionId, toolCallId, answer);
}

// Add to return object
return {
  messageIds,
  messageCache,
  isStreaming,
  streamingBlocks,
  currentStreamMessageId,
  currentStreamSessionId,
  streamError,
  pendingQuestion,
  getMessage,
  loadMessages,
  addOptimisticUserMessage,
  setStreamingState,
  clearStreamingState,
  setStreamError,
  clearStreamError,
  setPendingQuestion,
  clearPendingQuestion,
  answerQuestion,
  sendMessage,
  stopGeneration,
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/chat.ts
git commit -m "feat(store): add pendingQuestion state for agent pause"
```

---

### Task 7: Add QUESTION Event Listener to messageIpc

**Files:**

- Modify: `src/renderer/src/stores/messageIpc.ts`

- [ ] **Step 1: Add QUESTION event listener**

```typescript
// src/renderer/src/stores/messageIpc.ts - add import
import type { PendingQuestion } from "@shared/types/chat";

// Add after unsubError listener (around line 36)
const unsubQuestion = window.electron.ipcRenderer.on(
  STREAM_EVENTS.QUESTION,
  (_sessionId: unknown, payload: unknown) => {
    store.setPendingQuestion(payload as PendingQuestion);
  },
);
unsubs.push(unsubQuestion);
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/messageIpc.ts
git commit -m "feat(ipc): add QUESTION event listener"
```

---

### Task 8: Add Question UI to ChatInput

**Files:**

- Modify: `src/renderer/src/components/chat/ChatInput.vue`

- [ ] **Step 1: Add pendingQuestion prop and question UI**

```vue
<!-- src/renderer/src/components/chat/ChatInput.vue -->
<template>
  <div class="absolute bottom-0 left-0 right-0 z-10 px-6 pb-3">
    <!-- 错误提示 -->
    <div
      v-if="error"
      class="mb-2 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span>{{ error }}</span>
      <button class="ml-2 shrink-0 underline" @click="$emit('dismiss-error')">关闭</button>
    </div>

    <!-- 问答卡片 -->
    <div
      v-if="pendingQuestion"
      class="mb-2 overflow-hidden rounded-xl border border-primary/30 bg-primary/5 shadow-sm backdrop-blur-lg"
    >
      <div class="px-4 py-3">
        <p class="mb-3 text-sm font-medium text-foreground">{{ pendingQuestion.question }}</p>
        <!-- 选项按钮 -->
        <div v-if="pendingQuestion.options?.length" class="mb-3 flex flex-wrap gap-2">
          <button
            v-for="opt in pendingQuestion.options"
            :key="opt"
            class="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            @click="submitAnswer(opt)"
          >
            {{ opt }}
          </button>
        </div>
        <!-- 自定义输入 -->
        <div class="flex gap-2">
          <input
            v-model="questionAnswer"
            class="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            placeholder="输入回答..."
            @keydown.enter="submitAnswer(questionAnswer)"
          />
          <button
            class="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            :disabled="!questionAnswer.trim()"
            @click="submitAnswer(questionAnswer)"
          >
            回答
          </button>
        </div>
      </div>
    </div>

    <!-- 输入框容器 -->
    <div
      class="overflow-hidden rounded-xl border border-border bg-card/30 shadow-sm backdrop-blur-lg"
    >
      <!-- 附件列表 -->
      <div v-if="files?.length" class="flex flex-wrap gap-1.5 px-4 pt-3">
        <ChatAttachmentItem
          v-for="file in files"
          :key="file.id"
          :file="file"
          @remove="$emit('remove-file', $event)"
        />
      </div>
      <!-- 编辑区域 -->
      <div class="px-4 pt-4 pb-2">
        <textarea
          ref="textareaRef"
          v-model="inputText"
          class="w-full resize-none bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none overflow-y-auto"
          :style="{ minHeight: '60px', maxHeight: '240px' }"
          placeholder="输入消息..."
          :disabled="!!pendingQuestion"
          @keydown="onKeydown"
          @input="autoResize"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
      </div>
      <!-- 工具栏 -->
      <div class="flex items-center justify-between px-3 pb-2">
        <!-- 左侧：附件按钮 -->
        <button
          class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          title="附件"
          :disabled="!!pendingQuestion"
          @click="fileInputRef?.click()"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <!-- 右侧：发送/停止按钮 -->
        <button
          v-if="isStreaming"
          data-testid="stop-btn"
          class="flex h-7 w-7 items-center justify-center rounded-full border border-destructive text-destructive hover:bg-destructive/10"
          title="停止生成"
          @click="$emit('stop')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </button>
        <button
          v-else
          data-testid="send-btn"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
          :disabled="!inputText.trim() || !!pendingQuestion"
          :class="{ 'opacity-40': !inputText.trim() || !!pendingQuestion }"
          title="发送"
          @click="submit"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
    <!-- 隐藏的文件选择器 -->
    <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from "vue";
import ChatAttachmentItem from "./ChatAttachmentItem.vue";
import type { MessageFile, PendingQuestion } from "@shared/types/chat";

defineProps<{
  isStreaming: boolean;
  files?: MessageFile[];
  error?: string | null;
  pendingQuestion?: PendingQuestion | null;
}>();

const emit = defineEmits<{
  submit: [text: string];
  stop: [];
  "add-files": [files: File[]];
  "remove-file": [id: string];
  "dismiss-error": [];
  "answer-question": [answer: string];
}>();

const inputText = ref("");
const questionAnswer = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    emit("add-files", Array.from(input.files));
    input.value = "";
  }
}
const isComposing = ref(false);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !isComposing.value) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  const text = inputText.value.trim();
  if (!text) return;
  emit("submit", text);
  inputText.value = "";
  nextTick(() => autoResize());
}

function submitAnswer(answer: string) {
  const text = answer.trim();
  if (!text) return;
  emit("answer-question", text);
  questionAnswer.value = "";
}

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 240) + "px";
}
</script>
```

- [ ] **Step 2: Update ChatPanel to pass pendingQuestion and handle answer**

```typescript
// src/renderer/src/components/chat/ChatPanel.vue - update ChatInput usage
<ChatInput
  :is-streaming="messageStore.isStreaming"
  :files="attachedFiles"
  :error="messageStore.streamError"
  :pending-question="messageStore.pendingQuestion"
  @submit="onSubmit"
  @stop="onStop"
  @add-files="onAddFiles"
  @remove-file="onRemoveFile"
  @dismiss-error="messageStore.clearStreamError()"
  @answer-question="onAnswerQuestion"
/>

// Add handler function
async function onAnswerQuestion(answer: string) {
  if (!sessionStore.activeSessionId) return;
  await messageStore.answerQuestion(sessionStore.activeSessionId, answer);
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/chat/ChatInput.vue src/renderer/src/components/chat/ChatPanel.vue
git commit -m "feat(ui): add question card for agent pause interaction"
```

---

### Task 9: Format and Lint

**Files:**

- All modified files

- [ ] **Step 1: Run formatter**

Run: `pnpm run format`
Expected: Files formatted

- [ ] **Step 2: Run linter**

Run: `pnpm run lint`
Expected: No errors (or only warnings)

- [ ] **Step 3: Commit if any changes**

```bash
git add -A
git commit -m "style: format and lint"
```

---

### Task 10: Manual Integration Test

- [ ] **Step 1: Start dev server**

Run: `pnpm run dev`
Expected: App starts without errors

- [ ] **Step 2: Test basic chat**

1. Type "Hello" and send
2. Verify AI responds with streaming text

- [ ] **Step 3: Test tool calling**

1. Type "请读取 package.json 文件"
2. Verify tool_call block appears with "read" tool
3. Verify tool executes and AI continues with file content

- [ ] **Step 4: Test multi-tool loop**

1. Type "请创建一个 test.txt 文件，内容为 hello，然后读取它确认内容"
2. Verify write tool executes
3. Verify read tool executes after write
4. Verify AI confirms the content

- [ ] **Step 5: Test ask_user pause**

1. In system prompt or via another tool, trigger ask_user
2. Verify question card appears
3. Answer the question
4. Verify AI continues

- [ ] **Step 6: Test stop generation**

1. Start a long operation
2. Click stop button
3. Verify generation stops cleanly

---

### Task 11: Final Commit

- [ ] **Step 1: Verify all tests pass**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 2: Verify typecheck**

Run: `pnpm run typecheck`
Expected: No errors

- [ ] **Step 3: Create summary commit if needed**

```bash
git log --oneline -10
```

Review commits are all in place.
