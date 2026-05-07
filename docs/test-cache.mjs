/**
 * Prompt Caching 诊断脚本
 * 直接从 SQLite 读取供应商配置，发送两次相同请求，验证缓存是否生效
 *
 * 用法:
 *   node --experimental-sqlite docs/test-cache.mjs --list
 *   node --experimental-sqlite docs/test-cache.mjs --channel 6 --model claude-opus-4-5-20251101
 */

import { homedir } from "os";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";

const dbPath = join(homedir(), "Library/Application Support/Slime/.slime/gateway.db");

// 解析命令行参数
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const hasFlag = (name) => args.includes(name);

function listChannels() {
  const db = new DatabaseSync(dbPath);
  const channels = db
    .prepare(`SELECT id, name, base_url FROM channels WHERE type = 'anthropic' AND enabled = 1`)
    .all();
  console.log("可用 anthropic channels:");
  for (const c of channels) {
    const key = db
      .prepare(`SELECT key FROM channel_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1`)
      .get(c.id);
    console.log(`  id=${c.id}  ${c.name}  ${c.base_url}  key=${key ? "有" : "无"}`);
    const models = db
      .prepare(`SELECT model_name FROM models WHERE channel_id = ? AND enabled = 1`)
      .all(c.id);
    if (models.length) console.log(`    models: ${models.map((m) => m.model_name).join(", ")}`);
  }
  db.close();
}

function readChannelConfig(channelId) {
  const db = new DatabaseSync(dbPath);
  try {
    const where = channelId
      ? `id = ${Number(channelId)} AND type = 'anthropic' AND enabled = 1`
      : `type = 'anthropic' AND enabled = 1 LIMIT 1`;
    const channel = db.prepare(`SELECT id, name, base_url FROM channels WHERE ${where}`).get();
    if (!channel) throw new Error(`没有找到 anthropic channel (id=${channelId ?? "任意"})`);

    const keyRow = db
      .prepare(`SELECT key FROM channel_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1`)
      .get(channel.id);
    if (!keyRow) throw new Error(`channel "${channel.name}" 没有可用的 API Key`);

    return { baseUrl: channel.base_url, apiKey: keyRow.key, channelName: channel.name };
  } finally {
    db.close();
  }
}

// 构造请求体（内容足够长以触发缓存，Anthropic 要求 system/tools 至少 1024 tokens）
function buildRequestBody(model) {
  const longSystemText = `You are HAL (Helpful AI Layer), a sophisticated AI assistant integrated into the Slime application. Your purpose is to help users accomplish their goals efficiently and effectively.

CAPABILITIES:
You have access to a comprehensive set of tools that allow you to interact with the system, execute code, manage files, browse the web, and coordinate with other AI agents. Use these capabilities judiciously and always explain what you are doing.

CORE PRINCIPLES:
1. Clarity: Always communicate clearly what you are doing and why
2. Safety: Never execute destructive operations without explicit confirmation
3. Efficiency: Use the most appropriate tool for each task
4. Accuracy: Verify information before presenting it as fact
5. Respect: Honor user preferences and system boundaries

TOOL USAGE GUIDELINES:
- read_file: Use to inspect existing files before modifying them
- write_file: Use to create or update files with new content
- edit_file: Use for targeted modifications to existing files
- execute_command: Use for system operations, always verify the command first
- web_fetch: Use to retrieve web content when needed
- ask_user: Use when you need clarification or confirmation from the user

INTERACTION STYLE:
Be concise but thorough. Provide context for your actions. Ask for clarification when requirements are ambiguous. Proactively identify potential issues before they become problems.

MEMORY AND CONTEXT:
You maintain awareness of the conversation history and can reference previous interactions. Use this context to provide consistent and coherent assistance throughout the session.

ERROR HANDLING:
When errors occur, diagnose the root cause before attempting fixes. Do not retry the same failed approach repeatedly. Consider alternative solutions and explain the tradeoffs.

SECURITY CONSIDERATIONS:
Never expose sensitive information like API keys or passwords. Be cautious with file system operations. Validate inputs before processing. Report potential security issues to the user.

EVOLUTION WORKFLOW:
The Slime application uses an evolution workflow where the AI can propose and implement changes to itself. This is a powerful feature that requires careful handling. Always verify changes before applying them. Use the evolution tools only when explicitly authorized by the user.

COLLABORATION:
You can work with other AI agents through the subagent system. When spawning subagents, provide clear context and instructions. Monitor subagent progress and handle failures gracefully.

CONTEXT MANAGEMENT:
Be aware of token limits when working with large codebases. Use file tools to read only the relevant parts. Summarize context when conversations become long. Prioritize recent and relevant information.

This system prompt provides the foundational context for your operation within the Slime ecosystem. Additional context may be provided through user messages and system updates during the conversation. Always refer back to these principles when making decisions.`;

  return {
    model: model ?? "claude-opus-4-5-20251101",
    max_tokens: 50,
    system: [
      {
        type: "text",
        text: longSystemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "read_file",
        description:
          "Read the contents of a file at the specified path. Returns the file content as a string. Use this tool to inspect existing files before making modifications.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "The absolute or relative path to the file" },
          },
          required: ["path"],
        },
      },
      {
        name: "write_file",
        description:
          "Write content to a file at the specified path. Creates the file if it does not exist, or overwrites it if it does. Use with caution as this operation is not easily reversible.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "The path where the file should be written" },
            content: { type: "string", description: "The content to write to the file" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "edit_file",
        description:
          "Make targeted edits to an existing file by replacing specific text. More precise than write_file for small changes. The old_string must match exactly what exists in the file.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the file to edit" },
            old_string: { type: "string", description: "The exact text to find and replace" },
            new_string: { type: "string", description: "The replacement text" },
          },
          required: ["path", "old_string", "new_string"],
        },
      },
      {
        name: "execute_command",
        description:
          "Execute a shell command in the working directory. Returns stdout and stderr. Only use for necessary operations.",
        input_schema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The command to execute" },
          },
          required: ["command"],
        },
      },
      {
        name: "web_fetch",
        description:
          "Fetch content from a URL. Returns the page content as text. Use for retrieving documentation, APIs, or web resources.",
        input_schema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to fetch" },
          },
          required: ["url"],
        },
      },
      {
        name: "ask_user",
        description:
          "Ask the user a question and wait for their response. Use when you need clarification or confirmation.",
        input_schema: {
          type: "object",
          properties: {
            question: { type: "string", description: "The question to ask the user" },
          },
          required: ["question"],
        },
        // cache_control 必须打在 tools 数组最后一个元素上
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "<system-reminder>This is a cache validation test. Ephemeral cache_control is applied to this block.</system-reminder>",
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: "Reply with exactly: cache test ok",
          },
        ],
      },
    ],
  };
}

async function sendRequest(baseUrl, apiKey, body, label) {
  const base = baseUrl.replace(/\/$/, "");
  // baseUrl 可能已含 /v1（如 https://api.example.com/v1）
  const url = base.endsWith("/v1") ? base + "/messages" : base + "/v1/messages";
  console.log(`\n[${label}] POST ${url}  model=${body.model}`);
  // 打印 cache_control 分布确认
  const systemCacheBlocks = (body.system ?? []).filter((b) => b.cache_control).length;
  const toolsCacheBlocks = (body.tools ?? []).filter((b) => b.cache_control).length;
  const msgCacheBlocks = (body.messages?.[0]?.content ?? []).filter((b) => b?.cache_control).length;
  console.log(
    `  cache_control分布: system=${systemCacheBlocks} tools=${toolsCacheBlocks} messages[0]=${msgCacheBlocks}`,
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(`[${label}] 请求失败 ${res.status}:`, JSON.stringify(json, null, 2));
    return null;
  }

  return json;
}

function printUsage(label, response) {
  if (!response) return;
  const usage = response.usage ?? {};
  console.log(`[${label}] usage:`);
  console.log(`  input_tokens:                ${usage.input_tokens ?? "N/A"}`);
  console.log(`  output_tokens:               ${usage.output_tokens ?? "N/A"}`);
  console.log(`  cache_creation_input_tokens: ${usage.cache_creation_input_tokens ?? 0}`);
  console.log(`  cache_read_input_tokens:     ${usage.cache_read_input_tokens ?? 0}`);
  if (response.content?.[0]?.text) {
    console.log(`  response: "${response.content[0].text.trim()}"`);
  }
}

// 主流程
if (hasFlag("--list")) {
  listChannels();
  process.exit(0);
}

try {
  console.log("=== Prompt Caching 诊断脚本 ===");
  console.log(`DB: ${dbPath}`);

  const channelId = getArg("--channel");
  const model = getArg("--model");

  const { baseUrl, apiKey, channelName } = readChannelConfig(channelId);
  console.log(`供应商: ${channelName} (${baseUrl})`);

  const body = buildRequestBody(model);

  const r1 = await sendRequest(baseUrl, apiKey, body, "第1次");
  printUsage("第1次", r1);

  if (!r1) process.exit(1);

  console.log("\n等待 1 秒...");
  await new Promise((r) => setTimeout(r, 1000));

  const r2 = await sendRequest(baseUrl, apiKey, body, "第2次");
  printUsage("第2次", r2);

  console.log("\n=== 结论 ===");
  const w = r1?.usage?.cache_creation_input_tokens ?? 0;
  const read = r2?.usage?.cache_read_input_tokens ?? 0;
  if (w > 0 && read > 0) {
    console.log("✓ 缓存正常：第1次写入，第2次命中");
  } else if (w > 0 && read === 0) {
    console.log("? 第1次写入缓存，但第2次未命中（可能 TTL 过期或请求不一致）");
  } else if (w === 0 && read > 0) {
    console.log("? 第2次命中但第1次未写入（意外状态）");
  } else {
    console.log("✗ 缓存未生效：两次均无缓存字段");
    console.log("  可能原因：");
    console.log("  1. 代理层未透传 anthropic-beta header");
    console.log("  2. token 数量不足（system/tools 合计至少 1024 tokens）");
    console.log("  3. 模型不支持 prompt caching（需要 claude-3.5/claude-3-opus 等）");
    console.log("  4. cache_control 字段被代理层过滤");
    console.log("  → 用 --list 查看可用 channels，--channel <id> --model <model-id> 指定测试目标");
  }
} catch (err) {
  console.error("错误:", err.message);
  process.exit(1);
}
