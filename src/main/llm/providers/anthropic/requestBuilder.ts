import type { CoreMessage } from "@/presenter/agentChat/contextBuilder";
import type { Tool, ChatOptions } from "@/llm/core/types";
import type {
  AnthropicRequestBody,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
} from "./types";

export function buildAnthropicRequest(
  messages: CoreMessage[],
  tools: Record<string, Tool>,
  options: ChatOptions,
): AnthropicRequestBody {
  // 提取 system 消息
  let system: string | undefined;
  const filtered = messages.filter((m) => {
    if (m.role === "system") {
      system = m.content as string;
      return false;
    }
    return true;
  });

  // 转换 tools
  let anthropicTools: AnthropicTool[] | undefined;
  const toolEntries = Object.entries(tools);
  if (toolEntries.length > 0) {
    anthropicTools = toolEntries.map(([name, tool]) => ({
      name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  // 转换消息
  const anthropicMessages: AnthropicMessage[] = filtered.map((m) => convertMessage(m));

  return {
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
    system,
    messages: anthropicMessages,
    tools: anthropicTools,
    temperature: options.temperature,
  };
}

function convertMessage(m: CoreMessage): AnthropicMessage {
  if (m.role === "system") {
    return { role: "user", content: m.content };
  }

  if (m.role === "user") {
    return { role: "user", content: m.content };
  }

  if (m.role === "tool") {
    // tool results → user 消息（Anthropic 要求）
    const blocks: AnthropicContentBlock[] = m.content.map((part) => ({
      type: "tool_result" as const,
      tool_use_id: part.toolCallId,
      content: extractOutputValue(part.output),
    }));
    return { role: "user", content: blocks };
  }

  // assistant
  if (typeof m.content === "string") {
    return { role: "assistant", content: m.content };
  }

  const blocks: AnthropicContentBlock[] = m.content.map((part) => {
    if (part.type === "tool-call") {
      return {
        type: "tool_use" as const,
        id: part.toolCallId as string,
        name: part.toolName as string,
        input: part.input,
      };
    }
    // text / reasoning_content 等
    return { type: "text" as const, text: String(part.text ?? "") };
  });
  return { role: "assistant", content: blocks };
}

function extractOutputValue(output: unknown): string {
  if (output && typeof output === "object" && "value" in output) {
    return String((output as { value: unknown }).value);
  }
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}
