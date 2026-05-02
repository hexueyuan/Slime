# Agent systemPrompt → SOUL.md 迁移设计

**日期**: 2026-05-02
**状态**: 待实现

## 目标

废弃 custom agent 的 `AgentConfig.systemPrompt` 字段（已标注 `@deprecated`），统一改用 SOUL.md 文件作为系统提示词来源。builtin agent（HalAI）不受影响。

## 变更范围

### 1. 默认 SOUL.md 内容（agentConfigPresenter.ts）

`createAgent()` 写入的初始 SOUL.md 内容从注释改为有意义的默认提示词：

```
你是{agent.name}，一个人工智能，你的任务是帮助用户解决问题。
```

动态替换 `{agent.name}` 为实际 agent 名字。

### 2. 移除 config.systemPrompt fallback（agentChatPresenter.ts）

当前读取逻辑：

```typescript
const agentSystemPrompt = this.agentConfigPresenter
  ? await this.agentConfigPresenter.readSoulMd(session.agentId)
  : (agent?.config?.systemPrompt ?? ""); // ← 移除这个 fallback
```

改为：

```typescript
const agentSystemPrompt = this.agentConfigPresenter
  ? await this.agentConfigPresenter.readSoulMd(session.agentId)
  : "";
```

SOUL.md 为空时 agentSystemPrompt 为空字符串，不再读取 deprecated 的 `config.systemPrompt`。

### 3. 空 systemPrompt 不注入 system 消息（contextBuilder.ts）

当前 `buildContext()` fallback 逻辑：

```typescript
const systemPrompt =
  config?.systemPrompt || options?.agentSystemPrompt || "You are a helpful AI assistant.";
```

对于 non-builtin agent，`agentSystemPrompt` 为空时应直接不注入 system 消息，而非 fallback 到英文默认值。

改为：若 `finalSystemPrompt` 为空字符串，则不向 messages 数组添加 system 消息。

> builtin agent 路径（`agentSystemPrompt` 不传）保持原有 fallback 逻辑不变。

### 4. UI 改造（AgentEditDialog.vue）

- **移除** systemPrompt 文本域（Settings 区域）
- **新增** "打开 Agent 目录" 按钮，点击后通过 `shell:openPath` IPC 打开 SOUL.md 所在目录

按钮逻辑：

1. 调用新增的 `agentConfigPresenter.getAgentDir(agentId)` 方法获取目录路径
2. 若路径存在，调用 `shell:openPath` IPC 打开（Electron `shell.openPath`）
3. 若路径为 null（理论上 custom agent 不会出现），按钮 disabled

### 5. 新增 Presenter 方法（agentConfigPresenter.ts）

```typescript
async getAgentDir(agentId: string): Promise<string | null>
```

供渲染进程通过 `presenter:call` IPC 调用，返回 agent 工作目录路径。

## 不变

- `AgentConfig.systemPrompt` 字段保留（`@deprecated`），避免破坏 DB 兼容性
- builtin agent（HalAI）systemPrompt 仍写在 `agentDao.ts` HAL_CONFIG 中
- 已有 custom agent 的 SOUL.md 内容不迁移
- `agentChatPresenter.ts` 对 builtin agent 的处理逻辑不变

## 文件影响

| 文件                                                   | 变更                                        |
| ------------------------------------------------------ | ------------------------------------------- |
| `src/main/presenter/agentConfigPresenter.ts`           | 修改默认 SOUL.md 内容；新增 `getAgentDir()` |
| `src/main/presenter/agentChat/agentChatPresenter.ts`   | 移除 `config.systemPrompt` fallback         |
| `src/main/presenter/agentChat/contextBuilder.ts`       | 空 systemPrompt 时不注入 system 消息        |
| `src/renderer/src/components/chat/AgentEditDialog.vue` | 移除 systemPrompt 文本域；新增打开目录按钮  |
