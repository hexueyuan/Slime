# Prompt Caching 诊断报告

## 背景

Slime 使用百度 OneApi 供应商（后端为 AWS Bedrock）调用 Claude 模型。本次诊断验证 prompt caching 的行为。

## 关键结论

### 1. 缓存机制正常工作

百度 OneApi（Bedrock）完整支持 prompt caching，`cache_control` 通过 block-level explicit breakpoints 方式生效。验证结果：

```
第1次：cache_creation=3636  cache_read=0    （写入缓存）
第2次：cache_creation=0     cache_read=3636  （命中缓存）
```

### 2. 正确的 cache_control 打法

参照 Claude Code 实际生效的请求格式：

```json
{
  "system": [
    {"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": "...长内容...", "cache_control": {"type": "ephemeral"}}
  ],
  "tools": [...],
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "<system-reminder>...</system-reminder>", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": "用户实际输入"}
      ]
    }
  ]
}
```

**关键点：**

- system 必须是数组格式（非字符串），每个 block 打 `cache_control`
- tools 上**不打** `cache_control`（Bedrock 行为，Claude Code 也未打）
- messages 最新 user 消息的 system-reminder block 打 `cache_control`
- **不使用顶层 `cache_control`**（Bedrock 不支持，会返回 500）

### 3. 最小 token 阈值

Anthropic 要求缓存断点之前的内容至少 **1024 tokens**（约 4096 字符）。
内容不足时请求正常返回，但 `cache_creation_input_tokens` 和 `cache_read_input_tokens` 均为 0，无报错。

### 4. Bedrock 负载均衡现象

百度 OneApi 后端有多个 Bedrock 节点轮询，每个节点缓存独立，导致连续请求出现交替写入/命中的模式：

```
第1次 → 节点A：cache_creation=3636  cache_read=0
第2次 → 节点B：cache_creation=3636  cache_read=0  （节点B没有A的缓存）
第3次 → 节点A：cache_creation=0     cache_read=3636
第4次 → 节点B：cache_creation=0     cache_read=3636
```

这是代理层负载均衡的正常现象，不影响整体缓存效果（每个节点第2次起均命中）。

### 5. 顶层 cache_control 不兼容 Bedrock

```bash
# 报错：ValidationException: cache_control: Extra inputs are not permitted
curl ... -d '{"cache_control": {"type": "ephemeral"}, "model": "...", ...}'
```

Anthropic 官方 API 支持顶层 `cache_control`（automatic caching），但 Bedrock 不支持。
Slime Agent Chat 应始终使用 explicit block-level breakpoints。

## Slime 当前代码状态

### 正确的部分

- `contextBuilder.ts` `buildSystemBlocks()`：system 数组格式，最后一个 block 打 `cache_control` ✓
- `contextBuilder.ts` `markHistoryCacheBreakpoint()`：历史倒数第二轮 assistant 打 `cache_control` ✓
- `contextBuilder.ts` `buildContext()` agent 路径：新 user message 的 system-reminder block 打 `cache_control` ✓
- Gateway inbound/outbound：完整透传 `cache_control`，无阻断 ✓

### 需要注意的地方

- `requestBuilder.ts` 曾在最后一个 tool 上打 `cache_control`，已移除：
  - tools 上的断点浪费一个 slot（Anthropic 最多 4 个），Claude Code 实际也不打
  - 缓存效果由 system blocks + messages user block + history assistant 三个断点覆盖
- Agent chat system 内容较短时（< 1024 tokens）缓存不生效，是预期行为；
  当 agent 有较长的 PROMPT.md 时，缓存自然生效

## 诊断脚本

```bash
# 列出所有 anthropic channels
node --experimental-sqlite docs/test-cache.mjs --list

# 指定 channel 和 model 测试
node --experimental-sqlite docs/test-cache.mjs --channel 5 --model "Claude Sonnet 4.6"
```
