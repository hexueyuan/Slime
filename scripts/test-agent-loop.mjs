/**
 * AI SDK v6 Agent Loop Test Script
 * 测试多轮对话和工具调用的正确消息格式
 *
 * Usage: node scripts/test-agent-loop.mjs
 */

import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Read config from Slime's config file
const configPath = join(
  homedir(),
  "Library/Application Support/Slime/.slime/config/slime.config.json",
);
let slimeConfig = {};
try {
  slimeConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  console.log("Loaded config from:", configPath);
} catch (e) {
  console.warn("Could not load Slime config:", e.message);
}

const PROVIDER = slimeConfig["ai.provider"] || "anthropic";
const API_KEY = slimeConfig["ai.apiKey"] || "";
const BASE_URL = slimeConfig["ai.baseUrl"] || "";
const MODEL = slimeConfig["ai.model"] || "claude-sonnet-4-20250514";

if (!API_KEY) {
  console.error("Error: No API key found in Slime config");
  process.exit(1);
}

console.log("=== AI SDK v6 Agent Loop Test ===");
console.log(`Provider: ${PROVIDER}`);
console.log(`Model: ${MODEL}`);
console.log(`Base URL: ${BASE_URL || "(default)"}`);
console.log("");

// Create provider based on config
function createModel() {
  if (PROVIDER === "anthropic") {
    const p = createAnthropic({
      apiKey: API_KEY,
      baseURL: BASE_URL || undefined,
    });
    return p(MODEL);
  }
  const p = createOpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL || undefined,
  });
  return p(MODEL);
}
const model = createModel();

// Define a simple tool with inputSchema (AI SDK v6)
const tools = {
  calculate: tool({
    description: "Calculate a simple math expression",
    inputSchema: z.object({
      expression: z.string().describe("Math expression like '2+2'"),
    }),
    execute: async ({ expression }) => {
      try {
        // Simple eval for testing (not safe for production)
        const result = eval(expression);
        return { type: "json", value: { result: String(result) } };
      } catch (e) {
        return { type: "error-text", value: `Error: ${e.message}` };
      }
    },
  }),
  get_weather: tool({
    description: "Get weather for a city",
    inputSchema: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async ({ city }) => {
      // Mock weather data
      return {
        type: "json",
        value: { city, temperature: "25°C", condition: "sunny" },
      };
    },
  }),
};

/**
 * Test 1: Single turn text-only
 */
async function test1_SingleTurnText() {
  console.log("--- Test 1: Single Turn Text ---");

  const messages = [{ role: "user", content: "Say hello in 5 words or less." }];

  const result = streamText({
    model,
    messages,
    system: "You are a helpful assistant. Be concise.",
  });

  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
    process.stdout.write(chunk);
  }
  console.log("\n✅ Test 1 passed - text stream works\n");
  return true;
}

/**
 * Test 2: Single turn with tool call
 */
async function test2_SingleTurnToolCall() {
  console.log("--- Test 2: Single Turn Tool Call ---");

  const messages = [{ role: "user", content: "Calculate 15 + 27 using the calculate tool." }];

  const result = streamText({
    model,
    messages,
    tools,
    system: "You are a helpful assistant. Use tools when appropriate.",
  });

  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
    process.stdout.write(chunk);
  }
  console.log("");

  const toolCalls = await result.toolCalls;
  console.log("Tool calls:", JSON.stringify(toolCalls, null, 2));

  if (toolCalls.length > 0) {
    console.log("✅ Test 2 passed - tool call detected\n");
    return { text, toolCalls };
  } else {
    console.log("⚠️ Test 2: No tool call made (model may not support tools)\n");
    return null;
  }
}

/**
 * Test 3: Multi-turn with tool results
 * This tests the correct message format for continuing after tool execution
 */
async function test3_MultiTurnWithToolResults() {
  console.log("--- Test 3: Multi-Turn with Tool Results ---");

  // First turn: user asks for calculation
  const messages = [{ role: "user", content: "What is 100 + 200? Use the calculate tool." }];

  console.log("Turn 1: Getting tool call...");
  const result1 = streamText({
    model,
    messages,
    tools,
    system: "You are a helpful assistant. Always use the calculate tool for math.",
  });

  let text1 = "";
  for await (const chunk of result1.textStream) {
    text1 += chunk;
  }
  console.log("Text:", text1 || "(no text)");

  const toolCalls1 = await result1.toolCalls;
  console.log("Tool calls:", JSON.stringify(toolCalls1, null, 2));

  if (toolCalls1.length === 0) {
    console.log("⚠️ Test 3 skipped: Model didn't make a tool call\n");
    return null;
  }

  // Build AI SDK v6 CoreMessage format for assistant with tool calls
  // CRITICAL: Use 'input' not 'args' for ToolCallPart
  const assistantContent = [];
  if (text1) {
    assistantContent.push({ type: "text", text: text1 });
  }
  for (const tc of toolCalls1) {
    assistantContent.push({
      type: "tool-call",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.args, // AI SDK returns 'args' but ToolCallPart wants 'input'
    });
  }

  // Build tool result message
  // CRITICAL: 'output' must be { type: 'text'|'json', value: ... } format
  const toolResults = [];
  for (const tc of toolCalls1) {
    // Execute the tool manually (not via SDK's execute)
    let toolResult;
    if (tc.toolName === "calculate") {
      try {
        const expr = tc.args.expression || tc.input?.expression;
        const result = eval(expr);
        toolResult = { type: "json", value: { result: String(result) } };
      } catch (e) {
        toolResult = { type: "error-text", value: e.message };
      }
    } else if (tc.toolName === "get_weather") {
      const city = tc.args.city || tc.input?.city;
      toolResult = { type: "json", value: { city, temp: "25C", condition: "sunny" } };
    }
    console.log(`Executed ${tc.toolName}:`, toolResult);

    toolResults.push({
      type: "tool-result",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      output: toolResult, // Already in { type, value } format
    });
  }

  // Build multi-turn messages
  const multiTurnMessages = [
    ...messages,
    { role: "assistant", content: assistantContent },
    { role: "tool", content: toolResults },
  ];

  console.log("\nMulti-turn messages structure:");
  console.log(JSON.stringify(multiTurnMessages, null, 2));

  console.log("\nTurn 2: Continuing with tool results...");
  try {
    const result2 = streamText({
      model,
      messages: multiTurnMessages,
      tools,
      system: "You are a helpful assistant.",
    });

    let text2 = "";
    for await (const chunk of result2.textStream) {
      text2 += chunk;
      process.stdout.write(chunk);
    }
    console.log("");
    console.log("✅ Test 3 passed - multi-turn with tool results works!\n");
    return true;
  } catch (err) {
    console.error("❌ Test 3 failed:", err.message);
    if (err.cause) {
      console.error("Cause:", JSON.stringify(err.cause, null, 2));
    }
    return false;
  }
}

/**
 * Test 4: Multi-turn with string tool output (common pattern)
 * Some implementations return strings instead of { type, value }
 */
async function test4_StringToolOutput() {
  console.log("--- Test 4: String Tool Output Format ---");

  // Test if string output works (simpler format)
  const messages = [
    { role: "user", content: "Hello" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me check something." },
        {
          type: "tool-call",
          toolCallId: "test-1",
          toolName: "get_weather",
          input: { city: "Beijing" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "test-1",
          toolName: "get_weather",
          // Try plain string first
          output: JSON.stringify({ city: "Beijing", temp: "20C" }),
        },
      ],
    },
  ];

  console.log("Testing with string output...");
  try {
    const result = streamText({
      model,
      messages,
      tools,
      system: "You are a helpful assistant.",
    });

    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    console.log("Response:", text);
    console.log("✅ Test 4a passed - string output accepted\n");
    return "string";
  } catch (err) {
    console.log("String output failed:", err.message);
  }

  // Try structured format
  console.log("Testing with structured output { type: 'text', value }...");
  messages[2].content[0].output = {
    type: "text",
    value: JSON.stringify({ city: "Beijing", temp: "20C" }),
  };

  try {
    const result = streamText({
      model,
      messages,
      tools,
      system: "You are a helpful assistant.",
    });

    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    console.log("Response:", text);
    console.log("✅ Test 4b passed - structured output accepted\n");
    return "structured";
  } catch (err) {
    console.error("❌ Test 4 failed:", err.message);
    if (err.cause) {
      console.error("Cause:", JSON.stringify(err.cause, null, 2));
    }
    return false;
  }
}

// Run all tests
async function runTests() {
  try {
    await test1_SingleTurnText();

    const test2Result = await test2_SingleTurnToolCall();

    if (test2Result) {
      await test3_MultiTurnWithToolResults();
    }

    const outputFormat = await test4_StringToolOutput();

    console.log("=== Summary ===");
    console.log(
      `Recommended output format: ${outputFormat === "string" ? "plain string" : "{ type: 'text'|'json', value }"}`,
    );
    console.log("");
    console.log("Key findings:");
    console.log("1. ToolCallPart uses 'input' (not 'args')");
    console.log("2. ToolResultPart.output format:", outputFormat);
    console.log("");
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
}

runTests();
