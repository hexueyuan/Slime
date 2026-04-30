# MCP Client 设计

Agent 作为 MCP Client，连接外部 MCP Server，将其工具纳入 Agent 工具箱。

## 需求摘要

- **角色**: MCP Client（不实现 MCP Server 端）
- **传输**: stdio + Streamable HTTP (SSE)，两种都要
- **配置粒度**: 三级模型
  - 全局：MCP Server 接入管理（Settings > MCP 面板）
  - Agent：在编辑页勾选启用的 MCP 工具（白名单，存 `agents.config_json.mcpTools`）
  - 会话：临时禁用某工具（状态仅在当前会话生效，存 `session_mcp_state` 表）
- **联动删除**: 全局删 Server → 清理 tools + session state；Agent 取消勾选 → 清理该 Agent 所有会话的 state
- **连接策略**: 启动时连接所有 enabled Server + 健康检查 + 指数退避自动重试
- **工具发现**: 连接成功后 `tools/list` → 缓存到 `mcp_tools` 表，Agent 手动勾选
- **集成方式**: MCP 工具合并到 `ToolPresenter.getToolSet()`，LLM 看到统一工具列表，内部根据前缀路由执行

## 架构

```
src/main/mcp/
├── types.ts           MCP 协议类型（JSON-RPC, MCPTool, MCPServerConfig）
├── transport.ts       stdio (child_process.spawn) + HTTP SSE (fetch + EventSource)
├── mcpClient.ts       MCP Client: initialize → tools/list → tools/call
├── toolCache.ts       工具发现 + 增量更新缓存
└── healthChecker.ts   心跳检测 + 指数退避自动重试

src/main/presenter/mcpServerPresenter.ts  全局 Server 生命周期管理 + CRUD
src/main/presenter/mcpToolBridge.ts       Agent/会话级工具过滤 + 执行路由

src/main/presenter/toolPresenter.ts       合并 MCP 工具到 getToolSet()
src/main/presenter/index.ts               增加 MCPServerPresenter 初始化
```

```
MCPServerPresenter (全局生命周期)
  ├── Map<serverId, MCPClient>      连接管理
  ├── Map<serverId, HealthChecker>  健康检查
  └── CRUD → mcp_servers 表

MCPToolBridge (过滤层)
  ├── getMcpTools(agentId, sessionId) → Record<name, Tool>
  └── executeTool(name, args) → MCPClient.callTool()

ToolPresenter.getToolSet(sessionId)
  → { ...builtinTools, ...mcpTools }
  → AgentChatPresenter 无感知
```

## 数据库

3 张新表（放 gateway.db）：

### mcp_servers

```sql
CREATE TABLE mcp_servers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  transport     TEXT NOT NULL,           -- "stdio" | "http"
  enabled       INTEGER NOT NULL DEFAULT 1,
  command       TEXT,                    -- stdio
  args          TEXT,                    -- JSON string[]
  env           TEXT,                    -- JSON Record
  url           TEXT,                    -- http
  http_headers  TEXT,                    -- JSON Record
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
```

### mcp_tools

```sql
CREATE TABLE mcp_tools (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id     TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name     TEXT NOT NULL,
  description   TEXT,
  input_schema  TEXT NOT NULL,           -- JSON Schema
  UNIQUE(server_id, tool_name)
);
```

连接成功后 `tools/list` → 写入此表。重连时增量更新（新增/删除/更新 schema）。

### session_mcp_state

```sql
CREATE TABLE session_mcp_state (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  tool_id       INTEGER NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  disabled      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, tool_id)
);
```

仅存 disabled 的记录（默认不存在 = 启用）。新建会话无记录 → 走 Agent 级配置。

### Agent 配置

在 `agents.config_json` 中加 `mcpTools` 字段：

```json
{
  "disabledTools": ["evolution_start"],
  "mcpTools": ["{server_id}/{tool_name}", ...]
}
```

### 联动删除

- 删除 mcp_server → CASCADE 删 mcp_tools → CASCADE 删 session_mcp_state
- 删除 Agent → CASCADE 删 agent_sessions → CASCADE 删 session_mcp_state
- Agent 取消勾选工具 → `AgentConfigPresenter.updateAgent()` 中检测 `mcpTools` 变更，移除被取消工具的 `session_mcp_state` 记录（查该 Agent 所有会话，按 tool_id 删）
- Agent 的 `mcpTools` 中可能残留已删除 Server 的工具引用 → Bridge 查 `mcp_tools` 时自然过滤掉，不影响功能

## MCP 协议

只实现 tools 部分：

- `initialize` — 握手，协商协议版本和能力
- `tools/list` — 获取工具列表（含 name + description + inputSchema JSON Schema）
- `tools/call` — 调用工具，传入 name + arguments，返回 content[]

不做 resources/list、resources/read、prompts/list、prompts/get。

### JSON-RPC 传输

- stdio: stdin 写 JSON-RPC request，stdout 读 JSON-RPC response（行分隔）
- HTTP: POST `/message` 发 JSON-RPC request，GET `/sse` 收服务端推送

## MCP 工具命名

格式：`mcp_{server_name}_{tool_name}`

- Server name 转 snake_case（去特殊字符，"GitHub" → "github"）
- 最终：`mcp_github_search_issues`、`mcp_filesystem_read_file`
- 保证不和内置工具冲突

## Presenter 设计

### MCPServerPresenter

```typescript
class MCPServerPresenter {
  private clients: Map<string, MCPClient>
  private healthCheckers: Map<string, HealthChecker>

  init(): Promise<void>           // 加载所有 enabled server → 逐一 connect()
  destroy(): Promise<void>        // 断开所有连接

  // CRUD（IPC 方法）
  listServers(): MCPDashboard[]    // 含 status, tools_count, error
  createServer(config): void       // 写 DB + connect + 发现工具
  updateServer(id, config): void   // 断旧连新 + 重新发现
  deleteServer(id): void           // 断开 + 删 DB + emit 事件
  getServerTools(id): MCPTool[]    // 查看某 Server 工具列表
}
```

所有变更 emit `MCP_EVENTS.SERVERS_CHANGED` 到渲染进程。

### MCPToolBridge

```typescript
class MCPToolBridge {
  constructor(mcpPresenter: MCPServerPresenter, db: Database)

  async getMcpTools(sessionId: string): Promise<Record<string, Tool>>
  async executeTool(fullName: string, args: unknown): Promise<string>
}
```

`getMcpTools` 逻辑：
1. sessionId → session.agentId → agent.config_json.mcpTools[]
2. 查 mcp_tools 表获取 input_schema
3. 查 session_mcp_state 过滤 disabled 工具
4. 构建 execute 函数：MCPClient.callTool()
5. 返回 `Record<name, { description, parameters, execute }>`

### ToolPresenter 变更

```typescript
async getToolSet(sessionId: string) {
  const builtin = this.buildBuiltinTools(sessionId)
  const mcp = await this.mcpBridge.getMcpTools(sessionId)
  return { ...builtin, ...mcp }
}

async callTool(sessionId: string, name: string, args: unknown) {
  if (name.startsWith("mcp_")) {
    return this.mcpBridge.executeTool(name, args)
  }
  // 现有逻辑...
}
```

## 连接管理

### 启动流程

```
Presenter.init()
  → GatewayPresenter.init()
  → MCPServerPresenter.init()
    → 加载所有 enabled mcp_servers
    → 逐一 MCPClient.connect()
      → stdio: spawn 子进程 → initialize → tools/list
      → http:  fetch POST → initialize → 连接 SSE → tools/list
    → 写入 mcp_tools 表（增量更新）
    → 启动 HealthChecker
```

连接失败不阻塞启动。失败的 Server 后台自动重试。

### 健康检查

- 每 30s ping（发送 `tools/list`）
- 失败 → 标记 status=error → emit `MCP_EVENTS.SERVER_STATUS` → 启动重试
- 指数退避：1s → 2s → 4s → 8s → ... → max 60s
- 恢复后 → 重新 `tools/list`（增量更新缓存）→ emit 事件
- stdio 进程死亡 = 断开，spawn 新进程重连
- HTTP SSE 断开 = 重连

### 超时

- 连接超时：30s
- tools/call 超时：60s（通过 AbortSignal）

## 事件

新增 `MCP_EVENTS`：

| 事件 | 触发时机 |
|------|----------|
| `mcp:servers-changed` | Server CRUD |
| `mcp:server-status` | 单个 Server 连接状态变化 |
| `mcp:tools-changed` | 某 Server 工具列表变更 |

## UI

### 组件

```
src/renderer/src/
├── components/mcp/
│   ├── MCPServerList.vue         Server 卡片列表
│   ├── MCPServerForm.vue         添加/编辑弹窗
│   └── MCPToolChecklist.vue      工具勾选（Agent 和 Session 共用）
├── views/SettingsView.vue        + MCP tab
├── components/agent/
│   └── AgentEditDialog.vue       + MCP Tools tab
├── components/chat/
│   └── SessionSettings.vue       + MCP Tools disable
└── stores/mcp.ts                 useMcpStore()
```

### 页面

1. **Settings > MCP**：Server 列表（名称 + 状态 + 工具数），添加/编辑/删除，刷新工具列表
2. **Agent 编辑 > MCP Tools**：按 Server 分组展示工具 checkbox，全选/全不选
3. **Session MCP**：当前会话的 MCP 工具开关列表，仅禁用已启用工具

## 错误处理

- `tools/call` 超时 → 返回错误文本给 LLM（"MCP tool 'xxx' timed out after 60s"）
- `tools/call` 失败 → 返回错误文本（"MCP tool 'xxx' failed: {message}"）
- Server 连接断开 → Agent 仍可用内置工具，MCP 工具调用时返回错误
- LLM 选了被禁用的 MCP 工具 → 返回 "Tool 'xxx' is disabled in this session"

## MCP SDK 依赖

项目已使用 Anthropic 直连而非 SDK。对 MCP 同样不使用 `@modelcontextprotocol/sdk`：

- JSON-RPC 2.0 协议手工实现（几十行）
- stdio 传输：child_process.spawn + 行分隔 JSON 流
- SSE 传输：fetch + 简单 SSE 解析

理由：MCP 核心协议简单，SDK 引入大量间接层和不必要的能力（resources/prompts），自实现更轻量且和项目风格一致。

## 不做

- MCP Server 端（Slime 不作为 MCP Server 暴露工具）
- resources、prompts 协议
- MCP Server 工具的热重载（需手动刷新或启动时连接）
- 多个 Agent 共享 MCP 连接的会话池（每个 Server 一个连接）
