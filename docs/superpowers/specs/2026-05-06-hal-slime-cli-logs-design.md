# HAL 使用 slime-cli logs 能力设计

**日期**: 2026-05-06
**分支**: brave

## 目标

让内置 Agent HAL 能通过 `exec` 工具调用 `slime-cli logs` 查看 Slime 运行日志，用于排查问题。

## 变更范围

### 1. `src/main/presenter/toolPresenter.ts` — 放行 slime-cli 命令

`EXEC_BLOCKED_PATTERNS` 中的绝对路径规则会拦截 `~/.local/bin/slime-cli`（以 `/` 开头的路径）。

修改 `validateCommand`，对以 `slime-cli` 开头的命令跳过绝对路径检查，其余 block 规则不变：

```
// 当前
[/(?:^|\s)\//, "absolute paths are not allowed"]

// 改为在 validateCommand 函数中特判
if (/(?:^|\s)\//.test(command) && !/(?:^|\s)slime-cli\b/.test(command)) {
  throw new Error(...)
}
```

**安全性**：slime-cli 是内置可信工具，CLI 自身的 `canAccess()` 鉴权（`allowedRoles` + `allowedAgents`）确保 HAL 只能执行已授权命令。其他所有 block 规则（rm .git、curl|sh、wget 等）对 slime-cli 命令同样生效。

### 2. `src/main/agents/hal.ts` — systemPrompt 补充工具说明

在 `agentSoul` 中增加一段说明：有 `slime-cli` 工具可用于查看 Slime 运行日志，具体用法通过 `slime-cli help` 查看。通过 `exec` 工具调用。

## 不涉及变更

- CLI 鉴权逻辑（`allowedRoles`/`allowedAgents` 已配置）
- `logs` 命令实现
- 其他 block 规则
