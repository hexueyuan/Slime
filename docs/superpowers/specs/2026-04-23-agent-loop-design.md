# Agent Loop 设计文档

## 概述

重构 Slime 的 AgentPresenter，从依赖 AI SDK `maxSteps` 自动循环改为**手动 while 循环**，实现完整的 Agent Loop。解决当前工具不执行、循环不继续的问题，并新增 `ask_user` 工具支持暂停询问用户。

## 问题分析

当前实现使用 `streamText({ maxSteps: 128 })`，依赖 AI SDK 自动处理 tool calling 循环。但由于：

1. `createTool` helper 使用 `as any` 绑过类型检查
2. AI SDK v6 的 execute 函数签名可能不兼容

导致工具不被执行，循环无法继续。

**解决方案**：抛弃 maxSteps，改为手动 while loop，完全自己控制 tool 执行和消息组装。

## 设计目标

- Agent Loop：手动 while 循环，最大 128 轮
- 工具调用：手动收集 tool calls，手动执行，手动回填结果
- 流式输出：保留 streamText fullStream 事件流
- 流式渲染：每次 text-delta/tool-call 实时推送到渲染进程
- 暂停询问：新增 `ask_user` 工具，暂停等待用户回答后继续

## 详细设计

### 1. AgentPresenter 改造

#### 1.1 新增状态

```typescript
class AgentPresenter {
  private abortControllers = new Map<string, AbortController>();

  // 新增：暂停等待用户回答
  private pendingQuestions = new Map<
    string,
    {
      toolCallId: string;
      resolve: (answer: string) => void;
    }
  >();
}
```

#### 1.2 chat() 方法重构

```typescript
async chat(sessionId: string, content: UserMessageContent): Promise<void> {
  const MAX_STEPS = 128
  let stepCount = 0

  // 构建初始 messages
  const messages = await this.buildMessages(sessionId)
  messages.push({ role: 'user', content: content.text })

  // 保存用户消息
  await this.saveUserMessage(sessionId, content)

  const blocks: AssistantMessageBlock[] = []
  const assistantMessageId = crypto.randomUUID()

  // Agent Loop
  while (stepCount < MAX_STEPS) {
    stepCount++

    // 1. 调用 LLM（单轮，不带 maxSteps）
    const result = streamText({
      model: this.createModel(config),
      system: EVOLAB_SYSTEM_PROMPT,
      messages,
      tools: this.getToolDefinitions(),  // 只返回 schema，不含 execute
      abortSignal: abortController.signal,
    })

    // 2. 收集流事件
    const { textContent, toolCalls } = await this.collectStream(
      result.fullStream,
      sessionId,
      assistantMessageId,
      blocks
    )

    // 3. 检查是否有 tool calls
    if (toolCalls.length === 0) {
      break  // AI 决定结束
    }

    // 4. 构建 assistant message（带 tool_calls）
    messages.push({
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args }
      }))
    })

    // 5. 执行每个 tool call
    for (const tc of toolCalls) {
      const result = await this.executeTool(sessionId, tc, blocks, assistantMessageId)

      // 6. 添加 tool result message
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof result === 'string' ? result : JSON.stringify(result)
      })
    }

    // 继续循环，让 AI 基于 tool 结果继续
  }

  // 保存并结束
  await this.finalizeMessage(sessionId, assistantMessageId, blocks)
}
```

#### 1.3 collectStream() 方法

收集流事件，实时推送到渲染进程，返回文本内容和 tool calls。

```typescript
private async collectStream(
  stream: AsyncIterable<StreamEvent>,
  sessionId: string,
  messageId: string,
  blocks: AssistantMessageBlock[]
): Promise<{ textContent: string; toolCalls: ToolCall[] }> {
  let textContent = ''
  const toolCalls: ToolCall[] = []
  let currentContentBlock: AssistantMessageBlock | null = null

  for await (const event of stream) {
    if (event.type === 'text-delta') {
      // 累积文本
      textContent += event.textDelta

      // 更新 content block
      if (!currentContentBlock) {
        currentContentBlock = {
          type: 'content',
          content: '',
          status: 'loading',
          timestamp: Date.now()
        }
        blocks.push(currentContentBlock)
      }
      currentContentBlock.content += event.textDelta

      // 实时推送
      this.pushToRenderer(sessionId, messageId, blocks)
    }

    else if (event.type === 'tool-call') {
      // 收集 tool call
      toolCalls.push({
        id: event.toolCallId,
        name: event.toolName,
        args: JSON.stringify(event.args)
      })

      // 添加 tool_call block
      blocks.push({
        type: 'tool_call',
        id: event.toolCallId,
        status: 'loading',
        timestamp: Date.now(),
        tool_call: {
          name: event.toolName,
          params: JSON.stringify(event.args)
        }
      })

      // 实时推送
      this.pushToRenderer(sessionId, messageId, blocks)
    }

    else if (event.type === 'finish') {
      // 标记当前 content block 完成
      if (currentContentBlock) {
        currentContentBlock.status = 'success'
      }
    }
  }

  return { textContent, toolCalls }
}
```

#### 1.4 executeTool() 方法

执行工具，特殊处理 `ask_user`。

```typescript
private async executeTool(
  sessionId: string,
  toolCall: ToolCall,
  blocks: AssistantMessageBlock[],
  messageId: string
): Promise<unknown> {
  const { id, name, args } = toolCall
  const parsedArgs = JSON.parse(args)

  // 更新 tool block 状态为执行中
  this.updateToolBlockStatus(blocks, id, 'loading')
  this.pushToRenderer(sessionId, messageId, blocks)

  try {
    let result: unknown

    if (name === 'ask_user') {
      // 暂停询问用户
      result = await this.handleAskUser(sessionId, id, parsedArgs, messageId)
    } else {
      // 执行普通工具
      result = await this.toolPresenter.callTool(sessionId, name, parsedArgs)
    }

    // 更新 tool block 为成功
    this.updateToolBlockResult(blocks, id, 'success', result)
    this.pushToRenderer(sessionId, messageId, blocks)

    return result
  } catch (err) {
    // 更新 tool block 为失败
    const errorMsg = err instanceof Error ? err.message : String(err)
    this.updateToolBlockResult(blocks, id, 'error', errorMsg)
    this.pushToRenderer(sessionId, messageId, blocks)

    return `Error: ${errorMsg}`
  }
}
```

#### 1.5 handleAskUser() 方法

暂停等待用户回答。

```typescript
private async handleAskUser(
  sessionId: string,
  toolCallId: string,
  args: { question: string; options?: string[] },
  messageId: string
): Promise<string> {
  // 1. 推送问题到渲染进程
  eventBus.sendToRenderer(STREAM_EVENTS.QUESTION, sessionId, {
    messageId,
    toolCallId,
    question: args.question,
    options: args.options
  })

  // 2. 暂停等待用户回答
  const answer = await new Promise<string>((resolve) => {
    this.pendingQuestions.set(sessionId, { toolCallId, resolve })
  })

  return answer
}

// 新增：用户回答接口
async answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void> {
  const pending = this.pendingQuestions.get(sessionId)
  if (pending?.toolCallId === toolCallId) {
    pending.resolve(answer)
    this.pendingQuestions.delete(sessionId)
  }
}
```

### 2. ToolPresenter 改造

#### 2.1 新增 ask_user 工具定义

```typescript
getToolSet(sessionId: string) {
  return {
    // ... 现有工具

    ask_user: createTool({
      description: "Ask the user a question and wait for their response. Use when you need clarification or user input.",
      parameters: z.object({
        question: z.string().describe("The question to ask the user"),
        options: z.array(z.string()).optional().describe("Optional list of choices")
      }),
      // execute 不在这里，由 AgentPresenter 特殊处理
      execute: async () => { throw new Error('ask_user should be handled by AgentPresenter') }
    })
  }
}
```

#### 2.2 streamText 传入完整 tool 定义

AI SDK 的 `streamText` 需要完整的 tool 定义（含 execute）才能识别 tool calls。保留现有 `getToolSet()` 传入，但**不依赖 SDK 自动执行**——手动收集 `tool-call` 事件后由 AgentPresenter 自己执行。

```typescript
// AgentPresenter.chat() 中
const result = streamText({
  model,
  system: EVOLAB_SYSTEM_PROMPT,
  messages,
  tools: this.toolPresenter.getToolSet(sessionId), // 完整 tool 定义
  // 不传 maxSteps，SDK 不会自动循环
  abortSignal: abortController.signal,
});

// SDK 返回 tool-call 事件后，AgentPresenter 手动调用 executeTool()
// 而不是依赖 SDK 内部调用 tool.execute()
```

### 3. 事件常量新增

```typescript
// src/shared/events.ts
export const STREAM_EVENTS = {
  RESPONSE: "stream:response",
  END: "stream:end",
  ERROR: "stream:error",
  QUESTION: "stream:question", // 新增：agent 向用户提问
} as const;
```

### 4. 渲染进程改造

#### 4.1 chat store 新增状态

```typescript
// src/renderer/src/stores/chat.ts
const pendingQuestion = ref<{
  messageId: string;
  toolCallId: string;
  question: string;
  options?: string[];
} | null>(null);

function setPendingQuestion(q: typeof pendingQuestion.value) {
  pendingQuestion.value = q;
}

function clearPendingQuestion() {
  pendingQuestion.value = null;
}

async function answerQuestion(sessionId: string, answer: string) {
  if (!pendingQuestion.value) return;
  const { toolCallId } = pendingQuestion.value;
  clearPendingQuestion();
  await agentPresenter.answerQuestion(sessionId, toolCallId, answer);
}
```

#### 4.2 messageIpc 新增事件监听

```typescript
// src/renderer/src/stores/messageIpc.ts
const unsubQuestion = window.electron.ipcRenderer.on(
  STREAM_EVENTS.QUESTION,
  (sessionId: unknown, payload: unknown) => {
    const p = payload as {
      messageId: string;
      toolCallId: string;
      question: string;
      options?: string[];
    };
    store.setPendingQuestion(p);
  },
);
unsubs.push(unsubQuestion);
```

#### 4.3 ChatInput 组件改造

当 `pendingQuestion` 存在时，显示问答 UI：

```vue
<template>
  <!-- 问答卡片 -->
  <div v-if="pendingQuestion" class="question-card">
    <p>{{ pendingQuestion.question }}</p>

    <!-- 有选项时显示按钮 -->
    <div v-if="pendingQuestion.options?.length" class="options">
      <button v-for="opt in pendingQuestion.options" :key="opt" @click="submitAnswer(opt)">
        {{ opt }}
      </button>
    </div>

    <!-- 自定义输入 -->
    <input v-model="customAnswer" @keydown.enter="submitAnswer(customAnswer)" />
    <button @click="submitAnswer(customAnswer)">回答</button>
  </div>

  <!-- 正常输入框 -->
  <div v-else>
    <!-- 现有 ChatInput 内容 -->
  </div>
</template>
```

### 5. IAgentPresenter 接口更新

```typescript
// src/shared/types/presenters/index.ts
export interface IAgentPresenter {
  chat(sessionId: string, content: UserMessageContent): Promise<void>;
  stopGeneration(sessionId: string): Promise<void>;
  answerQuestion(sessionId: string, toolCallId: string, answer: string): Promise<void>; // 新增
}
```

## 数据流

```
用户输入 "帮我优化代码"
         ↓
AgentPresenter.chat()
         ↓
┌────────────────────────────────────────────────────┐
│  while (stepCount < 128) {                         │
│                                                    │
│    [Step 1] streamText → 流式输出                  │
│      ← text-delta: "我来分析一下..."              │
│      → 推送 blocks 到渲染进程                      │
│      ← tool-call: read { path: "src/main.ts" }    │
│      → 推送 tool_call block                        │
│                                                    │
│    [Step 2] 执行 read 工具                         │
│      → toolPresenter.callTool("read", {...})      │
│      → 更新 tool block 状态为 success              │
│                                                    │
│    [Step 3] 组装 messages，继续循环                │
│      messages += assistant(tool_calls)            │
│      messages += tool(result)                     │
│                                                    │
│    [Step 4] streamText → 继续输出                  │
│      ← text-delta: "发现可以优化的地方..."        │
│      ← tool-call: ask_user { question: "..." }    │
│                                                    │
│    [Step 5] 暂停等待用户                           │
│      → STREAM_EVENTS.QUESTION 推送问题            │
│      → await Promise (等待 answerQuestion)         │
│      ← 用户回答 "是的"                            │
│                                                    │
│    [Step 6] 继续循环...                            │
│  }                                                 │
└────────────────────────────────────────────────────┘
         ↓
保存 assistant message
发送 STREAM_EVENTS.END
```

## 不做的事情（v0.1 scope 外）

- 权限控制（exec 命令确认）
- ToolOutputGuard（大输出 offload）
- Context 压缩（长对话）
- Echo 节流（高频推送优化）
- 独立的 accumulator/dispatch 模块

## 测试要点

1. 单轮对话：无 tool call，正常结束
2. 单次 tool call：read 文件后继续输出
3. 多次 tool call：连续执行多个工具
4. ask_user 暂停/恢复：问题展示、用户回答、继续执行
5. 错误处理：tool 执行失败后继续
6. 中断：stopGeneration 正确中断循环
7. 最大轮次：达到 128 步后停止
