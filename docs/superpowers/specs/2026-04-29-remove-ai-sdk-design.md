# Remove AI SDK - 自研 LLM 客户端设计

**日期**：2026-04-29
**状态**：已批准
**实施周期**：7-9 天

## 1. 背景与目标

### 当前问题

Slime 使用 `ai` 和 `@ai-sdk/anthropic` 包处理 LLM 对话，存在以下问题：

1. **日志真相缺口**：AI SDK 在内部转换请求格式，导致记录的日志与实际发送的请求不一致
   - `buildContext()` 输出干净的 CoreMessage[]
   - AI SDK 转换为包含 `<system-reminder>` 等标签的混乱格式
   - Gateway inbound 记录的是转换后的格式，无法还原原始意图

2. **格式不可控**：
   - system 消息被塞入 user 消息的 content 数组
   - 文本被拆分为多个独立的 `{type:"text"}` 块
   - 与 Octopus 等标准实现的格式不一致

3. **调试困难**：
   - 复制日志无法精确复现请求
   - AI SDK 转换逻辑是黑盒，出问题难以排查

### 目标

移除 AI SDK 依赖，自研 LLM 客户端，实现：

- ✅ **日志真实性**：记录的就是发送的，无中间转换
- ✅ **格式可控**：完全掌握请求格式，与标准 API 对齐
- ✅ **可复现性**：日志可直接用于 curl 测试
- ✅ **可扩展性**：支持多厂商（Anthropic → OpenAI → Gemini）
- ✅ **代码精简**：~800 行核心代码，移除 3 个外部依赖

## 2. 总体架构

### 模块划分

```
src/main/llm/                       # 新目录
├── core/
│   ├── baseClient.ts               # 抽象基类（HTTP + SSE 基础能力）
│   ├── sseParser.ts                # 通用 SSE 协议解析（event/data 行解析）
│   ├── types.ts                    # 统一接口定义
│   └── errors.ts                   # 错误类型
│
├── providers/
│   └── anthropic/
│       ├── client.ts               # AnthropicClient 类
│       ├── streamParser.ts         # Anthropic SSE 事件解析
│       ├── requestBuilder.ts       # 请求体构建
│       ├── types.ts                # Anthropic 特定类型
│       └── __tests__/              # 单元测试
│
├── factory.ts                      # createLLMClient(provider, config)
├── index.ts                        # 导出公共接口
└── __tests__/                      # 集成测试
```

### 依赖关系

```
agentChatPresenter
    ↓ 调用
llm/factory.createLLMClient('anthropic')
    ↓ 返回
AnthropicClient (implements LLMClient)
    ↓ 使用
core/sseParser (通用 SSE 解析)
    ↓ 产出
StreamEvent[] → 推送到 UI
```

### 与现有系统集成

- **替换点**：`agentChatPresenter.ts` 中的 `streamText()` 调用
- **保留**：`buildContext()` 输出的 CoreMessage[]（无需改动）
- **Gateway 集成**：通过 `http://127.0.0.1:${port}/v1/messages` 继续走 Gateway
- **日志记录**：在 client.ts 构建完整请求体后，通过 Gateway relay 记录

## 3. 核心类型定义

### 统一流事件类型 (core/types.ts)

```typescript
// 统一的流事件类型
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_end"; id: string; input: unknown }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: string }
  | { type: "done" };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// LLM 客户端统一接口
export interface LLMClient {
  chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent>;
}

export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Tool {
  description?: string;
  parameters: Record<string, unknown>;
}

// 错误类型
export class LLMError extends Error {
  constructor(
    public readonly type: "http_error" | "stream_error" | "aborted",
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
```

### 设计理念

1. **简化 tool_call 事件**：
   - 拆分为 `start/delta/end` 三个事件
   - `delta` 累积 input JSON 片段
   - `end` 时一次性解析完整 JSON，避免复杂状态机

2. **与 agentChatPresenter 对齐**：
   - `StreamEvent` 直接对应 UI 需要的信息
   - `tool_call_end` 的 `input` 已解析好，可直接使用

3. **保留扩展性**：
   - 每个 provider 可增加特定事件类型
   - 如 `{ type: 'reasoning'; content: string }` (Claude thinking)

## 4. SSE 流解析

### 核心挑战

SSE 协议格式示例：

```
event: message_start
data: {"type":"message_start"}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}

data: [DONE]
```

需要处理：

- 跨 chunk 的行边界（一行可能被分成多个 chunk）
- UTF-8 多字节字符被分割
- 空行分隔独立事件

### 实现策略 (core/sseParser.ts)

使用 **Web Streams API**（Node.js v16+ 原生支持）：

```typescript
export async function* parseSSE(
  response: Response,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = response.body
    ?.pipeThrough(new TextDecoderStream()) // 自动处理 UTF-8 边界
    .getReader();

  if (!reader) throw new Error("No response body");

  let buffer = "";
  let currentEvent: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 保留最后一个可能不完整的行

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;

        yield { event: currentEvent, data };
        currentEvent = undefined;
      }
    }
  }
}
```

### 关键设计点

1. **TextDecoderStream 处理 UTF-8**：
   - 不需要手写 buffer 拼接
   - 自动处理跨 chunk 的多字节字符（如中文）

2. **buffer 保留不完整行**：
   - `lines.pop()` 取出最后一个可能不完整的行
   - 下次循环时与新数据拼接

3. **Generator 模式**：
   - 逐个 yield 事件，内存友好
   - 自动支持 `for await` 循环，代码简洁

## 5. Anthropic 客户端实现

### 请求构建 (providers/anthropic/requestBuilder.ts)

```typescript
export function buildAnthropicRequest(
  messages: CoreMessage[],
  tools: Record<string, Tool>,
  options: ChatOptions,
): AnthropicRequestBody {
  // 1. 提取 system 消息
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");

  // 2. 转换非 system 消息
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content };
      }

      // 处理数组格式的 content（tool_call/tool_result）
      const content = msg.content.map((block) => {
        switch (block.type) {
          case "text":
            return { type: "text", text: block.text };
          case "tool-call":
            return {
              type: "tool_use",
              id: block.toolCallId,
              name: block.toolName,
              input: block.input,
            };
          case "tool-result":
            return {
              type: "tool_result",
              tool_use_id: block.toolCallId,
              content: block.output.value,
            };
          default:
            return { type: "text", text: "" };
        }
      });

      return { role: msg.role, content };
    });

  // 3. 转换 tools
  const anthropicTools = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: tool.parameters,
  }));

  // 4. 构建请求体
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
    system: system || undefined,
    messages: anthropicMessages,
    tools: anthropicTools.length ? anthropicTools : undefined,
    temperature: options.temperature,
  };
}
```

### 流解析 (providers/anthropic/streamParser.ts)

```typescript
export async function* parseAnthropicStream(response: Response): AsyncGenerator<StreamEvent> {
  // 工具调用累积器：按 id 累积 input_json_delta
  const toolCalls = new Map<
    string,
    {
      id: string;
      name: string;
      inputJson: string;
    }
  >();

  for await (const { event, data } of parseSSE(response)) {
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch (e) {
      // 静默跳过畸形 JSON，继续解析后续事件
      logger.warn("Invalid SSE data:", data);
      continue;
    }

    switch (event) {
      case "content_block_start":
        if (payload.content_block?.type === "tool_use") {
          const tc = payload.content_block;
          toolCalls.set(tc.id, { id: tc.id, name: tc.name, inputJson: "" });
          yield { type: "tool_call_start", id: tc.id, name: tc.name };
        }
        break;

      case "content_block_delta":
        if (payload.delta?.type === "text_delta") {
          yield { type: "text", text: payload.delta.text };
        }
        if (payload.delta?.type === "input_json_delta") {
          // Anthropic 在 delta 中携带 tool_use id
          const id = payload.index; // 或从其他字段获取 id
          const tc = toolCalls.get(id);
          if (tc) {
            tc.inputJson += payload.delta.partial_json;
            yield { type: "tool_call_delta", id, delta: payload.delta.partial_json };
          }
        }
        break;

      case "content_block_stop":
        const id = payload.index;
        const tc = toolCalls.get(id);
        if (tc) {
          try {
            const input = JSON.parse(tc.inputJson);
            yield { type: "tool_call_end", id: tc.id, input };
          } catch (e) {
            // JSON 解析失败，yield error 事件但不中断流
            yield { type: "error", error: `Tool call ${tc.id} JSON invalid: ${e.message}` };
          }
          toolCalls.delete(id);
        }
        break;

      case "message_delta":
        if (payload.usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: payload.usage.input_tokens || 0,
              outputTokens: payload.usage.output_tokens || 0,
              cacheReadTokens: payload.usage.cache_read_input_tokens,
              cacheWriteTokens: payload.usage.cache_creation_input_tokens,
            },
          };
        }
        break;

      case "message_stop":
        yield { type: "done" };
        break;

      case "error":
        yield { type: "error", error: payload.error?.message || "Unknown error" };
        break;
    }
  }
}
```

### 客户端主类 (providers/anthropic/client.ts)

```typescript
export class AnthropicClient implements LLMClient {
  constructor(
    private baseURL: string,
    private apiKey: string,
  ) {}

  async *chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const requestBody = buildAnthropicRequest(messages, tools, options);

    try {
      const response = await fetch(`${this.baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new LLMError(
          "http_error",
          `Anthropic API error: ${response.status} ${errorText}`,
          response.status,
        );
      }

      yield* parseAnthropicStream(response);
    } catch (err) {
      if (err.name === "AbortError") {
        throw new LLMError("aborted", "Request cancelled");
      }
      throw err;
    }
  }
}
```

### 关键设计点

1. **Tool call 状态管理**：
   - 用 Map 按 id 累积 inputJson
   - `content_block_stop` 时解析 JSON
   - 解析失败 yield error 事件，不中断流

2. **错误处理分层**：
   - HTTP 错误直接 throw（上层 catch）
   - JSON 解析错误 yield error 事件（继续流）
   - 保持流的完整性

3. **AbortSignal 透传**：
   - 直接传给 fetch
   - 支持 agentChatPresenter 的 stopGeneration

## 6. 集成到 agentChatPresenter

### 改造策略

**Before（使用 AI SDK）**：

```typescript
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const model = createModel(groupName);
const result = streamText({ model, messages, tools });

for await (const chunk of result.textStream) {
  /* ... */
}
const toolCalls = await result.toolCalls;
```

**After（使用自研客户端）**：

```typescript
import { createLLMClient } from "@/llm";

const client = createLLMClient("anthropic", {
  baseURL: `http://127.0.0.1:${port}`,
  apiKey: internalKey,
});

for await (const event of client.chat(messages, tools, options, signal)) {
  switch (event.type) {
    case "text": /* ... */
    case "tool_call_start": /* ... */
    case "tool_call_end": /* ... */
  }
}
```

### 具体改造点

#### 1. 移除 AI SDK 依赖

```typescript
// agentChatPresenter.ts
- import { streamText } from "ai"
- import { createAnthropic } from "@ai-sdk/anthropic"
+ import { createLLMClient } from "@/llm"
+ import type { LLMClient } from "@/llm"
```

#### 2. 改造 `createModel` 方法

```typescript
- private createModel(groupName: string) {
-   const provider = createAnthropic({
-     apiKey: this.gatewayPresenter.getInternalKey(),
-     baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}/v1/`
-   })
-   return provider(groupName)
- }

+ private createClient(): LLMClient {
+   return createLLMClient('anthropic', {
+     baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}`,
+     apiKey: this.gatewayPresenter.getInternalKey()
+   })
+ }
```

#### 3. 改造 `collectStreamResult`

```typescript
private async collectStreamResult(
  client: LLMClient,
  messages: CoreMessage[],
  tools: Record<string, Tool>,
  options: ChatOptions,
  sessionId: string,
  messageId: string,
  blocks: AssistantMessageBlock[],
  abortSignal: AbortSignal
): Promise<{ textContent: string; toolCalls: ToolCall[] }> {

  let textContent = ""
  let currentContentBlock: AssistantMessageBlock | null = null
  const toolCalls: ToolCall[] = []

  for await (const event of client.chat(messages, tools, options, abortSignal)) {
    if (abortSignal.aborted) break

    switch (event.type) {
      case 'text':
        textContent += event.text
        if (!currentContentBlock) {
          currentContentBlock = {
            type: 'content',
            content: '',
            status: 'loading',
            timestamp: Date.now()
          }
          blocks.push(currentContentBlock)
        }
        currentContentBlock.content += event.text
        this.pushToRenderer(sessionId, messageId, blocks)
        break

      case 'tool_call_start':
        blocks.push({
          type: 'tool_call',
          id: event.id,
          status: 'loading',
          timestamp: Date.now(),
          tool_call: { id: event.id, name: event.name, input: {} }
        })
        this.pushToRenderer(sessionId, messageId, blocks)
        break

      case 'tool_call_end':
        toolCalls.push({
          id: event.id,
          name: blocks.find(b => b.id === event.id)?.tool_call?.name || '',
          args: JSON.stringify(event.input)
        })
        const block = blocks.find(b => b.id === event.id)
        if (block?.tool_call) {
          block.tool_call.input = event.input
        }
        this.pushToRenderer(sessionId, messageId, blocks)
        break

      case 'error':
        logger.error('Stream error:', event.error)
        // 记录错误但继续流
        break

      case 'usage':
        // 记录 token 使用（可选）
        break
    }
  }

  if (currentContentBlock) {
    currentContentBlock.status = 'success'
    this.pushToRenderer(sessionId, messageId, blocks)
  }

  return { textContent, toolCalls }
}
```

#### 4. 改造主循环

```typescript
async chat(sessionId: string, content: string): Promise<void> {
  // ... 前面的准备代码保持不变（buildContext、模型选择等）

  const client = this.createClient()
  const blocks: AssistantMessageBlock[] = []
  const assistantMessageId = crypto.randomUUID()
  let stepCount = 0

  try {
    while (stepCount < MAX_STEPS) {
      if (abortController.signal.aborted) break
      stepCount++

      const { textContent, toolCalls } = await this.collectStreamResult(
        client,
        messages,
        tools,
        { model: groupName, maxTokens: config?.maxTokens },
        sessionId,
        assistantMessageId,
        blocks,
        abortController.signal
      )

      if (toolCalls.length === 0) break

      // 后续 tool 执行逻辑保持不变
      const assistantParts: any[] = []
      if (textContent) assistantParts.push({ type: 'text', text: textContent })
      for (const tc of toolCalls) {
        assistantParts.push({
          type: 'tool-call',
          toolCallId: tc.id,
          toolName: tc.name,
          input: JSON.parse(tc.args)
        })
      }
      messages.push({ role: 'assistant', content: assistantParts })

      // Execute tools...
      const toolResultParts: any[] = []
      for (const tc of toolCalls) {
        if (abortController.signal.aborted) break
        const toolResult = await this.executeTool(sessionId, tc, blocks, assistantMessageId)
        toolResultParts.push({
          type: 'tool-result',
          toolCallId: tc.id,
          toolName: tc.name,
          output: { type: 'text', value: toolResult }
        })
      }
      messages.push({ role: 'tool', content: toolResultParts })
    }

    // Finalize...
    for (const block of blocks) {
      if (block.status === 'loading') block.status = 'success'
    }
    markFinalBlock(blocks)

    // Save assistant message...
    const assistantSeq = messageDao.getNextOrderSeq(db, sessionId)
    messageDao.createMessage(db, {
      id: assistantMessageId,
      sessionId,
      orderSeq: assistantSeq,
      role: 'assistant',
      content: JSON.stringify(blocks),
      status: 'sent'
    })

    sessionDao.touchUpdatedAt(db, sessionId)
    this.sessionStates.set(sessionId, 'idle')
    eventBus.sendToRenderer(CHAT_STREAM_EVENTS.END, { sessionId, messageId: assistantMessageId })

  } catch (err) {
    // 错误处理保持不变
    if (abortController.signal.aborted) {
      // Handle abort...
    } else {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('AgentChatPresenter chat error', { sessionId, error: errorMsg })
      this.sessionStates.set(sessionId, 'error')
      eventBus.sendToRenderer(CHAT_STREAM_EVENTS.ERROR, { sessionId, error: errorMsg })
    }
  } finally {
    this.abortControllers.delete(sessionId)
  }
}
```

### 关键改造总结

1. **移除 AI SDK 的两个入口**：`streamText` 和 `createAnthropic`
2. **`collectStreamResult` 改为事件驱动**：从双 stream（textStream + toolCalls）改为单 generator
3. **保持现有逻辑不变**：blocks 管理、UI 推送、tool 执行、消息保存
4. **错误处理升级**：区分 abort 和其他错误，保持流程健壮性

## 7. 错误处理与测试

### 错误处理层次

#### 1. HTTP 层错误

```typescript
// AnthropicClient.chat()
try {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new LLMError("http_error", await response.text(), response.status);
  }
} catch (err) {
  if (err.name === "AbortError") {
    throw new LLMError("aborted", "Request cancelled");
  }
  throw err;
}
```

#### 2. SSE 解析层错误

```typescript
// parseSSE()
try {
  const payload = JSON.parse(data);
} catch (e) {
  // 静默跳过畸形 JSON，继续解析后续事件
  logger.warn("Invalid SSE data:", data);
  continue;
}
```

#### 3. 业务层错误

```typescript
// parseAnthropicStream()
case 'content_block_stop':
  try {
    const input = JSON.parse(tc.inputJson)
    yield { type: 'tool_call_end', id, input }
  } catch (e) {
    // yield error 事件，不中断流
    yield { type: 'error', error: `Tool call ${id} JSON invalid` }
  }
  break
```

#### 4. 上层捕获

```typescript
// agentChatPresenter.chat()
try {
  for await (const event of client.chat(...)) {
    if (event.type === 'error') {
      logger.error('Stream error:', event.error)
      // 记录但继续，或根据严重程度决定
    }
  }
} catch (err) {
  // HTTP 错误、abort 等，终止流程
  this.sessionStates.set(sessionId, 'error')
  eventBus.sendToRenderer(CHAT_STREAM_EVENTS.ERROR, {
    sessionId,
    error: err.message
  })
}
```

### 测试策略

#### 单元测试（~400 行）

**1. SSE 解析器测试 (core/**tests**/sseParser.test.ts)**

```typescript
describe("parseSSE", () => {
  it("should parse simple event");
  it("should handle incomplete lines");
  it("should handle UTF-8 split across chunks");
  it("should handle multiple events in one chunk");
  it("should stop at [DONE]");
});
```

**2. Anthropic 流解析测试 (providers/anthropic/**tests**/streamParser.test.ts)**

```typescript
describe("parseAnthropicStream", () => {
  it("should parse text delta");
  it("should accumulate tool call input");
  it("should handle invalid tool call JSON");
  it("should parse usage");
  it("should handle error events");
});
```

**3. 请求构建测试 (providers/anthropic/**tests**/requestBuilder.test.ts)**

```typescript
describe("buildAnthropicRequest", () => {
  it("should build basic request");
  it("should extract system messages");
  it("should convert tools");
  it("should handle array content");
});
```

#### 集成测试（~200 行）

```typescript
describe("AnthropicClient", () => {
  let mockServer: MockGateway;

  beforeEach(() => {
    mockServer = createMockGateway();
  });

  it("should complete single turn conversation", async () => {
    mockServer.respondWithSSE([
      { event: "content_block_delta", data: { delta: { type: "text_delta", text: "Hi" } } },
      { event: "message_stop", data: {} },
    ]);

    const client = createLLMClient("anthropic", {
      baseURL: mockServer.url,
      apiKey: "test",
    });

    const events = [];
    for await (const event of client.chat(messages, {}, { model: "test" })) {
      events.push(event);
    }

    expect(events).toMatchSnapshot();
  });

  it("should handle tool calls", async () => {
    /* ... */
  });
  it("should handle abort signal", async () => {
    /* ... */
  });
  it("should handle HTTP errors", async () => {
    /* ... */
  });
});
```

#### 端到端测试（手动）

测试场景：

- ✅ 单轮对话（纯文本）
- ✅ 单轮对话 + tool call
- ✅ 多轮 agentic loop (10+ steps)
- ✅ 嵌套 tool call（多个 tool_use block）
- ✅ abort 信号（stopGeneration）
- ✅ 网络错误（断网重连）
- ✅ 大响应（4096+ tokens）

### 测试覆盖目标

| 模块                               | 目标覆盖率 | 重点                        |
| ---------------------------------- | ---------- | --------------------------- |
| core/sseParser                     | 90%+       | 边界情况（跨 chunk、UTF-8） |
| providers/anthropic/streamParser   | 85%+       | 事件处理完整性              |
| providers/anthropic/requestBuilder | 95%+       | 格式转换正确性              |
| providers/anthropic/client         | 80%+       | 错误处理                    |

## 8. 实施计划

### 阶段 1：核心基础（2 天）

- [ ] 实现 `core/sseParser.ts`（通用 SSE 解析）
- [ ] 实现 `core/types.ts`（类型定义）
- [ ] 实现 `core/errors.ts`（错误类型）
- [ ] 编写 SSE 解析器单元测试

### 阶段 2：Anthropic 客户端（3 天）

- [ ] 实现 `providers/anthropic/requestBuilder.ts`
- [ ] 实现 `providers/anthropic/streamParser.ts`
- [ ] 实现 `providers/anthropic/client.ts`
- [ ] 实现 `factory.ts`（工厂函数）
- [ ] 编写 Anthropic 相关单元测试

### 阶段 3：集成改造（2 天）

- [ ] 改造 `agentChatPresenter.ts`
- [ ] 移除 AI SDK 依赖（package.json）
- [ ] 编写集成测试
- [ ] 手动端到端测试

### 阶段 4：测试与优化（2 天）

- [ ] 补充边缘情况测试
- [ ] 性能测试（大响应、多轮对话）
- [ ] 错误场景测试（网络异常、abort）
- [ ] 代码审查与优化

### 总工作量：7-9 天

- 核心实现：5-6 天
- 测试编写：2 天
- 集成调试：1 天

## 9. 扩展性设计

### 新增厂商流程（以 OpenAI 为例）

**1. 创建 provider 目录**

```
src/main/llm/providers/openai/
├── client.ts
├── streamParser.ts
├── requestBuilder.ts
├── types.ts
└── __tests__/
```

**2. 实现核心模块（~350 行）**

```typescript
// openai/streamParser.ts
export async function* parseOpenAIStream(response: Response) {
  for await (const { data } of parseSSE(response)) {
    const payload = JSON.parse(data);
    const delta = payload.choices?.[0]?.delta;

    if (delta?.content) {
      yield { type: "text", text: delta.content };
    }

    if (delta?.tool_calls) {
      // OpenAI 格式与 Anthropic 不同，需单独处理
      for (const tc of delta.tool_calls) {
        if (tc.function?.name) {
          yield { type: "tool_call_start", id: tc.id, name: tc.function.name };
        }
        if (tc.function?.arguments) {
          yield { type: "tool_call_delta", id: tc.id, delta: tc.function.arguments };
        }
      }
    }
  }
}
```

**3. 注册到 factory（~10 行）**

```typescript
// factory.ts
export function createLLMClient(provider: string, config: Config): LLMClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(config.baseURL, config.apiKey);
    case "openai":
      return new OpenAIClient(config.baseURL, config.apiKey);
    case "gemini":
      return new GeminiClient(config.baseURL, config.apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### 复用率对比

| 厂商                  | 新增代码量 | 开发时间 | 复用率 |
| --------------------- | ---------- | -------- | ------ |
| **Anthropic**（首个） | ~600 行    | 6-7 天   | 0%     |
| **OpenAI**            | ~350 行    | 2-3 天   | 60%    |
| **Gemini**            | ~400 行    | 2-3 天   | 55%    |

**可复用部分**：

- ✅ `core/sseParser` 通用 SSE 解析
- ✅ `core/types` 统一接口
- ✅ HTTP 请求封装和 AbortController 集成
- ✅ 错误处理模式

**需重写部分**：

- ❌ 厂商特定的消息格式转换
- ❌ 厂商特定的 SSE 事件解析
- ❌ Tool call 累积逻辑（格式不同）

## 10. 风险与缓解

### 风险 1：SSE 解析边缘情况

**风险**：跨 chunk 的 JSON、UTF-8 字符被分割

**缓解**：

- 用 TextDecoderStream 自动处理 UTF-8
- 充分的单元测试覆盖边界情况
- 参考 Octopus 的 Go 实现验证逻辑

### 风险 2：Tool call JSON 累积失败

**风险**：input_json_delta 累积后解析失败

**缓解**：

- 解析失败 yield error 事件，不中断流
- 记录原始 inputJson 到日志，便于排查
- 上层 try-catch 兜底

### 风险 3：Anthropic API 格式变更

**风险**：Anthropic 升级 API，事件格式变化

**缓解**：

- 版本锁定：`anthropic-version: 2023-06-01`
- 降级处理：未知事件类型静默跳过
- 充分测试：覆盖现有所有事件类型

### 风险 4：性能问题

**风险**：大量小块数据频繁推送 UI

**缓解**：

- 文本块合并：累积 100ms 或 100 字符后推送
- 背压控制：generator 自带背压机制
- 性能测试：4096+ tokens 场景验证

## 11. 总结

### 设计评分

| 维度           | 评分       | 说明                 |
| -------------- | ---------- | -------------------- |
| **架构清晰度** | ⭐⭐⭐⭐⭐ | 分层明确，职责单一   |
| **可维护性**   | ⭐⭐⭐⭐⭐ | 代码量适中，易于理解 |
| **可扩展性**   | ⭐⭐⭐⭐⭐ | 新增厂商只需 2-3 天  |
| **日志真实性** | ⭐⭐⭐⭐⭐ | 记录即发送，无转换   |
| **测试覆盖**   | ⭐⭐⭐⭐   | 单元+集成测试充分    |
| **风险控制**   | ⭐⭐⭐⭐   | 错误分层，降级处理   |

### 关键收益

1. **日志可信度 100%**：记录的请求体就是发送的请求体
2. **调试效率提升 3x**：日志可直接 curl 复现
3. **代码精简**：移除 3 个依赖，减少 node_modules 体积
4. **扩展性强**：新增厂商只需 2-3 天，复用 60% 代码
5. **与 Octopus 对齐**：请求格式标准化，便于对比

### 下一步

设计方案已确认，下一步：

1. 调用 `writing-plans` skill 创建详细实施计划
2. 分阶段实施（7-9 天完成）
3. 充分测试后合并到主分支
