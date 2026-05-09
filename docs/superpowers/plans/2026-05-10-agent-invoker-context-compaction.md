# AgentInvoker 上下文压缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 防止 AgentInvoker agentic loop 因上下文超限（HTTP 413）中断，通过群聊历史滑动窗口 + loop 内微压缩 + 强制裁剪三层纯规则压缩实现。

**Architecture:** Layer 0 在 `GroupChatPresenter.sendMessage()` 调 `invoke()` 前裁剪历史消息（保留最近 15 轮）；Layer 1/2 在 `AgentInvoker._run()` while loop 内，每步用 API 返回的 `usage.inputTokens` 判断是否触发微压缩（75%）或强制裁剪（90%）。

**Tech Stack:** TypeScript, better-sqlite3, Anthropic streaming API (`usage` event)

---

## File Map

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `src/main/presenter/groupChatPresenter.ts` | Modify | `sendMessage()` 中调 `invoke()` 前裁剪历史消息到最近 15 轮 |
| `src/main/presenter/agentChat/agentInvoker.ts` | Modify | stream loop 收集 `usage` 事件；loop 结束后执行 Layer 1/2 压缩 |
| `test/main/presenter/groupChatPresenter.test.ts` | Create | Layer 0 滑动窗口单测 |
| `test/main/presenter/agentInvoker.test.ts` | Create | Layer 1 微压缩、Layer 2 强制裁剪单测 |

---

### Task 1: Layer 0 — GroupChatPresenter 滑动窗口裁剪

**Files:**
- Modify: `src/main/presenter/groupChatPresenter.ts:80-94`
- Create: `test/main/presenter/groupChatPresenter.test.ts`

**背景知识：**

`GroupChatMessageRecord` 的关键字段：
```typescript
interface GroupChatMessageRecord {
  id: string
  sessionId: string
  orderSeq: number
  senderAgentId: string | null  // null = 用户消息
  role: 'user' | 'assistant'
  content: string
  hidden: boolean               // true = 主持人隐藏指令
  createdAt: number
}
```

轮次定义：`senderAgentId === null && hidden === false` 的消息是一个用户轮次的起点。每轮包含该用户消息 + 其后、下一个用户消息之前的所有消息（含 hidden）。

- [ ] **Step 1: 写失败测试**

新建 `test/main/presenter/groupChatPresenter.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { trimToRecentRounds } from '../../../src/main/presenter/groupChatPresenter'
import type { GroupChatMessageRecord } from '../../../src/shared/types/groupChat'

function makeMsg(
  id: string,
  senderAgentId: string | null,
  hidden = false,
  orderSeq = 0,
): GroupChatMessageRecord {
  return {
    id,
    sessionId: 'sess',
    orderSeq,
    senderAgentId,
    role: senderAgentId === null ? 'user' : 'assistant',
    content: 'msg',
    hidden,
    createdAt: Date.now(),
  }
}

describe('trimToRecentRounds', () => {
  it('returns all messages when rounds <= maxRounds', () => {
    const msgs = [
      makeMsg('u1', null),       // round 1
      makeMsg('a1', 'agent-1'),
      makeMsg('u2', null),       // round 2
      makeMsg('a2', 'agent-1'),
    ]
    expect(trimToRecentRounds(msgs, 15)).toEqual(msgs)
  })

  it('keeps only the most recent maxRounds rounds', () => {
    // 构造 16 轮，每轮 1 user + 1 agent
    const msgs: GroupChatMessageRecord[] = []
    for (let i = 1; i <= 16; i++) {
      msgs.push(makeMsg(`u${i}`, null, false, i * 2 - 1))
      msgs.push(makeMsg(`a${i}`, 'agent-1', false, i * 2))
    }
    const result = trimToRecentRounds(msgs, 15)
    // 应保留第 2~16 轮，共 30 条
    expect(result).toHaveLength(30)
    expect(result[0].id).toBe('u2')
  })

  it('hidden messages follow their round', () => {
    const msgs = [
      makeMsg('u1', null),         // round 1
      makeMsg('h1', null, true),   // hidden, belongs to round 1
      makeMsg('a1', 'agent-1'),
      makeMsg('u2', null),         // round 2
    ]
    // maxRounds=1, 保留最近 1 轮（round 2 起之后的内容）
    const result = trimToRecentRounds(msgs, 1)
    expect(result.map((m) => m.id)).toEqual(['u2'])
  })

  it('returns empty array for empty input', () => {
    expect(trimToRecentRounds([], 15)).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime
pnpm test test/main/presenter/groupChatPresenter.test.ts
```

预期：FAIL — `trimToRecentRounds is not a function`

- [ ] **Step 3: 实现 `trimToRecentRounds` 并导出，在 `sendMessage` 中调用**

在 `src/main/presenter/groupChatPresenter.ts` 顶部（import 之后、class 之前）添加：

```typescript
export function trimToRecentRounds(
  messages: GroupChatMessageRecord[],
  maxRounds: number,
): GroupChatMessageRecord[] {
  // 找出所有用户轮次的起点索引（senderAgentId===null && hidden===false）
  const roundStartIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.senderAgentId === null && !m.hidden) {
      roundStartIndices.push(i)
    }
  }

  if (roundStartIndices.length <= maxRounds) return messages

  // 丢弃最老的 (roundStartIndices.length - maxRounds) 轮
  const keepFrom = roundStartIndices[roundStartIndices.length - maxRounds]
  return messages.slice(keepFrom)
}
```

在 `sendMessage()` 中，`listBySession` 之后、`invoke()` 之前，替换 `allMessages` 的使用：

```typescript
// 原来（第 80 行附近）：
const allMessages = messageDao.listBySession(db, sessionId)

// 改为：
const rawMessages = messageDao.listBySession(db, sessionId)
const allMessages = trimToRecentRounds(rawMessages, 15)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/presenter/groupChatPresenter.test.ts
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/groupChatPresenter.ts test/main/presenter/groupChatPresenter.test.ts
git commit -m "feat(group-chat): trim history to recent 15 rounds before invoke"
```

---

### Task 2: 收集 usage.inputTokens — stream loop 中记录精确 token 数

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts`

**背景知识：**

`AgentInvoker._run()` 的 stream loop 已经处理了 `text`/`tool_call_*`/`thinking_*`/`error` 事件，但没有处理 `usage` 事件。`usage` 事件在每个 API 响应的 `message_delta` 时发出，包含 `inputTokens`（本次请求实际消耗的输入 token 数，是精确值）。

- [ ] **Step 1: 写失败测试**

新建 `test/main/presenter/agentInvoker.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { estimateMessagesTokens } from '../../../src/main/presenter/agentChat/agentInvoker'
import type { CoreMessage } from '../../../src/main/presenter/agentChat/contextBuilder'

describe('estimateMessagesTokens', () => {
  it('estimates tokens for string content', () => {
    const msgs: CoreMessage[] = [
      { role: 'user', content: 'hello' },         // 5 chars → 2 tokens (ceil(5/4))
      { role: 'assistant', content: 'world!!' },  // 7 chars → 2 tokens (ceil(7/4))
    ]
    expect(estimateMessagesTokens(msgs)).toBe(4)
  })

  it('estimates tokens for array content', () => {
    const msgs: CoreMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            toolName: 'read',
            output: { type: 'text', value: 'abcd' }, // 4 chars → 1 token
          },
        ],
      },
    ]
    expect(estimateMessagesTokens(msgs)).toBe(1)
  })

  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：FAIL — `estimateMessagesTokens is not a function`

- [ ] **Step 3: 在 `agentInvoker.ts` 顶部添加 token 估算函数，在 stream loop 中收集 usage**

在 `agentInvoker.ts` 顶部（import 之后、常量之前）添加：

```typescript
export function estimateMessagesTokens(messages: CoreMessage[]): number {
  let total = 0
  for (const msg of messages) {
    const c = msg.content
    if (typeof c === 'string') {
      total += Math.ceil(c.length / 4)
    } else if (Array.isArray(c)) {
      for (const block of c as Array<{ type: string; [key: string]: unknown }>) {
        const str =
          block.type === 'tool-result'
            ? JSON.stringify((block as { output?: unknown }).output ?? '')
            : JSON.stringify(block)
        total += Math.ceil(str.length / 4)
      }
    }
  }
  return total
}
```

在 `_run()` 中，`const blocks: AssistantMessageBlock[] = []` 之前添加：

```typescript
let lastInputTokens = 0
```

在 stream 的 `for await` 循环内，`error` 事件处理之后（`} else if (event.type === "error") {` 块之后）添加：

```typescript
} else if (event.type === "usage") {
  lastInputTokens = event.usage.inputTokens
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts test/main/presenter/agentInvoker.test.ts
git commit -m "feat(agent-invoker): collect usage.inputTokens from stream"
```

---

### Task 3: Layer 1 — 微压缩（清旧 tool-result）

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts`
- Modify: `test/main/presenter/agentInvoker.test.ts`

**背景知识：**

`llmMessages` 的结构：
```
[0] system  — identity+constraints（不可动）
[1] user    — reminder blocks（不可动）
[2] assistant — "好的，我已了解..."（不可动）
[3..N] user/assistant — [Round N] 历史群聊消息（不可动，由 Layer 0 控制）
[N+1..end] assistant/tool — loop 内产生的轮次对
```

loop 内的 `tool` 消息结构：
```typescript
{
  role: 'tool',
  content: Array<{
    type: 'tool-result'
    toolCallId: string
    toolName: string
    output: { type: 'text'; value: string }
  }>
}
```

微压缩只替换 `output.value`，不删除消息，不改变消息数量。

**不可压缩区域判定：** `llmMessages` 中前三条（system + user + assistant）固定不动；历史群聊消息以 `[Round` 开头（user role）或内容包含 `[Round` 前缀（assistant role）标识；loop 内消息从第一个 `role: "assistant"` 且内容不含 `[Round` 的消息开始。实现时用索引标记 `loopStartIndex`。

- [ ] **Step 1: 写失败测试（追加到已有测试文件）**

在 `test/main/presenter/agentInvoker.test.ts` 追加：

```typescript
import { microCompact, COMPACTABLE_TOOLS } from '../../../src/main/presenter/agentChat/agentInvoker'

describe('microCompact', () => {
  function makeLoopMessages(steps: number): CoreMessage[] {
    // 模拟 buildLLMMessages 产生的前 3 条固定消息 + N 步 loop 轮次
    const fixed: CoreMessage[] = [
      { role: 'system', content: [{ type: 'text', text: 'identity' }] },
      { role: 'user', content: [{ type: 'text', text: '<system-reminder>rules</system-reminder>' }] },
      { role: 'assistant', content: '好的，我已了解当前环境和设定。' },
    ]
    const loop: CoreMessage[] = []
    for (let i = 0; i < steps; i++) {
      loop.push({
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: `tc${i}`, toolName: 'web_fetch', input: {} },
        ],
      })
      loop.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: `tc${i}`,
            toolName: 'web_fetch',
            output: { type: 'text', value: 'A'.repeat(10000) },
          },
        ],
      })
    }
    return [...fixed, ...loop]
  }

  it('clears compactable tool results older than KEEP_RECENT_STEPS', () => {
    // 6 步 loop，保护最近 4 步，前 2 步的 web_fetch 结果应被清空
    const msgs = makeLoopMessages(6)
    const result = microCompact(msgs, 4)
    // loop 从 index 3 开始，步骤对 = [assistant, tool] x 6
    // 第 0 步 tool = index 4，第 1 步 tool = index 6（0-based in loop）
    // 检查被压缩的 tool 消息
    const toolMsgs = result.filter((m) => m.role === 'tool') as Array<{
      role: 'tool'
      content: Array<{ toolName: string; output: { type: string; value: string } }>
    }>
    expect(toolMsgs[0].content[0].output.value).toBe('[truncated: web_fetch result cleared for context]')
    expect(toolMsgs[1].content[0].output.value).toBe('[truncated: web_fetch result cleared for context]')
    // 最近 4 步保留原样
    expect(toolMsgs[2].content[0].output.value).toBe('A'.repeat(10000))
    expect(toolMsgs[5].content[0].output.value).toBe('A'.repeat(10000))
  })

  it('does not compact non-compactable tools', () => {
    const msgs: CoreMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
      { role: 'assistant', content: '好的，我已了解当前环境和设定。' },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'tc0', toolName: 'ask_user', input: {} }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc0',
            toolName: 'ask_user',
            output: { type: 'text', value: 'user answered' },
          },
        ],
      },
    ]
    const result = microCompact(msgs, 4)
    const toolMsg = result.find((m) => m.role === 'tool') as any
    expect(toolMsg.content[0].output.value).toBe('user answered')
  })

  it('does not touch fixed messages', () => {
    const msgs = makeLoopMessages(2)
    const result = microCompact(msgs, 4)
    expect(result[0]).toEqual(msgs[0]) // system
    expect(result[1]).toEqual(msgs[1]) // user
    expect(result[2]).toEqual(msgs[2]) // assistant ack
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：FAIL — `microCompact is not a function`

- [ ] **Step 3: 实现 `microCompact`，添加常量**

在 `agentInvoker.ts` 顶部常量区添加：

```typescript
const CONTEXT_WINDOW = 200_000
const MICRO_COMPACT_THRESHOLD = 0.75
const TRUNCATE_THRESHOLD = 0.90
const KEEP_RECENT_STEPS = 4
export const COMPACTABLE_TOOLS = new Set([
  'web_fetch',
  'read',
  'exec',
  'browser_get_text',
  'browser_screenshot',
  'browser_evaluate',
])
```

在 `estimateMessagesTokens` 之后添加 `microCompact`：

```typescript
export function microCompact(messages: CoreMessage[], keepRecentSteps: number): CoreMessage[] {
  // 定位 loop 区域：跳过前 3 条固定消息（system + user + assistant）
  // 以及历史群聊消息（[Round N] 格式）
  // loop 区域从第一个 role=assistant 且 content 不是字符串（是 array，含 tool-call）开始
  let loopStartIndex = 3
  while (loopStartIndex < messages.length) {
    const m = messages[loopStartIndex]
    if (
      m.role === 'assistant' &&
      Array.isArray(m.content) &&
      (m.content as Array<{ type: string }>).some((b) => b.type === 'tool-call')
    ) {
      break
    }
    loopStartIndex++
  }

  // 找出 loop 区域内所有 tool 消息的索引
  const toolIndices: number[] = []
  for (let i = loopStartIndex; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolIndices.push(i)
  }

  // 保护最近 keepRecentSteps 步
  const compactUpTo = toolIndices.length - keepRecentSteps
  if (compactUpTo <= 0) return messages

  const result = messages.map((msg, idx) => {
    if (msg.role !== 'tool') return msg
    const toolIdx = toolIndices.indexOf(idx)
    if (toolIdx < 0 || toolIdx >= compactUpTo) return msg

    // 替换 COMPACTABLE_TOOLS 的 output.value
    const newContent = (
      msg.content as Array<{
        type: string
        toolCallId: string
        toolName: string
        output: { type: string; value: string }
      }>
    ).map((part) => {
      if (part.type !== 'tool-result') return part
      if (!COMPACTABLE_TOOLS.has(part.toolName)) return part
      return {
        ...part,
        output: { type: 'text', value: `[truncated: ${part.toolName} result cleared for context]` },
      }
    })
    return { ...msg, content: newContent }
  })

  return result
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts test/main/presenter/agentInvoker.test.ts
git commit -m "feat(agent-invoker): add microCompact for old tool results"
```

---

### Task 4: Layer 2 — 强制裁剪（丢最老 loop 轮次对）

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts`
- Modify: `test/main/presenter/agentInvoker.test.ts`

**背景知识：**

强制裁剪在微压缩之后、下一步 `client.chat()` 之前执行。每个 loop 步骤产生一对 `assistant + tool` 消息，必须整对删除（不能只删其中一个，否则 Anthropic API 报 orphaned tool_use 错误）。

- [ ] **Step 1: 写失败测试（追加到已有测试文件）**

在 `test/main/presenter/agentInvoker.test.ts` 追加：

```typescript
import { forceTruncate } from '../../../src/main/presenter/agentChat/agentInvoker'

describe('forceTruncate', () => {
  function makeLoopMsgs(steps: number): CoreMessage[] {
    const fixed: CoreMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user' },
      { role: 'assistant', content: '好的，我已了解当前环境和设定。' },
    ]
    const loop: CoreMessage[] = []
    for (let i = 0; i < steps; i++) {
      loop.push({
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: `tc${i}`, toolName: 'read', input: {} }],
      })
      loop.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: `tc${i}`,
            toolName: 'read',
            output: { type: 'text', value: 'x'.repeat(50000) },
          },
        ],
      })
    }
    return [...fixed, ...loop]
  }

  it('removes oldest loop pairs until below threshold', () => {
    // 10 步，每步 tool result 50000 chars ≈ 12500 tokens，10 步 ≈ 125000 tokens
    // 加上固定区 ≈ 125000 tokens，超过 180000（90% of 200000）
    const msgs = makeLoopMsgs(10)
    const result = forceTruncate(msgs, 4, 0.9, 200_000)
    // 应该删掉足够多的老轮次对，使估算 token < 180000
    const { estimateMessagesTokens } = require('../../../src/main/presenter/agentChat/agentInvoker')
    expect(estimateMessagesTokens(result)).toBeLessThan(200_000 * 0.9)
  })

  it('always keeps at least keepRecentSteps pairs', () => {
    const msgs = makeLoopMsgs(6)
    const result = forceTruncate(msgs, 4, 0.0, 200_000) // threshold=0 → 强制裁剪尽可能多
    // 固定 3 条 + 保留 4 对 = 3 + 8 = 11 条
    expect(result.length).toBeGreaterThanOrEqual(3 + 4 * 2)
  })

  it('does not touch fixed messages', () => {
    const msgs = makeLoopMsgs(5)
    const result = forceTruncate(msgs, 4, 0.9, 200_000)
    expect(result[0].role).toBe('system')
    expect(result[1].role).toBe('user')
    expect(result[2]).toEqual(msgs[2])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：FAIL — `forceTruncate is not a function`

- [ ] **Step 3: 实现 `forceTruncate`**

在 `microCompact` 之后添加：

```typescript
export function forceTruncate(
  messages: CoreMessage[],
  keepRecentSteps: number,
  thresholdRatio: number,
  contextWindow: number,
): CoreMessage[] {
  // 定位 loop 区域（同 microCompact）
  let loopStartIndex = 3
  while (loopStartIndex < messages.length) {
    const m = messages[loopStartIndex]
    if (
      m.role === 'assistant' &&
      Array.isArray(m.content) &&
      (m.content as Array<{ type: string }>).some((b) => b.type === 'tool-call')
    ) {
      break
    }
    loopStartIndex++
  }

  // 收集 loop 内所有 assistant+tool 配对（index对）
  const pairs: Array<[number, number]> = [] // [assistantIdx, toolIdx]
  let i = loopStartIndex
  while (i < messages.length - 1) {
    const curr = messages[i]
    const next = messages[i + 1]
    if (
      curr.role === 'assistant' &&
      Array.isArray(curr.content) &&
      (curr.content as Array<{ type: string }>).some((b) => b.type === 'tool-call') &&
      next.role === 'tool'
    ) {
      pairs.push([i, i + 1])
      i += 2
    } else {
      i++
    }
  }

  const threshold = contextWindow * thresholdRatio
  const removable = pairs.slice(0, pairs.length - keepRecentSteps)
  if (removable.length === 0) return messages

  // 从最老的对开始删，直到低于阈值
  const removeSet = new Set<number>()
  for (const [aIdx, tIdx] of removable) {
    removeSet.add(aIdx)
    removeSet.add(tIdx)
    const trimmed = messages.filter((_, idx) => !removeSet.has(idx))
    if (estimateMessagesTokens(trimmed) < threshold) {
      return trimmed
    }
  }

  // 全部可删的都删完了还超限，返回尽量裁剪的结果
  return messages.filter((_, idx) => !removeSet.has(idx))
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/main/presenter/agentInvoker.test.ts
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts test/main/presenter/agentInvoker.test.ts
git commit -m "feat(agent-invoker): add forceTruncate for loop message pairs"
```

---

### Task 5: 接入压缩逻辑到 `_run()` while loop

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts`

**背景知识：**

目前 `_run()` 中 while loop 的结构（大致）：

```typescript
while (stepCount < MAX_STEPS) {
  stepCount++
  const stream = client.chat(llmMessages, tools, options, abortController.signal)
  // ... for await 收集 stream 事件 ...
  if (toolCalls.length === 0) break
  llmMessages.push({ role: 'assistant', content: assistantParts })
  // ... execute tools ...
  llmMessages.push({ role: 'tool', content: toolResultParts })
}
```

压缩逻辑插入在 `llmMessages.push({ role: 'tool', ... })` 之后、下一次 `client.chat()` 之前。

- [ ] **Step 1: 在 while loop 末尾插入压缩触发逻辑**

在 `agentInvoker.ts` 的 `_run()` 方法中，找到 `llmMessages.push({ role: 'tool', content: toolResultParts })` 这行，在其后添加：

```typescript
// Layer 1: 微压缩（基于上一步 API 返回的精确 token 数）
if (lastInputTokens >= CONTEXT_WINDOW * MICRO_COMPACT_THRESHOLD) {
  llmMessages = microCompact(llmMessages, KEEP_RECENT_STEPS)
}

// Layer 2: 强制裁剪（微压缩后用本地估算）
if (estimateMessagesTokens(llmMessages) >= CONTEXT_WINDOW * TRUNCATE_THRESHOLD) {
  llmMessages = forceTruncate(llmMessages, KEEP_RECENT_STEPS, TRUNCATE_THRESHOLD, CONTEXT_WINDOW)
}
```

同时将 `llmMessages` 的声明从 `const` 改为 `let`（因为 microCompact/forceTruncate 返回新数组）：

找到：
```typescript
const llmMessages = this.buildLLMMessages(
```

改为：
```typescript
let llmMessages = this.buildLLMMessages(
```

- [ ] **Step 2: 运行全部测试**

```bash
pnpm test
```

预期：全部 PASS，无回归

- [ ] **Step 3: 类型检查**

```bash
pnpm run typecheck
```

预期：无错误

- [ ] **Step 4: Lint**

```bash
pnpm run lint
pnpm run format
```

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts
git commit -m "feat(agent-invoker): wire micro-compact and force-truncate into agentic loop"
```

---

## Self-Review

**Spec coverage 检查：**

| Spec 要求 | 对应任务 |
|-----------|----------|
| Layer 0 滑动窗口，保留最近 15 轮 | Task 1 |
| Layer 0 在 GroupChatPresenter，invoke 前执行 | Task 1 |
| 收集 `usage.inputTokens` 精确值 | Task 2 |
| `estimateMessagesTokens` 本地估算 | Task 2 |
| Layer 1 微压缩，75% 触发 | Task 3 |
| `COMPACTABLE_TOOLS` 白名单 | Task 3 |
| Layer 2 强制裁剪，90% 触发，整对删除 | Task 4 |
| `KEEP_RECENT_STEPS = 4` 保护区 | Task 3 & 4 |
| 不可压缩区域（前3条 + Round 历史）跳过 | Task 3 & 4 (`loopStartIndex` 定位) |
| `CONTEXT_WINDOW = 200_000` | Task 3 |
| 接入 while loop | Task 5 |

全部覆盖，无遗漏。
