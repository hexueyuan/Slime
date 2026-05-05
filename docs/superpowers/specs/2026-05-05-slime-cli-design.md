# slime-cli 设计文档

**日期**: 2026-05-05
**范围**: v0.5 — 首个 CLI 版本，仅实现 `logs` 和 `help` 命令

---

## 1. 目标

为 Slime 增加独立 CLI 工具 `slime-cli`，供两类调用者使用：

1. **Agent**：通过 ToolPresenter `exec` 工具调用，自主完成调试/管理任务
2. **用户**：在终端手动调用，执行日志查看等操作

CLI 不依赖 Electron 运行时，直接读取文件系统数据。

---

## 2. 调用者身份模型

CLI 通过两个环境变量识别调用者身份，不做加密认证（信任注入来源）。

| 变量 | 说明 |
|------|------|
| `SLIME_ROLE` | `user` / `builtin-agent` / `external-agent` |
| `SLIME_USER_ID` | 用户名（用户场景）或 agent id（agent 场景，如 `hal-ai`） |
| `SLIME_DATA_DIR` | Slime userData 目录路径，CLI 据此定位日志文件 |

**三种场景的环境变量值：**

| 场景 | `SLIME_ROLE` | `SLIME_USER_ID` | `SLIME_DATA_DIR` |
|------|-------------|-----------------|-----------------|
| 内置 agent（哈尔） | `builtin-agent` | `hal-ai` | Electron 注入 |
| 外部/自定义 agent | `external-agent` | agent id | Electron 注入 |
| 用户手动调用 | `user` | 用户名 / OS username | wrapper 写死 |

缺失环境变量时 CLI 报错退出，不做猜测。

---

## 3. 权限模型

每个命令在注册表中声明两级权限：

```typescript
interface CommandDef {
  name: string
  description: string          // 单行简介（用于 help 列表）
  detail: string               // 完整参数说明（用于 help <cmd>）
  allowedRoles: Role[]         // 第一级：角色白名单
  allowedAgents?: string[]     // 第二级：agent id 白名单（可选，声明后角色通过还需再检查）
  run: (args: ParsedArgs, ctx: CallerContext) => void
}
```

**鉴权逻辑（顺序执行）：**

1. `SLIME_ROLE` 不在 `allowedRoles` → 输出 `Unknown command: <name>`，退出 1
2. `allowedAgents` 存在且 `SLIME_USER_ID` 不在其中 → 同上
3. 两级通过 → 执行命令

`help` 列出命令时过滤掉当前调用者无权访问的命令（两级都过滤）。
`help <cmd>` 对无权命令同样返回 `Unknown command`。

---

## 4. 命令规格

### 4.1 `help`

```
slime-cli               # 等价于 slime-cli help
slime-cli help          # 列出当前调用者有权限的全部命令及单行简介
slime-cli help <cmd>    # 输出指定命令的完整参数说明
```

**权限**：`allowedRoles: ['user', 'builtin-agent', 'external-agent']`（所有人）

**输出示例（`slime-cli help`）：**
```
Slime CLI — Slime 应用管理工具

用法: slime-cli <command> [options]

命令:
  help [command]    显示帮助信息
  logs              查看和管理 Slime 运行日志

运行 `slime-cli help <command>` 查看命令详细说明。
```

### 4.2 `logs`

```
slime-cli logs                     # 输出今日全部日志
slime-cli logs --key <keyword>     # 关键词过滤（大小写不敏感，匹配 message 字段及 meta）
slime-cli logs --tail <n>          # 输出最后 n 行
slime-cli logs --head <n>          # 输出前 n 行
slime-cli logs --clear             # 清空今日日志文件
```

参数可组合：`--key error --tail 20`（先过滤，再取尾部 20 条）。
`--head` 与 `--tail` 互斥，同时传入报错。

**权限**：`allowedRoles: ['builtin-agent']`，`allowedAgents: ['hal-ai']`

**日志文件路径**：`{SLIME_DATA_DIR}/logs/slime-{YYYY-MM-DD}.log`（今日文件）

**输出格式**（每行 JSON 解析后格式化）：
```
[INFO]  2026-05-05T10:23:01.123Z  gateway started  {"port":3000}
[ERROR] 2026-05-05T10:23:05.456Z  relay failed     {"channel":"openai","error":"timeout"}
```

JSON 解析失败的行原样输出。

**`--clear` 行为**：截断今日日志文件为空（不删除文件），输出 `Cleared: <path>`。

---

## 5. 文件结构

```
src/cli/
├── index.ts              # 入口：解析 argv，读取环境变量，分发命令
├── auth.ts               # 解析 SLIME_ROLE / SLIME_USER_ID / SLIME_DATA_DIR → CallerContext
├── registry.ts           # 命令注册表 + 鉴权函数 canAccess(cmd, ctx)
├── commands/
│   ├── help.ts           # help 命令实现
│   └── logs.ts           # logs 命令实现
└── utils/
    └── logReader.ts      # 读取/过滤/格式化/清空日志文件
```

---

## 6. 构建与分发

### 6.1 打包

electron-vite 新增 CLI 打包目标，输出 `resources/slime-cli.js`（CommonJS，Node.js 可直接运行）。

`electron.vite.config.ts` 新增：
```typescript
// cli 额外入口
build: {
  lib: { entry: 'src/cli/index.ts', formats: ['cjs'] },
  outDir: 'resources',
  rollupOptions: { external: ['electron'] }  // CLI 不依赖 electron
}
```

### 6.2 Wrapper 脚本生成

Electron 启动时（`index.ts` bootstrap 阶段）调用 `setupCliWrapper()`：

1. 生成 `~/.local/bin/slime-cli`（shell wrapper 脚本）：
   ```sh
   #!/bin/sh
   SLIME_ROLE=user \
   SLIME_USER_ID=<userName> \
   SLIME_DATA_DIR=<userData> \
   node "<resources>/slime-cli.js" "$@"
   ```
2. `chmod +x` 设置可执行权限
3. 用户名优先取 `configPresenter.get("app.userProfile.name")`，兜底 `os.userInfo().username`
4. 写入失败静默忽略（不影响 app 启动），但写入 logger

用户需将 `~/.local/bin` 加入 PATH（onboarding 或设置页提示）。

### 6.3 ToolPresenter exec 注入

`exec` 工具执行命令时，将以下变量合并到子进程环境：

```typescript
{
  SLIME_ROLE: session.agentType === 'builtin' ? 'builtin-agent' : 'external-agent',
  SLIME_USER_ID: session.agentId,
  SLIME_DATA_DIR: app.getPath('userData'),
}
```

`agentType` 和 `agentId` 由 AgentChatPresenter 在创建 session 时从 agents 表读取，通过构造函数传入 ToolPresenter。

---

## 7. 错误处理

| 场景 | 输出 | 退出码 |
|------|------|--------|
| 环境变量缺失 | `Error: SLIME_ROLE is not set. Run via Slime app or slime-cli wrapper.` | 1 |
| 无权限命令 | `Unknown command: <name>` | 1 |
| `--head` 和 `--tail` 同时使用 | `Error: --head and --tail are mutually exclusive` | 1 |
| 日志文件不存在 | `No logs found for today.` | 0 |
| 日志目录不存在 | `Error: data directory not found: <path>` | 1 |

---

## 8. 不在此版本范围内

- 多日期日志查看（`--date`）
- 日志级别过滤（`--level error`）
- 实时日志跟踪（`--follow`）
- 其他子命令（config、gateway、agent 等）
- Windows 支持（wrapper 脚本为 sh，暂不考虑）
