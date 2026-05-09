# Group Chat Naturalness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AgentInvoker 的群聊上下文注入中加入行为规则约束和轮次标记，使 Agent 只回答本轮消息且不越界回答其他参与者。

**Architecture:** 仅修改 `src/main/presenter/agentChat/agentInvoker.ts` 的 `buildLLMMessages` 方法：① 扩展 `groupContext` 字符串追加三条行为规则；② 历史消息转换循环中维护 `roundIndex` 计数器，给每条消息加 `[Round N]` 前缀。

**Tech Stack:** TypeScript, Electron 主进程, Anthropic LLM（通过本地 Gateway）

---

### Task 1: 扩展 groupContext 注入群聊行为规则

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts:95-104`

- [ ] **Step 1: 读取当前 groupContext 构建代码**

打开 `src/main/presenter/agentChat/agentInvoker.ts`，定位第 95-104 行：

```typescript
// 群聊环境信息：参与者列表 + 用户名
const otherIds = participantAgentIds.filter((id) => id !== agentId);
const otherParticipants =
  otherIds.length > 0 ? `群聊中的其他参与者 ID 为：[${otherIds.join(", ")}]。` : "";
const userInfo = userName ? `当前用户名：${userName}。` : "";
const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}`;
reminderContentBlocks.push({
  type: "text",
  text: `<system-reminder>\n${groupContext}\n</system-reminder>`,
});
```

- [ ] **Step 2: 修改 groupContext，追加行为规则**

将上述代码替换为：

```typescript
// 群聊环境信息：参与者列表 + 用户名
const otherIds = participantAgentIds.filter((id) => id !== agentId);
const otherParticipants =
  otherIds.length > 0 ? `群聊中的其他参与者 ID 为：[${otherIds.join(", ")}]。` : "";
const userInfo = userName ? `当前用户名：${userName}。` : "";
const groupContext = `你正在参与一个群聊。${otherParticipants}消息中以 [agentId]: 开头的内容来自其他参与者。${userInfo}

群聊行为规则：
1. 本轮用户消息是历史中最后一条 [用户] 消息，你只需要回答这条消息，不要主动评论或引用之前轮次的内容，除非用户明确提到了历史内容。
2. 如果用户问题涉及多个参与者（例如"你们几个的 X 是什么"），你只回答属于你自己的部分，不猜测、不评论其他参与者。
3. 历史消息仅供理解对话背景，不是你需要逐一回应的内容。`;
reminderContentBlocks.push({
  type: "text",
  text: `<system-reminder>\n${groupContext}\n</system-reminder>`,
});
```

- [ ] **Step 3: 确认无语法错误**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误（可能有原有的无关错误，忽略）

- [ ] **Step 4: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts
git commit -m "feat(group-chat): inject behavior rules into group context system-reminder"
```

---

### Task 2: 历史消息加轮次标记

**Files:**
- Modify: `src/main/presenter/agentChat/agentInvoker.ts:110-143`

- [ ] **Step 1: 定位历史消息转换循环**

在 `buildLLMMessages` 方法中，找到第 110-143 行的 `for (const msg of groupMessages)` 循环：

```typescript
// 转换群聊历史消息
for (const msg of groupMessages) {
  if (msg.hidden) {
    messages.push({ role: "user", content: msg.content });
  } else if (msg.senderAgentId === null) {
    messages.push({ role: "user", content: msg.content });
  } else if (msg.senderAgentId === agentId) {
    // ... 解析 blocks，取 text
    messages.push({ role: "assistant", content: textContent });
  } else {
    // ... 解析 blocks，取 text
    messages.push({ role: "user", content: `[${msg.senderAgentId}]: ${textContent}` });
  }
}
```

- [ ] **Step 2: 在循环前添加 roundIndex 计数器，循环内加轮次前缀**

将整个循环替换为：

```typescript
// 转换群聊历史消息，维护轮次计数器
let roundIndex = 0;
for (const msg of groupMessages) {
  if (msg.hidden) {
    messages.push({ role: "user", content: msg.content });
  } else if (msg.senderAgentId === null) {
    roundIndex++;
    messages.push({ role: "user", content: `[Round ${roundIndex}] ${msg.content}` });
  } else if (msg.senderAgentId === agentId) {
    let textContent = msg.content;
    try {
      const blocks = JSON.parse(msg.content) as AssistantMessageBlock[];
      const text = blocks
        .filter((b) => b.type === "content" && b.content)
        .map((b) => b.content ?? "")
        .join("");
      if (text) textContent = text;
    } catch {
      // not JSON, use as-is
    }
    messages.push({ role: "assistant", content: `[Round ${roundIndex}] ${textContent}` });
  } else {
    let textContent = msg.content;
    try {
      const blocks = JSON.parse(msg.content) as AssistantMessageBlock[];
      const text = blocks
        .filter((b) => b.type === "content" && b.content)
        .map((b) => b.content ?? "")
        .join("");
      if (text) textContent = text;
    } catch {
      // not JSON, use as-is
    }
    messages.push({ role: "user", content: `[Round ${roundIndex}] [${msg.senderAgentId}]: ${textContent}` });
  }
}
```

- [ ] **Step 3: 确认无语法错误**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run typecheck 2>&1 | head -30
```

Expected: 无新增错误

- [ ] **Step 4: 运行 lint 和 format**

```bash
cd /Users/hexueyuan/Workroot/src/github.com/hexueyuan/Slime && pnpm run format && pnpm run lint 2>&1 | tail -20
```

Expected: 无新增 lint 错误

- [ ] **Step 5: Commit**

```bash
git add src/main/presenter/agentChat/agentInvoker.ts
git commit -m "feat(group-chat): add round index prefix to history messages"
```
