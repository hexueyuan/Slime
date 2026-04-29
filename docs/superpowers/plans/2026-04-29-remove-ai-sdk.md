# Remove AI SDK - 自研 LLM 客户端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 AI SDK 依赖，自研 Anthropic LLM 客户端，实现日志真实性和格式可控

**Architecture:** 分层架构 core（通用 SSE 解析）+ providers/anthropic（厂商实现）+ factory（统一入口），通过 AsyncGenerator 流式返回事件

**Tech Stack:** Node.js fetch API, Web Streams API (TextDecoderStream), TypeScript, Vitest

---

## 文件结构

### 新建文件

**Core 核心模块**

- `src/main/llm/core/types.ts` - 统一类型定义（StreamEvent, LLMClient, Usage）
- `src/main/llm/core/errors.ts` - 错误类型（LLMError）
- `src/main/llm/core/sseParser.ts` - 通用 SSE 协议解析器
- `src/main/llm/core/__tests__/sseParser.test.ts` - SSE 解析器测试

**Anthropic Provider**

- `src/main/llm/providers/anthropic/types.ts` - Anthropic 特定类型
- `src/main/llm/providers/anthropic/requestBuilder.ts` - 请求体构建
- `src/main/llm/providers/anthropic/streamParser.ts` - Anthropic SSE 事件解析
- `src/main/llm/providers/anthropic/client.ts` - AnthropicClient 主类
- `src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts` - 请求构建测试
- `src/main/llm/providers/anthropic/__tests__/streamParser.test.ts` - 流解析测试
- `src/main/llm/providers/anthropic/__tests__/client.test.ts` - 客户端测试

**Factory 与导出**

- `src/main/llm/factory.ts` - createLLMClient 工厂函数
- `src/main/llm/index.ts` - 公共导出

### 修改文件

- `src/main/presenter/agentChat/agentChatPresenter.ts` - 集成新客户端
- `src/main/presenter/agentChat/contextBuilder.ts` - 导出 CoreMessage 类型（如需）
- `package.json` - 移除 AI SDK 依赖

---

## Task 1: 核心类型定义

**Files:**

- Create: `src/main/llm/core/types.ts`
- Create: `src/main/llm/core/errors.ts`

- [ ] **Step 1: 创建核心类型文件**

```typescript
// src/main/llm/core/types.ts
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";

/**
 * 统一流事件类型
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_end"; id: string; input: unknown }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Token 使用统计
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * LLM 客户端统一接口
 */
export interface LLMClient {
  chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent>;
}

/**
 * 对话选项
 */
export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * 工具定义
 */
export interface Tool {
  description?: string;
  parameters: Record<string, unknown>;
}

/**
 * 客户端配置
 */
export interface LLMClientConfig {
  baseURL: string;
  apiKey: string;
}
```

- [ ] **Step 2: 创建错误类型文件**

```typescript
// src/main/llm/core/errors.ts

/**
 * LLM 客户端错误类型
 */
export type LLMErrorType = "http_error" | "stream_error" | "aborted";

/**
 * LLM 错误类
 */
export class LLMError extends Error {
  constructor(
    public readonly errorType: LLMErrorType,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
```

- [ ] **Step 3: 提交核心类型**

```bash
git add src/main/llm/core/types.ts src/main/llm/core/errors.ts
git commit -m "feat(llm): add core types and error definitions"
```

---

## Task 2: 通用 SSE 解析器

**Files:**

- Create: `src/main/llm/core/sseParser.ts`
- Create: `src/main/llm/core/__tests__/sseParser.test.ts`

- [ ] **Step 1: 编写 SSE 解析器测试（失败）**

```typescript
// src/main/llm/core/__tests__/sseParser.test.ts
import { describe, it, expect } from "vitest";
import { parseSSE } from "../sseParser";

function createMockResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("parseSSE", () => {
  it("should parse simple event", async () => {
    const response = createMockResponse(['data: {"hello":"world"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"hello":"world"}' }]);
  });

  it("should parse event with event type", async () => {
    const response = createMockResponse(["event: message_start\n", 'data: {"type":"start"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ event: "message_start", data: '{"type":"start"}' }]);
  });

  it("should handle incomplete lines across chunks", async () => {
    const response = createMockResponse(['data: {"hel', 'lo":"world"}\n\n']);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"hello":"world"}' }]);
  });

  it("should stop at [DONE]", async () => {
    const response = createMockResponse([
      'data: {"msg":"first"}\n\n',
      "data: [DONE]\n\n",
      'data: {"msg":"after"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ data: '{"msg":"first"}' }]);
  });

  it("should handle UTF-8 multibyte characters", async () => {
    const response = createMockResponse([
      'data: {"text":"你好', // '好' 可能跨 chunk
    ]);

    const events = [];
    for await (const event of parseSSE(response)) {
      events.push(event);
    }

    expect(events[0].data).toContain("你好");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/main/llm/core/__tests__/sseParser.test.ts
```

预期：FAIL - parseSSE 未定义

- [ ] **Step 3: 实现 SSE 解析器**

```typescript
// src/main/llm/core/sseParser.ts

/**
 * SSE 事件
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

/**
 * 解析 SSE 流
 *
 * @param response - Fetch Response 对象
 * @returns AsyncGenerator<SSEEvent>
 */
export async function* parseSSE(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();

  if (!reader) {
    throw new Error("No response body");
  }

  let buffer = "";
  let currentEvent: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // 保留最后一个可能不完整的行

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("event: ")) {
          currentEvent = trimmedLine.slice(7).trim();
        } else if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6);

          // 遇到 [DONE] 停止
          if (data === "[DONE]") {
            return;
          }

          yield {
            event: currentEvent,
            data,
          };
          currentEvent = undefined;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/main/llm/core/__tests__/sseParser.test.ts
```

预期：PASS

- [ ] **Step 5: 提交 SSE 解析器**

```bash
git add src/main/llm/core/sseParser.ts src/main/llm/core/__tests__/sseParser.test.ts
git commit -m "feat(llm): add SSE parser with tests"
```

---

## Task 3: Anthropic 类型定义

**Files:**

- Create: `src/main/llm/providers/anthropic/types.ts`

- [ ] **Step 1: 创建 Anthropic 类型文件**

```typescript
// src/main/llm/providers/anthropic/types.ts

/**
 * Anthropic API 请求体
 */
export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  stream: boolean;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
}

/**
 * Anthropic 消息
 */
export interface AnthropicMessage {
  role: string;
  content: string | AnthropicContentBlock[];
}

/**
 * Anthropic 内容块
 */
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64" | "url"; media_type?: string; data?: string; url?: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Anthropic 工具定义
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

/**
 * Anthropic SSE 事件 payload
 */
export interface AnthropicSSEPayload {
  type?: string;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
  };
  index?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}
```

- [ ] **Step 2: 提交 Anthropic 类型**

```bash
git add src/main/llm/providers/anthropic/types.ts
git commit -m "feat(llm): add Anthropic types"
```

---

## Task 4: Anthropic 请求构建器

**Files:**

- Create: `src/main/llm/providers/anthropic/requestBuilder.ts`
- Create: `src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts`

- [ ] **Step 1: 编写请求构建器测试（失败）**

```typescript
// src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
import { describe, it, expect } from "vitest";
import { buildAnthropicRequest } from "../requestBuilder";
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";

describe("buildAnthropicRequest", () => {
  it("should build basic request", () => {
    const messages: CoreMessage[] = [{ role: "user", content: "Hello" }];
    const tools = {};
    const options = { model: "claude-3", maxTokens: 1024 };

    const result = buildAnthropicRequest(messages, tools, options);

    expect(result).toEqual({
      model: "claude-3",
      max_tokens: 1024,
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
    });
  });

  it("should extract system messages", () => {
    const messages: CoreMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
    ];
    const tools = {};
    const options = { model: "claude-3" };

    const result = buildAnthropicRequest(messages, tools, options);

    expect(result.system).toBe("You are helpful");
    expect(result.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("should convert tools", () => {
    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];
    const tools = {
      read_file: {
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    };
    const options = { model: "claude-3" };

    const result = buildAnthropicRequest(messages, tools, options);

    expect(result.tools).toEqual([
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: { path: { type: "string" } } },
      },
    ]);
  });

  it("should handle array content with tool calls", () => {
    const messages: CoreMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me read" },
          { type: "tool-call", toolCallId: "t1", toolName: "read", input: { path: "a.txt" } },
        ],
      },
    ];
    const tools = {};
    const options = { model: "claude-3" };

    const result = buildAnthropicRequest(messages, tools, options);

    expect(result.messages[0].content).toEqual([
      { type: "text", text: "Let me read" },
      { type: "tool_use", id: "t1", name: "read", input: { path: "a.txt" } },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
```

预期：FAIL - buildAnthropicRequest 未定义

- [ ] **Step 3: 实现请求构建器**

```typescript
// src/main/llm/providers/anthropic/requestBuilder.ts
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";
import type { Tool, ChatOptions } from "@/llm/core/types";
import type { AnthropicRequestBody, AnthropicMessage, AnthropicContentBlock } from "./types";

/**
 * 构建 Anthropic API 请求体
 */
export function buildAnthropicRequest(
  messages: CoreMessage[],
  tools: Record<string, Tool>,
  options: ChatOptions,
): AnthropicRequestBody {
  // 提取 system 消息
  const systemMessages = messages.filter((m) => m.role === "system");
  const system =
    systemMessages.length > 0 ? systemMessages.map((m) => m.content).join("\n") : undefined;

  // 转换非 system 消息
  const anthropicMessages: AnthropicMessage[] = messages
    .filter((m) => m.role !== "system")
    .map((msg) => {
      if (typeof msg.content === "string") {
        return { role: msg.role, content: msg.content };
      }

      // 处理数组格式的 content
      const content: AnthropicContentBlock[] = msg.content.map((block) => {
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

  // 转换 tools
  const anthropicTools = Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: tool.parameters,
  }));

  const body: AnthropicRequestBody = {
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
    messages: anthropicMessages,
  };

  if (system) body.system = system;
  if (anthropicTools.length > 0) body.tools = anthropicTools;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  return body;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
```

预期：PASS

- [ ] **Step 5: 提交请求构建器**

```bash
git add src/main/llm/providers/anthropic/requestBuilder.ts src/main/llm/providers/anthropic/__tests__/requestBuilder.test.ts
git commit -m "feat(llm): add Anthropic request builder with tests"
```

---

## Task 5: Anthropic 流解析器

**Files:**

- Create: `src/main/llm/providers/anthropic/streamParser.ts`
- Create: `src/main/llm/providers/anthropic/__tests__/streamParser.test.ts`

- [ ] **Step 1: 编写流解析器测试（失败）**

```typescript
// src/main/llm/providers/anthropic/__tests__/streamParser.test.ts
import { describe, it, expect } from "vitest";
import { parseAnthropicStream } from "../streamParser";

function createMockResponse(events: Array<{ event: string; data: any }>): Response {
  const chunks: string[] = [];
  for (const e of events) {
    chunks.push(`event: ${e.event}\n`);
    chunks.push(`data: ${JSON.stringify(e.data)}\n\n`);
  }

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("parseAnthropicStream", () => {
  it("should parse text delta", async () => {
    const response = createMockResponse([
      { event: "content_block_delta", data: { delta: { type: "text_delta", text: "Hello" } } },
      { event: "message_stop", data: {} },
    ]);

    const events = [];
    for await (const event of parseAnthropicStream(response)) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "text", text: "Hello" }, { type: "done" }]);
  });

  it("should accumulate tool call input", async () => {
    const response = createMockResponse([
      {
        event: "content_block_start",
        data: { index: 0, content_block: { type: "tool_use", id: "t1", name: "read" } },
      },
      {
        event: "content_block_delta",
        data: { index: 0, delta: { type: "input_json_delta", partial_json: '{"path":' } },
      },
      {
        event: "content_block_delta",
        data: { index: 0, delta: { type: "input_json_delta", partial_json: '"a.txt"}' } },
      },
      { event: "content_block_stop", data: { index: 0 } },
      { event: "message_stop", data: {} },
    ]);

    const events = [];
    for await (const event of parseAnthropicStream(response)) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "tool_call_start", id: "t1", name: "read" });
    expect(events).toContainEqual({ type: "tool_call_end", id: "t1", input: { path: "a.txt" } });
  });

  it("should handle invalid tool call JSON", async () => {
    const response = createMockResponse([
      {
        event: "content_block_start",
        data: { index: 0, content_block: { type: "tool_use", id: "t1", name: "read" } },
      },
      {
        event: "content_block_delta",
        data: { index: 0, delta: { type: "input_json_delta", partial_json: "{invalid" } },
      },
      { event: "content_block_stop", data: { index: 0 } },
      { event: "message_stop", data: {} },
    ]);

    const events = [];
    for await (const event of parseAnthropicStream(response)) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error).toContain("JSON");
  });

  it("should parse usage", async () => {
    const response = createMockResponse([
      { event: "message_delta", data: { usage: { input_tokens: 10, output_tokens: 20 } } },
      { event: "message_stop", data: {} },
    ]);

    const events = [];
    for await (const event of parseAnthropicStream(response)) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "usage",
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/streamParser.test.ts
```

预期：FAIL - parseAnthropicStream 未定义

- [ ] **Step 3: 实现流解析器**

```typescript
// src/main/llm/providers/anthropic/streamParser.ts
import { parseSSE } from "@/llm/core/sseParser";
import type { StreamEvent } from "@/llm/core/types";
import type { AnthropicSSEPayload } from "./types";
import { logger } from "@/utils";

interface ToolCallState {
  id: string;
  name: string;
  inputJson: string;
}

/**
 * 解析 Anthropic SSE 流
 */
export async function* parseAnthropicStream(response: Response): AsyncGenerator<StreamEvent> {
  // Tool call 累积器：按 index 累积
  const toolCalls = new Map<number, ToolCallState>();

  for await (const { event, data } of parseSSE(response)) {
    let payload: AnthropicSSEPayload;
    try {
      payload = JSON.parse(data);
    } catch (e) {
      logger.warn("Invalid SSE data:", data);
      continue;
    }

    switch (event) {
      case "content_block_start":
        if (payload.content_block?.type === "tool_use") {
          const tc = payload.content_block;
          const index = payload.index ?? 0;
          toolCalls.set(index, {
            id: tc.id!,
            name: tc.name!,
            inputJson: "",
          });
          yield { type: "tool_call_start", id: tc.id!, name: tc.name! };
        }
        break;

      case "content_block_delta":
        if (payload.delta?.type === "text_delta") {
          yield { type: "text", text: payload.delta.text! };
        } else if (payload.delta?.type === "input_json_delta") {
          const index = payload.index ?? 0;
          const tc = toolCalls.get(index);
          if (tc) {
            tc.inputJson += payload.delta.partial_json!;
            yield { type: "tool_call_delta", id: tc.id, delta: payload.delta.partial_json! };
          }
        }
        break;

      case "content_block_stop":
        const index = payload.index ?? 0;
        const tc = toolCalls.get(index);
        if (tc) {
          try {
            const input = JSON.parse(tc.inputJson);
            yield { type: "tool_call_end", id: tc.id, input };
          } catch (e) {
            yield {
              type: "error",
              error: `Tool call ${tc.id} JSON invalid: ${(e as Error).message}`,
            };
          }
          toolCalls.delete(index);
        }
        break;

      case "message_delta":
        if (payload.usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: payload.usage.input_tokens ?? 0,
              outputTokens: payload.usage.output_tokens ?? 0,
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
        yield {
          type: "error",
          error: payload.error?.message ?? "Unknown error",
        };
        break;
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/streamParser.test.ts
```

预期：PASS

- [ ] **Step 5: 提交流解析器**

```bash
git add src/main/llm/providers/anthropic/streamParser.ts src/main/llm/providers/anthropic/__tests__/streamParser.test.ts
git commit -m "feat(llm): add Anthropic stream parser with tests"
```

---

## Task 6: Anthropic 客户端主类

**Files:**

- Create: `src/main/llm/providers/anthropic/client.ts`
- Create: `src/main/llm/providers/anthropic/__tests__/client.test.ts`

- [ ] **Step 1: 编写客户端测试（失败）**

```typescript
// src/main/llm/providers/anthropic/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicClient } from "../client";
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";

describe("AnthropicClient", () => {
  let client: AnthropicClient;
  let fetchMock: any;

  beforeEach(() => {
    client = new AnthropicClient("http://test.local", "test-key");
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send correct request", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: message_stop\ndata: {}\n\n"));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(mockStream, { status: 200 }));

    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];
    const tools = {};
    const options = { model: "claude-3", maxTokens: 1024 };

    const events = [];
    for await (const event of client.chat(messages, tools, options)) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "http://test.local/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("claude-3");
    expect(body.max_tokens).toBe(1024);
  });

  it("should throw on HTTP error", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Request", { status: 400 }));

    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    await expect(async () => {
      for await (const event of client.chat(messages, {}, { model: "test" })) {
        // should not reach here
      }
    }).rejects.toThrow("Anthropic API error");
  });

  it("should handle abort signal", async () => {
    const abortController = new AbortController();

    fetchMock.mockRejectedValue(new DOMException("Aborted", "AbortError"));

    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    abortController.abort();

    await expect(async () => {
      for await (const event of client.chat(
        messages,
        {},
        { model: "test" },
        abortController.signal,
      )) {
        // should not reach here
      }
    }).rejects.toThrow("Request cancelled");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/client.test.ts
```

预期：FAIL - AnthropicClient 未定义

- [ ] **Step 3: 实现客户端主类**

```typescript
// src/main/llm/providers/anthropic/client.ts
import type { LLMClient, StreamEvent, ChatOptions } from "@/llm/core/types";
import type { Tool } from "@/llm/core/types";
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";
import { LLMError } from "@/llm/core/errors";
import { buildAnthropicRequest } from "./requestBuilder";
import { parseAnthropicStream } from "./streamParser";

/**
 * Anthropic 客户端
 */
export class AnthropicClient implements LLMClient {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
  ) {}

  async *chat(
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    options: ChatOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const requestBody = buildAnthropicRequest(messages, tools, options);

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/v1/messages`, {
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new LLMError("aborted", "Request cancelled");
      }
      throw err;
    }

    yield* parseAnthropicStream(response);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test src/main/llm/providers/anthropic/__tests__/client.test.ts
```

预期：PASS

- [ ] **Step 5: 提交客户端主类**

```bash
git add src/main/llm/providers/anthropic/client.ts src/main/llm/providers/anthropic/__tests__/client.test.ts
git commit -m "feat(llm): add Anthropic client with tests"
```

---

## Task 7: Factory 与导出

**Files:**

- Create: `src/main/llm/factory.ts`
- Create: `src/main/llm/index.ts`

- [ ] **Step 1: 实现 factory 函数**

```typescript
// src/main/llm/factory.ts
import type { LLMClient, LLMClientConfig } from "./core/types";
import { AnthropicClient } from "./providers/anthropic/client";

/**
 * 创建 LLM 客户端
 *
 * @param provider - 厂商名称（目前仅支持 'anthropic'）
 * @param config - 客户端配置
 * @returns LLMClient 实例
 */
export function createLLMClient(provider: string, config: LLMClientConfig): LLMClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(config.baseURL, config.apiKey);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
```

- [ ] **Step 2: 实现公共导出**

```typescript
// src/main/llm/index.ts
export { createLLMClient } from "./factory";
export type {
  LLMClient,
  StreamEvent,
  ChatOptions,
  Tool,
  Usage,
  LLMClientConfig,
} from "./core/types";
export { LLMError } from "./core/errors";
export type { LLMErrorType } from "./core/errors";
```

- [ ] **Step 3: 提交 factory 与导出**

```bash
git add src/main/llm/factory.ts src/main/llm/index.ts
git commit -m "feat(llm): add factory and public exports"
```

---

## Task 8: 集成到 agentChatPresenter

**Files:**

- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts:1-20` (imports)
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts:63-69` (createModel → createClient)
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts:83-138` (collectStreamResult)
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts:267-273` (主循环调用)

- [ ] **Step 1: 更新 imports**

在 `agentChatPresenter.ts` 开头：

```typescript
// 删除这两行
- import { streamText } from "ai";
- import { createAnthropic } from "@ai-sdk/anthropic";

// 新增
+ import { createLLMClient } from "@/llm";
+ import type { LLMClient } from "@/llm";
```

- [ ] **Step 2: 替换 createModel 方法**

找到 `private createModel(groupName: string)` 方法，替换为：

```typescript
private createClient(): LLMClient {
  return createLLMClient('anthropic', {
    baseURL: `http://127.0.0.1:${this.gatewayPresenter.getPort()}`,
    apiKey: this.gatewayPresenter.getInternalKey()
  })
}
```

- [ ] **Step 3: 重写 collectStreamResult 方法**

完整替换 `collectStreamResult` 方法：

```typescript
private async collectStreamResult(
  client: LLMClient,
  messages: CoreMessage[],
  tools: Record<string, any>,
  options: { model: string; maxTokens?: number },
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
        currentContentBlock.content = (currentContentBlock.content || '') + event.text
        this.pushToRenderer(sessionId, messageId, blocks)
        break

      case 'tool_call_start':
        blocks.push({
          type: 'tool_call',
          id: event.id,
          content: '',
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
        break

      case 'usage':
        // 可选：记录 token 使用情况
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

- [ ] **Step 4: 更新主循环调用**

找到 `chat()` 方法中的主循环，替换 streamText 调用：

```typescript
// 在循环开始前创建 client（第 248 行附近）
const client = this.createClient()

// 在 while 循环内（第 267 行附近）
// 删除：
- const result = streamText({
-   model,
-   messages: messages as any,
-   tools: tools as any,
-   abortSignal: abortController.signal,
-   maxOutputTokens: config?.maxTokens ?? agent?.config?.maxTokens ?? undefined,
- });

- const { textContent, toolCalls } = await this.collectStreamResult(
-   result,
-   sessionId,
-   assistantMessageId,
-   blocks,
-   abortController.signal,
- );

// 替换为：
+ const { textContent, toolCalls } = await this.collectStreamResult(
+   client,
+   messages,
+   tools,
+   { model: groupName, maxTokens: config?.maxTokens ?? agent?.config?.maxTokens },
+   sessionId,
+   assistantMessageId,
+   blocks,
+   abortController.signal
+ )
```

- [ ] **Step 5: 运行类型检查**

```bash
pnpm run typecheck
```

预期：PASS - 无类型错误

- [ ] **Step 6: 提交集成改造**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(llm): integrate custom LLM client into agentChatPresenter"
```

---

## Task 9: 移除 AI SDK 依赖

**Files:**

- Modify: `package.json`

- [ ] **Step 1: 移除依赖包**

```bash
pnpm remove ai @ai-sdk/anthropic @ai-sdk/openai
```

- [ ] **Step 2: 验证移除**

检查 `package.json` 确认以下依赖已移除：

- `"ai": "^6.0.168"`
- `"@ai-sdk/anthropic": "^3.0.71"`
- `"@ai-sdk/openai": "^3.0.53"`

- [ ] **Step 3: 重新安装依赖**

```bash
pnpm install
```

- [ ] **Step 4: 运行类型检查确认无遗漏**

```bash
pnpm run typecheck
```

预期：PASS - 无引用 AI SDK 的错误

- [ ] **Step 5: 提交依赖移除**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove AI SDK dependencies"
```

---

## Task 10: 端到端测试

**Files:**

- Test: Manual E2E testing

- [ ] **Step 1: 启动开发环境**

```bash
pnpm run dev
```

- [ ] **Step 2: 测试单轮对话**

在 Chatroom 中测试：

1. 发送消息："Hello, who are you?"
2. 验证：收到流式响应，文本逐字显示

预期：✅ 正常响应

- [ ] **Step 3: 测试 tool call**

发送消息："Read the file CLAUDE.md"

1. 验证：显示 tool_call block（loading → success）
2. 验证：显示工具执行结果
3. 验证：收到最终回复

预期：✅ Tool call 正常执行

- [ ] **Step 4: 测试多轮 agentic loop**

发送消息："List all files in src/main/llm, then read the first TypeScript file"

1. 验证：执行多个 tool call
2. 验证：agentic loop 正常迭代
3. 验证：最终给出总结

预期：✅ 多轮对话正常

- [ ] **Step 5: 测试 abort**

发送一个长消息，在响应过程中点击"停止"

1. 验证：流式响应立即停止
2. 验证：状态切换为 idle
3. 验证：可以发送新消息

预期：✅ Abort 正常工作

- [ ] **Step 6: 检查 Gateway 日志**

打开 Gateway → 日志 tab：

1. 验证：`raw_request_body` 字段存在
2. 验证：请求格式干净（无 `<system-reminder>` 标签）
3. 验证：system 字段独立存在
4. 验证：messages 格式标准

预期：✅ 日志格式正确

- [ ] **Step 7: 记录测试结果**

创建测试报告：

```bash
echo "## E2E Test Results

- [x] 单轮对话正常
- [x] Tool call 正常
- [x] 多轮 agentic loop 正常
- [x] Abort 功能正常
- [x] Gateway 日志格式正确

测试时间：$(date)
测试环境：开发模式 (pnpm run dev)
" > docs/superpowers/plans/2026-04-29-remove-ai-sdk-test-report.md
```

- [ ] **Step 8: 提交测试报告**

```bash
git add docs/superpowers/plans/2026-04-29-remove-ai-sdk-test-report.md
git commit -m "test: add E2E test report for LLM client"
```

---

## Task 11: 补充边缘情况测试

**Files:**

- Create: `src/main/llm/__tests__/edgeCases.test.ts`

- [ ] **Step 1: 编写边缘情况测试**

```typescript
// src/main/llm/__tests__/edgeCases.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLLMClient } from "../factory";
import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";

describe("LLM Client Edge Cases", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it("should handle large response (4096+ tokens)", async () => {
    const largeText = "a".repeat(20000); // ~5000 tokens
    const mockStream = new ReadableStream({
      start(controller) {
        // 分多个 chunk 发送
        for (let i = 0; i < largeText.length; i += 100) {
          const chunk = largeText.slice(i, i + 100);
          controller.enqueue(
            new TextEncoder().encode(
              `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text: chunk } })}\n\n`,
            ),
          );
        }
        controller.enqueue(new TextEncoder().encode("event: message_stop\ndata: {}\n\n"));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(mockStream, { status: 200 }));

    const client = createLLMClient("anthropic", { baseURL: "http://test", apiKey: "test" });
    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    let fullText = "";
    for await (const event of client.chat(messages, {}, { model: "test" })) {
      if (event.type === "text") {
        fullText += event.text;
      }
    }

    expect(fullText).toBe(largeText);
  });

  it("should handle network timeout", async () => {
    fetchMock.mockRejectedValue(new Error("Network timeout"));

    const client = createLLMClient("anthropic", { baseURL: "http://test", apiKey: "test" });
    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    await expect(async () => {
      for await (const event of client.chat(messages, {}, { model: "test" })) {
        // should not reach
      }
    }).rejects.toThrow("Network timeout");
  });

  it("should handle malformed SSE data", async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("event: content_block_delta\ndata: {invalid json}\n\n"),
        );
        controller.enqueue(
          new TextEncoder().encode(
            'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"ok"}}\n\n',
          ),
        );
        controller.enqueue(new TextEncoder().encode("event: message_stop\ndata: {}\n\n"));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(mockStream, { status: 200 }));

    const client = createLLMClient("anthropic", { baseURL: "http://test", apiKey: "test" });
    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    const events = [];
    for await (const event of client.chat(messages, {}, { model: "test" })) {
      events.push(event);
    }

    // 应该跳过畸形数据，继续解析后续事件
    expect(events).toContainEqual({ type: "text", text: "ok" });
  });

  it("should handle UTF-8 emoji", async () => {
    const text = "你好 👋 こんにちは";
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: "text_delta", text } })}\n\n`,
          ),
        );
        controller.enqueue(new TextEncoder().encode("event: message_stop\ndata: {}\n\n"));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue(new Response(mockStream, { status: 200 }));

    const client = createLLMClient("anthropic", { baseURL: "http://test", apiKey: "test" });
    const messages: CoreMessage[] = [{ role: "user", content: "Hi" }];

    let fullText = "";
    for await (const event of client.chat(messages, {}, { model: "test" })) {
      if (event.type === "text") {
        fullText += event.text;
      }
    }

    expect(fullText).toBe(text);
  });
});
```

- [ ] **Step 2: 运行边缘情况测试**

```bash
pnpm test src/main/llm/__tests__/edgeCases.test.ts
```

预期：PASS

- [ ] **Step 3: 提交边缘情况测试**

```bash
git add src/main/llm/__tests__/edgeCases.test.ts
git commit -m "test: add edge case tests for LLM client"
```

---

## Task 12: 运行完整测试套件

**Files:**

- Test: All tests

- [ ] **Step 1: 运行所有单元测试**

```bash
pnpm test src/main/llm
```

预期：所有测试 PASS

- [ ] **Step 2: 运行完整测试套件（包括现有测试）**

```bash
pnpm test
```

预期：所有测试 PASS（确认未破坏现有功能）

- [ ] **Step 3: 运行 lint 检查**

```bash
pnpm run lint
```

预期：PASS - 无 lint 错误

- [ ] **Step 4: 运行格式化检查**

```bash
pnpm run format:check
```

预期：PASS - 格式正确

- [ ] **Step 5: 如果格式检查失败，运行格式化**

```bash
pnpm run format
git add -u
git commit -m "style: format code"
```

- [ ] **Step 6: 运行类型检查**

```bash
pnpm run typecheck
```

预期：PASS - 无类型错误

- [ ] **Step 7: 生成测试覆盖率报告**

```bash
pnpm run test:coverage
```

查看覆盖率：

- `src/main/llm/core/sseParser.ts` - 目标 90%+
- `src/main/llm/providers/anthropic/streamParser.ts` - 目标 85%+
- `src/main/llm/providers/anthropic/requestBuilder.ts` - 目标 95%+
- `src/main/llm/providers/anthropic/client.ts` - 目标 80%+

---

## Task 13: 更新文档

**Files:**

- Modify: `docs/AGENTS.md` (或 `CLAUDE.md`)

- [ ] **Step 1: 更新架构文档**

在 `docs/AGENTS.md` 的"项目结构"部分添加：

```markdown
- `src/main/llm/`: 自研 LLM 客户端模块
  - `core/`: 通用核心（SSE 解析、类型、错误）
  - `providers/anthropic/`: Anthropic 客户端实现
  - `factory.ts`: createLLMClient 工厂函数
```

在"AI SDK v6 类型约定"部分删除，添加新章节：

```markdown
### LLM 客户端架构

Slime 使用自研 LLM 客户端（`src/main/llm/`），不依赖外部 AI SDK：

- **核心接口**：`LLMClient` 提供统一的 `chat()` AsyncGenerator 接口
- **流事件**：`StreamEvent` 包含 text/tool_call_start/tool_call_end/usage/error/done
- **SSE 解析**：使用 Web Streams API (TextDecoderStream) 处理 SSE 协议
- **多厂商扩展**：通过 `providers/` 目录支持多厂商（当前：Anthropic）
- **日志真实性**：记录的请求体就是实际发送的，无中间转换

**新增厂商流程**：

1. 创建 `providers/<vendor>/` 目录
2. 实现 `client.ts`, `streamParser.ts`, `requestBuilder.ts`
3. 在 `factory.ts` 注册
4. 复用 `core/sseParser` 和 `core/types`
```

- [ ] **Step 2: 提交文档更新**

```bash
git add docs/AGENTS.md
git commit -m "docs: update architecture with custom LLM client"
```

---

## Task 14: 最终验证与发布

**Files:**

- Verify: Complete system

- [ ] **Step 1: 完整构建测试**

```bash
pnpm run build
```

预期：构建成功，无错误

- [ ] **Step 2: 启动打包后的应用**

```bash
pnpm start
```

在打包模式下测试：

1. 单轮对话
2. Tool call
3. 多轮对话
4. Abort
5. Gateway 日志

预期：所有功能正常

- [ ] **Step 3: 检查打包体积**

```bash
du -sh dist/
```

对比移除 AI SDK 前后的 dist 体积，预期减少 ~5-10MB

- [ ] **Step 4: 创建 PR 或合并分支**

```bash
# 如果在 worktree 中开发
git log --oneline | head -20  # 查看所有 commits

# 合并到主分支（或创建 PR）
git checkout main
git merge <branch-name>  # 或通过 PR 流程
```

- [ ] **Step 5: 标记完成**

创建标签：

```bash
git tag -a v0.4.0-remove-ai-sdk -m "feat: remove AI SDK, implement custom LLM client"
git push origin v0.4.0-remove-ai-sdk
```

---

## 自审检查清单

**Spec 覆盖检查**：

- [x] 核心类型定义 (Task 1)
- [x] SSE 解析器 (Task 2)
- [x] Anthropic 请求构建 (Task 4)
- [x] Anthropic 流解析 (Task 5)
- [x] Anthropic 客户端 (Task 6)
- [x] Factory 与导出 (Task 7)
- [x] 集成到 agentChatPresenter (Task 8)
- [x] 移除 AI SDK 依赖 (Task 9)
- [x] 端到端测试 (Task 10)
- [x] 边缘情况测试 (Task 11)
- [x] 文档更新 (Task 13)

**占位符扫描**：无 TBD/TODO

**类型一致性**：

- `StreamEvent` 类型在所有使用位置一致
- `LLMClient` 接口在 factory 和 client 中一致
- `CoreMessage` 引用统一从 `contextBuilder` 导入

**测试覆盖**：

- SSE 解析器：单元测试 + 边界测试
- 请求构建器：单元测试（4 个场景）
- 流解析器：单元测试（4 个场景）
- 客户端：单元测试 + 边缘情况测试
- 集成：端到端手动测试

**验证清单**：

- [ ] 所有单元测试通过
- [ ] 类型检查通过
- [ ] Lint 检查通过
- [ ] 格式化检查通过
- [ ] 端到端测试通过
- [ ] 打包构建成功
- [ ] 文档更新完成

---

## 预估工作量

| Task       | 预估时间 | 实际时间 |
| ---------- | -------- | -------- |
| Task 1-3   | 1 天     |          |
| Task 4-5   | 1.5 天   |          |
| Task 6-7   | 1 天     |          |
| Task 8-9   | 1 天     |          |
| Task 10-11 | 1.5 天   |          |
| Task 12-14 | 1 天     |          |
| **总计**   | **7 天** |          |

---

## 执行说明

本计划共 14 个 Task，每个 Task 分为 3-8 个步骤。

建议执行方式：

1. **Subagent-Driven**（推荐）：每个 Task 派发一个 subagent，完成后 review
2. **Inline Execution**：在当前 session 中按顺序执行，每 2-3 个 Task 后 review

**关键检查点**：

- Task 2 完成后：验证 SSE 解析器正确性
- Task 6 完成后：验证 Anthropic 客户端完整性
- Task 9 完成后：验证 AI SDK 完全移除
- Task 10 完成后：验证端到端功能正常
- Task 14 完成后：验证打包构建成功
