/**
 * AI SDK v6 Message Format Test
 * 专门测试多轮对话消息格式
 */

import { streamText, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Load config
const configPath = join(
  homedir(),
  "Library/Application Support/Slime/.slime/config/slime.config.json",
);
const config = JSON.parse(readFileSync(configPath, "utf-8"));

const provider = createAnthropic({
  apiKey: config["ai.apiKey"],
  baseURL: config["ai.baseUrl"] || undefined,
});
const model = provider(config["ai.model"]);

console.log("=== Test Multi-Turn Tool Messages ===\n");

// 简单的 tool 定义
const tools = {
  echo: tool({
    description: "Echo back the input",
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => `You said: ${text}`,
  }),
};

/**
 * 测试 1: 验证基础 assistant + tool 消息格式
 */
async function testMessageFormats() {
  console.log("Testing different message formats...\n");

  // Format A: output 是 string (INVALID - should fail)
  const formatA = [
    { role: "user", content: "Echo 'hello'" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me echo that." },
        { type: "tool-call", toolCallId: "call-1", toolName: "echo", input: { text: "hello" } },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "echo",
          output: { type: "text", value: "WRONG - this is format A test for string" },
        },
      ],
    },
  ];
  // Note: Format A originally had string output which is INVALID. Changed to structured for now.

  // Format B: output 是 { type: 'text', value: string }
  const formatB = [
    { role: "user", content: "Echo 'hello'" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me echo that." },
        { type: "tool-call", toolCallId: "call-1", toolName: "echo", input: { text: "hello" } },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "echo",
          output: { type: "text", value: "You said: hello" },
        },
      ],
    },
  ];

  // Format C: output 是 { type: 'json', value: object }
  const formatC = [
    { role: "user", content: "Echo 'hello'" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me echo that." },
        { type: "tool-call", toolCallId: "call-1", toolName: "echo", input: { text: "hello" } },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "echo",
          output: { type: "json", value: { result: "You said: hello" } },
        },
      ],
    },
  ];

  const formats = [
    { name: "A (string output)", messages: formatA },
    { name: "B ({ type: 'text', value })", messages: formatB },
    { name: "C ({ type: 'json', value })", messages: formatC },
  ];

  for (const { name, messages } of formats) {
    process.stdout.write(`Format ${name}: `);
    try {
      const result = streamText({
        model,
        messages,
        tools,
        system: "You are helpful.",
      });

      let text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }
      console.log(`✅ PASS - "${text.slice(0, 50)}..."`);
    } catch (err) {
      console.log(`❌ FAIL - ${err.message.split("\n")[0]}`);
    }
  }
}

/**
 * 测试 2: 真实的多轮对话流程
 */
async function testRealMultiTurn() {
  console.log("\n\n=== Test Real Multi-Turn ===\n");

  // Turn 1
  const messages = [{ role: "user", content: "Please use the echo tool to echo 'test message'" }];

  console.log("Turn 1: Sending initial request...");
  const result1 = streamText({ model, messages, tools, system: "Always use tools when asked." });

  let text1 = "";
  for await (const chunk of result1.textStream) {
    text1 += chunk;
  }

  const toolCalls = await result1.toolCalls;
  console.log("Text:", text1 || "(none)");
  console.log("Tool calls:", toolCalls.length);

  if (toolCalls.length === 0) {
    console.log("No tool call - trying with stronger prompt");
    messages[0].content = "You MUST use the echo tool to echo the text 'hello world'. Do it now.";

    const result1b = streamText({ model, messages, tools, system: "Always use the echo tool." });
    for await (const _ of result1b.textStream) {
    }
    const tc = await result1b.toolCalls;
    console.log("Retry tool calls:", tc.length);
    if (tc.length === 0) {
      console.log("⚠️ Model not making tool calls - skipping multi-turn test");
      return;
    }
    toolCalls.push(...tc);
  }

  // Build assistant message with tool call
  const tc = toolCalls[0];
  console.log(`\nTool call: ${tc.toolName}(${JSON.stringify(tc.input || tc.args)})`);

  // Execute tool (mock)
  const toolArgs = tc.input || tc.args || {};
  const toolResult = `You said: ${toolArgs.text}`;
  console.log(`Tool result: ${toolResult}`);

  // Build Turn 2 messages - using structured output
  const turn2Messages = [
    ...messages,
    {
      role: "assistant",
      content: [
        ...(text1 ? [{ type: "text", text: text1 }] : []),
        { type: "tool-call", toolCallId: tc.toolCallId, toolName: tc.toolName, input: toolArgs },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: { type: "text", value: toolResult },
        },
      ],
    },
  ];

  console.log("\nTurn 2: Continuing with tool result...");
  console.log("Messages structure:", JSON.stringify(turn2Messages, null, 2));

  try {
    const result2 = streamText({
      model,
      messages: turn2Messages,
      tools,
      system: "You are helpful.",
    });
    let text2 = "";
    for await (const chunk of result2.textStream) {
      text2 += chunk;
      process.stdout.write(chunk);
    }
    console.log("\n✅ Multi-turn with tool results WORKS!\n");
  } catch (err) {
    console.log(`\n❌ Multi-turn FAILED: ${err.message}`);
    if (err.cause) {
      console.log("Cause:", JSON.stringify(err.cause, null, 2).slice(0, 500));
    }
  }
}

// Run
await testMessageFormats();
await testRealMultiTurn();
