# AgentInvoker 上下文压缩设计

## 背景

`AgentInvoker` 是群聊系统的 agent 执行单元。在 agentic loop 中，每步执行会向 `llmMessages` 追加 `assistant + tool` 消息对。对于使用 `web_fetch`、`browser_*`、`read` 等大输出工具的 agent（如柯赛恩按照 baidu-search skill 抓取网页），工具结果会快速填满模型上下文窗口，导致 HTTP 413 / prompt-too-long 错误。

## 目标

- 防止 agentic loop 因上下文超限中断
- 不引入 LLM 摘要调用（不增加延迟、不套娃）
- 职责清晰：消息预处理在 `GroupChatPresenter`，执行在 `AgentInvoker`

## 不在范围内

- 单聊 `AgentChatPresenter` 的上下文压缩（独立问题）
- LLM 摘要压缩（未来可在 `GroupChatPresenter` 层扩展）
- 跨会话记忆注入（预留扩展点，本次不实现）

---

## 设计

### 两层压缩，两个位置

```
GroupChatPresenter.sendMessage()
  ├─ 查全量 GroupChatMessageRecord[]
  ├─ [Layer 0] 滑动窗口裁剪历史消息（保留最近 15 轮）
  └─ AgentInvoker.invoke({ messages: trimmedMessages })
       └─ _run():
            └─ while loop:
                 ├─ client.chat()
                 ├─ 收集 usage.inputTokens
                 ├─ [Layer 1] 微压缩（75% 触发，清旧 tool-result）
                 ├─ [Layer 2] 强制裁剪（90% 触发，丢最老 loop 轮次对）
                 └─ 继续下一步
```

---

### Layer 0：群聊历史滑动窗口

**位置**：`GroupChatPresenter.sendMessage()`，调 `invoke()` 前

**轮次定义**：`senderAgentId === null && hidden === false` 的消息为一个用户轮次的起点

**裁剪规则**：
- 统计用户轮次数，只保留最近 15 轮
- 每轮包含：该轮用户消息 + 同轮所有 agent 回复 + 同轮 hidden 消息
- 超出 15 轮的整轮丢弃（含该轮的全部消息）

**扩展点**：未来历史摘要、记忆注入等逻辑在此处、`invoke()` 调用前插入，`AgentInvoker` 不感知。

---

### Layer 1：微压缩（Micro-Compact）

**触发条件**：上一步 `usage.inputTokens >= CONTEXT_WINDOW * 0.75`（即 150,000 tokens）

**操作**：
- 从 `llmMessages` 中找所有 `role: "tool"` 消息
- 跳过最近 `KEEP_RECENT_STEPS = 4` 步的轮次（不动）
- 对更早的 tool 消息，把 `COMPACTABLE_TOOLS` 中工具的 output 替换为：
  ```
  [truncated: <tool_name> result cleared for context]
  ```
- 非 `COMPACTABLE_TOOLS` 的工具结果保留原样

**可压缩工具白名单**：
```typescript
const COMPACTABLE_TOOLS = new Set([
  'web_fetch',
  'read',
  'exec',
  'browser_get_text',
  'browser_screenshot',
  'browser_evaluate',
])
```

**特点**：纯字符串替换，<1ms，不破坏 tool-call/tool-result 配对。

---

### Layer 2：强制裁剪（Force Truncation）

**触发条件**：微压缩后 `estimatedTokens(llmMessages) >= CONTEXT_WINDOW * 0.90`（即 180,000 tokens）

微压缩后使用本地估算（`text.length / 4`）而非 API 精确值，因为此时还未发出新请求。

**操作**：
- 定位 `llmMessages` 中 loop 轮次区域（跳过不可压缩区域，见下）
- 按 `assistant + tool` 配对分组
- 保留最近 `KEEP_RECENT_STEPS = 4` 对，从最老的开始整对删除
- 每删一对重新估算，直到低于 90% 阈值或无可删对象

**整对操作保证**：一个 loop 步骤的 `assistant` 消息包含 tool-call，紧跟的 `tool` 消息包含 tool-result，必须同时删除，不能拆分。

---

### 不可压缩区域

两层压缩均跳过以下消息：

| 消息 | 内容 | 原因 |
|------|------|------|
| `system`（第1条） | identity + constraints | 静态身份定义 |
| `user`（第1条） | reminder blocks（additionalPrompt + skillsXML + groupContext） | 行为规则，缺失导致 agent 失去群聊感知 |
| `assistant`（第1条） | "好的，我已了解当前环境和设定。" | 与第1条 user 配对 |
| 历史群聊消息（`[Round N]` 轮次） | 群聊对话历史 | 已由 Layer 0 滑动窗口控制 |
| 最近 `KEEP_RECENT_STEPS = 4` 步的 loop 轮次 | 正在执行的任务上下文 | 防止切断正在进行的推理链 |

---

### 常量汇总

```typescript
const CONTEXT_WINDOW = 200_000
const MICRO_COMPACT_THRESHOLD = 0.75   // 150K tokens → 触发微压缩
const TRUNCATE_THRESHOLD = 0.90        // 180K tokens → 触发强制裁剪
const KEEP_RECENT_STEPS = 4            // 保护最近 N 步 loop 轮次
const COMPACTABLE_TOOLS = new Set([
  'web_fetch', 'read', 'exec',
  'browser_get_text', 'browser_screenshot', 'browser_evaluate',
])
```

---

### token 计数策略

- **触发微压缩**：用 API 返回的 `usage.inputTokens`（精确值，从 stream 的 `usage` 事件获取）
- **触发强制裁剪**：微压缩后用本地估算（`text.length / 4`），因为此时尚未发出新请求
- **`lastInputTokens`**：在 `_run()` 顶部维护，每步 stream 结束后更新

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/main/presenter/groupChatPresenter.ts` | `sendMessage()` 中添加滑动窗口裁剪逻辑 |
| `src/main/presenter/agentChat/agentInvoker.ts` | `_run()` 中添加 Layer 1/2 压缩；stream loop 中收集 `usage` 事件 |

不新增文件，不改动 `buildLLMMessages()` 签名，不改动数据库 schema。
