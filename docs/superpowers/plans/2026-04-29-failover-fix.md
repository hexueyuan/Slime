# Gateway Failover Fix 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复流式路径 failover 不生效的 bug — sendStream 在 HTTP 错误时 throw 而不是 yield error event

**Architecture:** 所有 6 个 outbound adapter 的 `sendStream` 方法中，`if (!res.ok)` 分支从 yield error event 改为 throw Error。deepseek/volcengine/custom 复用 openai-chat，无需单独修改。relay.relayStream() 的 try-catch 自然捕获 throw，触发 failover。all-exhausted 时 relayStream throw → Fastify 返回 500（SSE header 未写，Fastify 默认错误处理即可）。

**Tech Stack:** TypeScript

---

## 文件修改范围

| 文件                                               | 改动                |
| -------------------------------------------------- | ------------------- |
| `src/main/gateway/outbound/anthropic.ts:196-199`   | yield error → throw |
| `src/main/gateway/outbound/openai-chat.ts:172-176` | yield error → throw |
| `src/main/gateway/outbound/gemini.ts:161-164`      | yield error → throw |

deepseek.ts/volcengine.ts/custom.ts 复用 `createOpenAIChatOutbound()`，自动修复。inbound handler 的 all-exhausted 情况由 Fastify 默认 500 处理（relayStream 调用在 writeHead 之前），无需额外代码。现有 relay 测试已覆盖 throw 场景（"连接失败 fallback 到下一个候选"、"全部候选流式失败抛错"），无需新增测试。

---

### Task 1: 修复 anthropic sendStream

**Files:**

- Modify: `src/main/gateway/outbound/anthropic.ts:196-199`

- [x] **Step 1: 改 yield error 为 throw**

在 `src/main/gateway/outbound/anthropic.ts` 的 `sendStream` 方法中：

```typescript
// 当前 (line 196-199)
      if (!res.ok) {
        const text = await res.text();
        yield { type: "error" as const, error: `Anthropic ${res.status}: ${text}` };
        return;
      }

// 改为
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text}`);
      }
```

- [x] **Step 2: 验证 relayStream failover 测试通过**

```bash
pnpm test -- --run test/main/gateway-relay.test.ts
```

预期：13 passed（与修复前一致，现有测试已覆盖 throw 场景）

- [x] **Step 3: Commit**

```bash
git add src/main/gateway/outbound/anthropic.ts
git commit -m "fix(gateway): anthropic sendStream throw on HTTP error for failover"
```

---

### Task 2: 修复 openai-chat sendStream

**Files:**

- Modify: `src/main/gateway/outbound/openai-chat.ts:172-176`

- [x] **Step 1: 改 yield error 为 throw**

在 `src/main/gateway/outbound/openai-chat.ts` 的 `sendStream` 方法中：

```typescript
// 当前 (line 172-176)
      if (!res.ok) {
        const text = await res.text();
        yield { type: "error" as const, error: `OpenAI ${res.status}: ${text}` };
        return;
      }

// 改为
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text}`);
      }
```

这同时修复了 deepseek/volcengine/custom，因为它们都调用 `createOpenAIChatOutbound()`。

- [x] **Step 2: 验证测试**

```bash
pnpm test -- --run test/main/gateway-relay.test.ts
```

- [x] **Step 3: Commit**

```bash
git add src/main/gateway/outbound/openai-chat.ts
git commit -m "fix(gateway): openai sendStream throw on HTTP error for failover"
```

---

### Task 3: 修复 gemini sendStream

**Files:**

- Modify: `src/main/gateway/outbound/gemini.ts:161-164`

- [x] **Step 1: 改 yield error 为 throw**

在 `src/main/gateway/outbound/gemini.ts` 的 `sendStream` 方法中：

```typescript
// 当前 (line 161-164)
      if (!res.ok) {
        const text = await res.text();
        yield { type: "error" as const, error: `Gemini ${res.status}: ${text}` };
        return;
      }

// 改为
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini ${res.status}: ${text}`);
      }
```

- [x] **Step 2: 验证测试**

```bash
pnpm test -- --run test/main/gateway-relay.test.ts
```

- [x] **Step 3: Commit**

```bash
git add src/main/gateway/outbound/gemini.ts
git commit -m "fix(gateway): gemini sendStream throw on HTTP error for failover"
```

---

### Task 4: 最终验证

- [x] **Step 1: 运行全部测试**

```bash
pnpm test -- --run
```

- [x] **Step 2: Typecheck**

```bash
pnpm run typecheck
```

- [x] **Step 3: 运行 format + lint**

```bash
pnpm run format && pnpm run lint
```
