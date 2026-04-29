# Gateway Failover Fix

## 问题

流式路径（`relayStream`）failover 不生效。第一个模型 HTTP 错误后不尝试分组内下一个模型。

## 根因

Outbound adapter 的 `sendStream` 在 HTTP 错误时 yield error event 而不是 throw。`relayStream` 用 try-catch 检测失败，yield 的值不会被捕获，导致误判为成功并 return，跳出 failover 循环。

## 修复

### 1. sendStream HTTP 错误改 throw

所有 6 个 adapter（anthropic/openai-chat/gemini/deepseek/volcengine/custom）的 `sendStream`：

```typescript
// Before
if (!res.ok) {
    yield { type: "error", error: `XXX ${res.status}: ${text}` };
    return;
}

// After
if (!res.ok) {
    throw new Error(`XXX ${res.status}: ${text}`);
}
```

`relayStream` 的 try-catch 自然捕获 → recordFailure → continue 下一个 item → failover 生效。

### 2. all-exhausted 边界处理

`relayStream` 中当所有 item 都失败后 throw `lastError`。inbound handler（anthropic.ts/openai-responses.ts）需要在 `relay.relayStream()` 调用外 try-catch，SSE header 已发出时写入 error event 而不是让 Fastify 返回 500。

## 不改

- 熔断器：保持现有逻辑（5次失败 trip，指数退避）
- statsCallback：failover 修复后自然在日志中看到完整尝试链路（每个失败 model 一条 error 日志 + 最后成功一条 success 日志）
