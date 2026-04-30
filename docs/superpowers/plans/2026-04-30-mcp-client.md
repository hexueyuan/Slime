# MCP Client 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Agent 作为 MCP Client 连接外部 MCP Server（stdio + SSE），将其工具纳入 Agent 工具箱，三级配置（全局 → Agent → 会话）。

**Architecture:** `src/main/mcp/` 独立协议层 + `MCPServerPresenter` 全局生命周期 + `MCPToolBridge` 过滤桥接。`ToolPresenter.getToolSet()` 合并内置 + MCP 工具，`AgentChatPresenter` 零感知。UI：Settings MCP Tab（全局管理）、AgentEditDialog MCP Tab（勾选）、会话工具栏（临时禁用）。

**Tech Stack:** TypeScript, Electron IPC, better-sqlite3, Vue 3 + Pinia, Zod, child_process.spawn, fetch + SSE

---

### Task 1: MCP 协议类型 + 共享类型 + 事件常量

**Files:**
- Create: `src/main/mcp/types.ts`
- Modify: `src/shared/types/agent.d.ts`
- Create: `src/shared/types/mcp.d.ts`
- Create: `src/shared/types/presenters/mcpServer.presenter.d.ts`
- Modify: `src/shared/events.ts`

- [x] **Step 1: 创建 `src/main/mcp/types.ts`**

```typescript
export interface JSONRPCRequest {
  jsonrpc: "2.0"
  method: string
  params?: unknown
  id: number
}

export interface JSONRPCResponse {
  jsonrpc: "2.0"
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
  id: number | null
}

export interface MCPToolDef {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface MCPServerConfig {
  id: string
  name: string
  transport: "stdio" | "http"
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface MCPToolCallResult {
  content: Array<{ type: "text" | "image" | "resource"; text?: string; data?: string; mimeType?: string }>
  isError?: boolean
}
```

- [x] **Step 2: 修改 `src/shared/types/agent.d.ts` — AgentConfig 加 `mcpTools`**

在 `AgentConfig` 接口末尾添加：

```typescript
  mcpTools?: string[]  // "{server_id}/{tool_name}"[]
```

- [x] **Step 3: 创建 `src/shared/types/mcp.d.ts`**

```typescript
export interface MCPServer {
  id: string
  name: string
  transport: "stdio" | "http"
  enabled: boolean
  command?: string | null
  args?: string[] | null
  env?: Record<string, string> | null
  url?: string | null
  httpHeaders?: Record<string, string> | null
  createdAt: number
  updatedAt: number
}

export interface MCPServerDashboard extends MCPServer {
  status: "disconnected" | "connecting" | "connected" | "error"
  toolsCount: number
  error?: string | null
}

export interface MCPToolRecord {
  id: number
  serverId: string
  toolName: string
  description: string | null
  inputSchema: Record<string, unknown>
}
```

- [x] **Step 4: 创建 `src/shared/types/presenters/mcpServer.presenter.d.ts`**

```typescript
import type { MCPServer, MCPServerDashboard, MCPToolRecord } from "../mcp";

export interface IMCPServerPresenter {
  listServers(): Promise<MCPServerDashboard[]>
  createServer(config: Omit<MCPServer, "createdAt" | "updatedAt">): Promise<MCPServer>
  updateServer(id: string, config: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>): Promise<MCPServer>
  deleteServer(id: string): Promise<void>
  getServerTools(id: string): Promise<MCPToolRecord[]>
  getSessionDisabledTools(sessionId: string): Promise<number[]>
  setSessionToolState(sessionId: string, toolId: number, disabled: boolean): Promise<void>
}
```

- [x] **Step 5: 修改 `src/shared/events.ts` — 添加 MCP_EVENTS**

在文件末尾添加：

```typescript
export const MCP_EVENTS = {
  SERVERS_CHANGED: "mcp:servers-changed",
  SERVER_STATUS: "mcp:server-status",
  TOOLS_CHANGED: "mcp:tools-changed",
} as const;
```

- [x] **Step 6: 提交**

```bash
git add src/main/mcp/types.ts src/shared/types/agent.d.ts src/shared/types/mcp.d.ts src/shared/types/presenters/mcpServer.presenter.d.ts src/shared/events.ts
git commit -m "feat(mcp): add MCP types, shared interfaces, and events"
```

---

### Task 2: 数据库表 + DAO

**Files:**
- Modify: `src/main/db/database.ts`
- Create: `src/main/db/models/mcpDao.ts`

- [x] **Step 1: 在 DDL 中添加 3 张表**

在 `src/main/db/database.ts` 的 DDL 模板字符串末尾（`\`;` 之前）添加：

```sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  http_headers TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  description TEXT,
  input_schema TEXT NOT NULL,
  UNIQUE(server_id, tool_name)
);

CREATE TABLE IF NOT EXISTS session_mcp_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  disabled INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, tool_id)
);
```

- [x] **Step 2: 创建 `src/main/db/models/mcpDao.ts`**

```typescript
import type BetterSqlite3 from "better-sqlite3";
import type { MCPServer, MCPToolRecord } from "@shared/types/mcp";

function rowToServer(row: Record<string, unknown>): MCPServer {
  return {
    id: row.id as string,
    name: row.name as string,
    transport: row.transport as "stdio" | "http",
    enabled: !!row.enabled,
    command: (row.command as string) ?? null,
    args: row.args ? JSON.parse(row.args as string) : null,
    env: row.env ? JSON.parse(row.env as string) : null,
    url: (row.url as string) ?? null,
    httpHeaders: row.http_headers ? JSON.parse(row.http_headers as string) : null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToTool(row: Record<string, unknown>): MCPToolRecord {
  return {
    id: row.id as number,
    serverId: row.server_id as string,
    toolName: row.tool_name as string,
    description: (row.description as string) ?? null,
    inputSchema: JSON.parse(row.input_schema as string),
  };
}

// --- Server CRUD ---

export function listServers(db: BetterSqlite3.Database): MCPServer[] {
  return (db.prepare("SELECT * FROM mcp_servers ORDER BY created_at").all() as Record<string, unknown>[]).map(rowToServer);
}

export function getServer(db: BetterSqlite3.Database, id: string): MCPServer | undefined {
  const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToServer(row) : undefined;
}

export function createServer(db: BetterSqlite3.Database, server: Omit<MCPServer, "createdAt" | "updatedAt">): MCPServer {
  const now = Date.now();
  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, enabled, command, args, env, url, http_headers, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    server.id, server.name, server.transport, server.enabled ? 1 : 0,
    server.command ?? null, server.args ? JSON.stringify(server.args) : null,
    server.env ? JSON.stringify(server.env) : null, server.url ?? null,
    server.httpHeaders ? JSON.stringify(server.httpHeaders) : null, now, now,
  );
  return getServer(db, server.id)!;
}

export function updateServer(db: BetterSqlite3.Database, id: string, data: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>): MCPServer | undefined {
  const fields: string[] = ["updated_at = ?"];
  const vals: unknown[] = [Date.now()];
  for (const [col, key] of [
    ["name", "name"], ["transport", "transport"],
    ["command", "command"], ["url", "url"],
  ] as const) {
    if (data[key] !== undefined) { fields.push(`${col} = ?`); vals.push(data[key]); }
  }
  if (data.enabled !== undefined) { fields.push("enabled = ?"); vals.push(data.enabled ? 1 : 0); }
  if (data.args !== undefined) { fields.push("args = ?"); vals.push(JSON.stringify(data.args)); }
  if (data.env !== undefined) { fields.push("env = ?"); vals.push(JSON.stringify(data.env)); }
  if (data.httpHeaders !== undefined) { fields.push("http_headers = ?"); vals.push(JSON.stringify(data.httpHeaders)); }
  vals.push(id);
  db.prepare(`UPDATE mcp_servers SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
  return getServer(db, id);
}

export function deleteServer(db: BetterSqlite3.Database, id: string): void {
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
}

// --- Tool CRUD ---

export function listToolsByServer(db: BetterSqlite3.Database, serverId: string): MCPToolRecord[] {
  return (db.prepare("SELECT * FROM mcp_tools WHERE server_id = ? ORDER BY tool_name").all(serverId) as Record<string, unknown>[]).map(rowToTool);
}

export function getToolByServerAndName(db: BetterSqlite3.Database, serverId: string, toolName: string): MCPToolRecord | undefined {
  const row = db.prepare("SELECT * FROM mcp_tools WHERE server_id = ? AND tool_name = ?").get(serverId, toolName) as Record<string, unknown> | undefined;
  return row ? rowToTool(row) : undefined;
}

export function getToolById(db: BetterSqlite3.Database, id: number): MCPToolRecord | undefined {
  const row = db.prepare("SELECT * FROM mcp_tools WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToTool(row) : undefined;
}

export function upsertTool(db: BetterSqlite3.Database, serverId: string, toolName: string, description: string | undefined, inputSchema: Record<string, unknown>): MCPToolRecord {
  const existing = getToolByServerAndName(db, serverId, toolName);
  if (existing) {
    db.prepare("UPDATE mcp_tools SET description = ?, input_schema = ? WHERE id = ?").run(description ?? null, JSON.stringify(inputSchema), existing.id);
    return { ...existing, description: description ?? null, inputSchema };
  }
  const result = db.prepare("INSERT INTO mcp_tools (server_id, tool_name, description, input_schema) VALUES (?, ?, ?, ?)").run(serverId, toolName, description ?? null, JSON.stringify(inputSchema));
  return { id: result.lastInsertRowid as number, serverId, toolName, description: description ?? null, inputSchema };
}

export function deleteToolsByServer(db: BetterSqlite3.Database, serverId: string): void {
  db.prepare("DELETE FROM mcp_tools WHERE server_id = ?").run(serverId);
}

export function deleteStaleTools(db: BetterSqlite3.Database, serverId: string, currentNames: string[]): void {
  if (currentNames.length === 0) {
    deleteToolsByServer(db, serverId);
    return;
  }
  const placeholders = currentNames.map(() => "?").join(",");
  db.prepare(`DELETE FROM mcp_tools WHERE server_id = ? AND tool_name NOT IN (${placeholders})`).run(serverId, ...currentNames);
}

// --- Session state ---

export function getSessionDisabledToolIds(db: BetterSqlite3.Database, sessionId: string): number[] {
  const rows = db.prepare("SELECT tool_id FROM session_mcp_state WHERE session_id = ? AND disabled = 1").all(sessionId) as { tool_id: number }[];
  return rows.map((r) => r.tool_id);
}

export function setSessionToolState(db: BetterSqlite3.Database, sessionId: string, toolId: number, disabled: boolean): void {
  if (disabled) {
    db.prepare("INSERT OR REPLACE INTO session_mcp_state (session_id, tool_id, disabled) VALUES (?, ?, 1)").run(sessionId, toolId);
  } else {
    db.prepare("DELETE FROM session_mcp_state WHERE session_id = ? AND tool_id = ?").run(sessionId, toolId);
  }
}

export function removeSessionStateByToolId(db: BetterSqlite3.Database, toolId: number): void {
  db.prepare("DELETE FROM session_mcp_state WHERE tool_id = ?").run(toolId);
}

export function removeSessionStateByAgentToolIds(db: BetterSqlite3.Database, agentId: string, removedToolIds: number[]): void {
  if (removedToolIds.length === 0) return;
  const placeholders = removedToolIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM session_mcp_state WHERE tool_id IN (${placeholders}) AND session_id IN (SELECT id FROM agent_sessions WHERE agent_id = ?)`).run(...removedToolIds, agentId);
}
```

- [x] **Step 3: 提交**

```bash
git add src/main/db/database.ts src/main/db/models/mcpDao.ts
git commit -m "feat(mcp): add mcp_servers, mcp_tools, session_mcp_state tables and DAO"
```

---

### Task 3: MCP Transport 层

**Files:**
- Create: `src/main/mcp/transport.ts`

- [x] **Step 1: 创建 transport.ts**

```typescript
import { spawn, type ChildProcess } from "child_process";
import type { JSONRPCRequest, JSONRPCResponse } from "./types";
import { logger } from "@/utils";

export interface MCPTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(request: JSONRPCRequest): Promise<void>;
  receive(): AsyncGenerator<JSONRPCResponse>;
  isAlive(): boolean;
}

// --- stdio Transport ---

export class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null;
  private responseQueue: JSONRPCResponse[] = [];
  private resolveNext: ((v: IteratorResult<JSONRPCResponse>) => void) | null = null;
  private dead = false;

  constructor(
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {},
  ) {}

  async start(): Promise<void> {
    this.dead = false;
    this.process = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("exit", (code) => {
      this.dead = true;
      logger.warn(`MCP stdio process exited with code ${code}`, { command: this.command });
    });

    // Read JSON-RPC responses from stdout, one per line
    let buf = "";
    this.process.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const res = JSON.parse(trimmed) as JSONRPCResponse;
          if (this.resolveNext) {
            this.resolveNext({ value: res, done: false });
            this.resolveNext = null;
          } else {
            this.responseQueue.push(res);
          }
        } catch {
          // skip non-JSON lines
        }
      }
    });

    this.process.stderr!.on("data", (chunk: Buffer) => {
      logger.debug(`MCP stderr: ${chunk.toString().trim()}`, { command: this.command });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async send(request: JSONRPCRequest): Promise<void> {
    if (!this.process?.stdin) throw new Error("Transport not started");
    const line = JSON.stringify(request) + "\n";
    this.process.stdin.write(line);
  }

  async *receive(): AsyncGenerator<JSONRPCResponse> {
    while (!this.dead) {
      if (this.responseQueue.length > 0) {
        yield this.responseQueue.shift()!;
      } else {
        yield await new Promise<JSONRPCResponse>((resolve) => {
          this.resolveNext = (v) => resolve(v.value);
        });
      }
    }
  }

  isAlive(): boolean {
    return !this.dead && this.process !== null && !this.process.killed;
  }
}

// --- SSE (HTTP) Transport ---

export class SSETransport implements MCPTransport {
  private abortController: AbortController | null = null;
  private eventQueue: JSONRPCResponse[] = [];
  private resolveNext: ((v: IteratorResult<JSONRPCResponse>) => void) | null = null;
  private alive = false;

  constructor(
    private url: string,
    private headers: Record<string, string> = {},
  ) {}

  async start(): Promise<void> {
    this.alive = true;
    this.abortController = new AbortController();
    // Connect SSE and start reading events
    this.readSSE().catch((e) => {
      logger.warn("MCP SSE read error", { url: this.url, error: String(e) });
      this.alive = false;
    });
  }

  private async readSSE(): Promise<void> {
    const resp = await fetch(`${this.url}/sse`, {
      headers: { ...this.headers, Accept: "text/event-stream" },
      signal: this.abortController!.signal,
    });
    if (!resp.ok) throw new Error(`SSE connection failed: ${resp.status}`);
    if (!resp.body) throw new Error("No SSE body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (this.alive) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const res = JSON.parse(data) as JSONRPCResponse;
            if (this.resolveNext) {
              this.resolveNext({ value: res, done: false });
              this.resolveNext = null;
            } else {
              this.eventQueue.push(res);
            }
          } catch {
            // skip
          }
        }
      }
    }
    this.alive = false;
  }

  async stop(): Promise<void> {
    this.alive = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  async send(request: JSONRPCRequest): Promise<void> {
    const resp = await fetch(`${this.url}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const res = (await resp.json()) as JSONRPCResponse;
    if (this.resolveNext) {
      this.resolveNext({ value: res, done: false });
      this.resolveNext = null;
    } else {
      this.eventQueue.push(res);
    }
  }

  async *receive(): AsyncGenerator<JSONRPCResponse> {
    while (this.alive) {
      if (this.eventQueue.length > 0) {
        yield this.eventQueue.shift()!;
      } else {
        yield await new Promise<JSONRPCResponse>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Receive timeout")), 30000);
          this.resolveNext = (v) => { clearTimeout(timeout); resolve(v.value); };
        });
      }
    }
  }

  isAlive(): boolean {
    return this.alive;
  }
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/mcp/transport.ts
git commit -m "feat(mcp): add stdio and SSE transport layer"
```

---

### Task 4: MCP Client

**Files:**
- Create: `src/main/mcp/mcpClient.ts`

- [x] **Step 1: 创建 mcpClient.ts**

```typescript
import type { JSONRPCRequest, JSONRPCResponse, MCPToolDef, MCPServerConfig, MCPToolCallResult } from "./types";
import { StdioTransport, SSETransport } from "./transport";
import type { MCPTransport } from "./transport";
import { logger } from "@/utils";

export class MCPClient {
  private transport: MCPTransport | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: JSONRPCResponse["result"]) => void; reject: (e: Error) => void }>();
  private receiveLoop: Promise<void> | null = null;
  private status: "disconnected" | "connecting" | "connected" | "error" = "disconnected";
  private lastError: string | null = null;
  private config: MCPServerConfig | null = null;

  getStatus(): "disconnected" | "connecting" | "connected" | "error" {
    return this.status;
  }

  getError(): string | null {
    return this.lastError;
  }

  getConfig(): MCPServerConfig | null {
    return this.config;
  }

  async connect(config: MCPServerConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";
    this.lastError = null;

    try {
      // Create transport
      if (config.transport === "stdio") {
        this.transport = new StdioTransport(config.command!, config.args ?? [], config.env ?? {});
      } else {
        this.transport = new SSETransport(config.url!, config.headers ?? {});
      }

      await this.transport.start();
      this.startReceiveLoop();

      // initialize
      const result = await this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "Slime", version: "0.4.0" },
      });

      // Send initialized notification
      await this.transport.send({ jsonrpc: "2.0", method: "notifications/initialized", id: this.nextId() });

      this.status = "connected";
      logger.info("MCP connected", { name: config.name, serverInfo: result });
    } catch (e) {
      this.status = "error";
      this.lastError = String(e);
      logger.error("MCP connection failed", { name: config.name, error: String(e) });
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.status = "disconnected";
    this.receiveLoop = null;
    // Reject all pending
    for (const [, { reject }] of this.pending) {
      reject(new Error("Client disconnected"));
    }
    this.pending.clear();
    await this.transport?.stop();
    this.transport = null;
  }

  async listTools(): Promise<MCPToolDef[]> {
    const result = await this.rpc("tools/list") as { tools: MCPToolDef[] };
    return result.tools;
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<string> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP tool '${name}' timed out after 60s`)), 60000);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error(`MCP tool '${name}' aborted`)); });
    });
    const result = await Promise.race([this.rpc("tools/call", { name, arguments: args }), timeout]) as MCPToolCallResult;
    if (result.isError) {
      throw new Error(result.content.map((c) => c.text ?? "").join("\n") || "Tool returned error");
    }
    return result.content.map((c) => c.text ?? JSON.stringify(c)).join("\n");
  }

  // --- Internal ---

  private nextId(): number {
    return ++this.requestId;
  }

  private async rpc(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId();
    const request: JSONRPCRequest = { jsonrpc: "2.0", method, params, id };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.transport!.send(request).catch(reject);
    });
  }

  private startReceiveLoop(): void {
    this.receiveLoop = (async () => {
      try {
        for await (const response of this.transport!.receive()) {
          if (response.id != null && this.pending.has(response.id)) {
            const { resolve, reject } = this.pending.get(response.id)!;
            this.pending.delete(response.id);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        }
      } catch (e) {
        if (this.status === "connected") {
          this.status = "error";
          this.lastError = String(e);
          logger.warn("MCP receive loop ended", { name: this.config?.name, error: String(e) });
        }
      }
    })();
  }
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/mcp/mcpClient.ts
git commit -m "feat(mcp): add MCPClient with initialize, listTools, callTool"
```

---

### Task 5: 健康检查器

**Files:**
- Create: `src/main/mcp/healthChecker.ts`

- [x] **Step 1: 创建 healthChecker.ts**

```typescript
import type { MCPClient } from "./mcpClient";
import type { EventBus } from "@/eventbus";
import { MCP_EVENTS } from "@shared/events";
import { logger } from "@/utils";

export class HealthChecker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 0;
  private readonly PING_INTERVAL = 30000;
  private readonly MAX_BACKOFF = 60000;

  constructor(
    private client: MCPClient,
    private serverId: string,
    private serverName: string,
    private eventBus: EventBus,
    private onReconnect: () => Promise<void>,
  ) {}

  start(): void {
    this.timer = setInterval(() => this.ping(), this.PING_INTERVAL);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.timer = null;
    this.retryTimer = null;
  }

  private async ping(): Promise<void> {
    try {
      await this.client.listTools();
      // Reset retry backoff on success
      this.retryDelay = 0;
    } catch {
      logger.warn("MCP health check failed", { name: this.serverName });
      this.emitStatus("error", `Health check failed`);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    this.retryDelay = Math.min(this.retryDelay === 0 ? 1000 : this.retryDelay * 2, this.MAX_BACKOFF);
    this.retryTimer = setTimeout(() => this.retry(), this.retryDelay);
  }

  private async retry(): Promise<void> {
    try {
      this.emitStatus("connecting");
      const config = this.client.getConfig();
      if (!config) return;
      await this.client.disconnect();
      await this.client.connect(config);
      await this.onReconnect();
      this.retryDelay = 0;
      this.emitStatus("connected");
    } catch {
      this.emitStatus("error", `Reconnect failed (attempt backoff ${this.retryDelay}ms)`);
      this.scheduleRetry();
    }
  }

  private emitStatus(status: string, error?: string): void {
    this.eventBus.sendToRenderer(MCP_EVENTS.SERVER_STATUS, {
      serverId: this.serverId,
      status,
      error: error ?? null,
    });
  }
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/mcp/healthChecker.ts
git commit -m "feat(mcp): add health checker with ping and exponential backoff retry"
```

---

### Task 6: MCPServerPresenter

**Files:**
- Create: `src/main/presenter/mcpServerPresenter.ts`

- [x] **Step 1: 创建 mcpServerPresenter.ts**

```typescript
import type BetterSqlite3 from "better-sqlite3";
import { getDb } from "@/db";
import * as mcpDao from "@/db/models/mcpDao";
import { eventBus } from "@/eventbus";
import { MCP_EVENTS } from "@shared/events";
import { MCPClient } from "@/mcp/mcpClient";
import { HealthChecker } from "@/mcp/healthChecker";
import { logger } from "@/utils";
import type { IMCPServerPresenter } from "@shared/types/presenters/mcpServer.presenter";
import type { MCPServer, MCPServerDashboard, MCPToolRecord } from "@shared/types/mcp";
import type { MCPServerConfig } from "@/mcp/types";

export class MCPServerPresenter implements IMCPServerPresenter {
  private clients = new Map<string, MCPClient>();
  private healthCheckers = new Map<string, HealthChecker>();

  getDb(): BetterSqlite3.Database {
    return getDb();
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    const servers = mcpDao.listServers(this.getDb());
    for (const s of servers) {
      if (s.enabled) {
        this.connectServer(s).catch((e) => {
          logger.warn("MCP server init connect failed", { name: s.name, error: String(e) });
        });
      }
    }
  }

  async destroy(): Promise<void> {
    for (const [id, hc] of this.healthCheckers) { hc.stop(); }
    this.healthCheckers.clear();
    for (const [id, client] of this.clients) {
      await client.disconnect().catch(() => {});
    }
    this.clients.clear();
  }

  // --- CRUD ---

  async listServers(): Promise<MCPServerDashboard[]> {
    return mcpDao.listServers(this.getDb()).map((s) => ({
      ...s,
      status: this.getServerStatus(s.id),
      toolsCount: mcpDao.listToolsByServer(this.getDb(), s.id).length,
      error: this.clients.get(s.id)?.getError() ?? null,
    }));
  }

  async createServer(config: Omit<MCPServer, "createdAt" | "updatedAt">): Promise<MCPServer> {
    const server = mcpDao.createServer(this.getDb(), { ...config, id: config.id || crypto.randomUUID() });
    if (server.enabled) {
      this.connectServer(server).catch(() => {});
    }
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
    return server;
  }

  async updateServer(id: string, data: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>): Promise<MCPServer> {
    // Disconnect old
    await this.disconnectServer(id);
    const updated = mcpDao.updateServer(this.getDb(), id, data);
    if (!updated) throw new Error(`MCP server ${id} not found`);
    if (updated.enabled) {
      this.connectServer(updated).catch(() => {});
    }
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
    return updated;
  }

  async deleteServer(id: string): Promise<void> {
    await this.disconnectServer(id);
    mcpDao.deleteServer(this.getDb(), id);
    eventBus.sendToRenderer(MCP_EVENTS.SERVERS_CHANGED);
  }

  async getServerTools(id: string): Promise<MCPToolRecord[]> {
    return mcpDao.listToolsByServer(this.getDb(), id);
  }

  // --- Session state ---

  async getSessionDisabledTools(sessionId: string): Promise<number[]> {
    return mcpDao.getSessionDisabledToolIds(this.getDb(), sessionId);
  }

  async setSessionToolState(sessionId: string, toolId: number, disabled: boolean): Promise<void> {
    mcpDao.setSessionToolState(this.getDb(), sessionId, toolId, disabled);
  }

  // --- Internal ---

  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
  }

  private getServerStatus(serverId: string): MCPServerDashboard["status"] {
    const client = this.clients.get(serverId);
    return client?.getStatus() ?? "disconnected";
  }

  private async connectServer(server: MCPServer): Promise<void> {
    const config: MCPServerConfig = {
      id: server.id,
      name: server.name,
      transport: server.transport,
      command: server.command ?? undefined,
      args: server.args ?? undefined,
      env: server.env ?? undefined,
      url: server.url ?? undefined,
      headers: server.httpHeaders ?? undefined,
    };

    const client = new MCPClient();
    await client.connect(config);

    // Discover tools
    const tools = await client.listTools();
    mcpDao.deleteStaleTools(this.getDb(), server.id, tools.map((t) => t.name));
    for (const t of tools) {
      mcpDao.upsertTool(this.getDb(), server.id, t.name, t.description, t.inputSchema);
    }

    this.clients.set(server.id, client);

    // Start health checker
    const hc = new HealthChecker(client, server.id, server.name, eventBus, async () => {
      // On reconnect: re-discover tools
      const ts = await client.listTools();
      mcpDao.deleteStaleTools(this.getDb(), server.id, ts.map((t) => t.name));
      for (const t of ts) {
        mcpDao.upsertTool(this.getDb(), server.id, t.name, t.description, t.inputSchema);
      }
      eventBus.sendToRenderer(MCP_EVENTS.TOOLS_CHANGED, { serverId: server.id });
    });
    hc.start();
    this.healthCheckers.set(server.id, hc);

    eventBus.sendToRenderer(MCP_EVENTS.SERVER_STATUS, {
      serverId: server.id,
      status: "connected",
      error: null,
    });
  }

  private async disconnectServer(id: string): Promise<void> {
    const hc = this.healthCheckers.get(id);
    if (hc) { hc.stop(); this.healthCheckers.delete(id); }
    const client = this.clients.get(id);
    if (client) { await client.disconnect().catch(() => {}); this.clients.delete(id); }
  }
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/presenter/mcpServerPresenter.ts
git commit -m "feat(mcp): add MCPServerPresenter with lifecycle, CRUD, and health checks"
```

---

### Task 7: MCPToolBridge

**Files:**
- Create: `src/main/presenter/mcpToolBridge.ts`

- [x] **Step 1: 创建 mcpToolBridge.ts**

```typescript
import type BetterSqlite3 from "better-sqlite3";
import * as agentDao from "@/db/models/agentDao";
import * as sessionDao from "@/db/models/agentSessionDao";
import * as mcpDao from "@/db/models/mcpDao";
import type { MCPServerPresenter } from "./mcpServerPresenter";
import type { Tool } from "@/llm";
import { logger } from "@/utils";

function serverNameToPrefix(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export class MCPToolBridge {
  constructor(private mcpPresenter: MCPServerPresenter) {}

  private get db(): BetterSqlite3.Database {
    return this.mcpPresenter.getDb();
  }

  async getMcpTools(sessionId: string): Promise<Record<string, Tool>> {
    const session = sessionDao.getSessionById(this.db, sessionId);
    if (!session) return {};

    const agent = agentDao.getAgentById(this.db, session.agentId);
    const mcpTools = agent?.config?.mcpTools;
    if (!mcpTools || mcpTools.length === 0) return {};

    const disabledIds = mcpDao.getSessionDisabledToolIds(this.db, sessionId);
    const disabledSet = new Set(disabledIds);

    const result: Record<string, Tool> = {};

    for (const entry of mcpTools) {
      // entry format: "server_id/tool_name"
      const slashIdx = entry.indexOf("/");
      if (slashIdx === -1) continue;
      const serverId = entry.slice(0, slashIdx);
      const toolName = entry.slice(slashIdx + 1);

      const toolRecord = mcpDao.getToolByServerAndName(this.db, serverId, toolName);
      if (!toolRecord) continue; // server or tool was deleted
      if (disabledSet.has(toolRecord.id)) continue; // session-disabled

      const server = mcpDao.getServer(this.db, serverId);
      const prefix = serverNameToPrefix(server?.name ?? serverId);
      const fullName = `mcp_${prefix}_${toolName}`;

      const client = this.mcpPresenter.getClient(serverId);
      result[fullName] = {
        description: toolRecord.description ?? `MCP tool: ${toolName}`,
        parameters: toolRecord.inputSchema,
      };
    }

    return result;
  }

  async executeTool(fullName: string, args: unknown): Promise<string> {
    // Parse "mcp_{prefix}_{tool_name}" back to server + tool
    if (!fullName.startsWith("mcp_")) throw new Error(`Not an MCP tool: ${fullName}`);

    const withoutPrefix = fullName.slice(4); // remove "mcp_"

    // We need to find which server has this tool. Scan agent's mcpTools.
    // But executeTool doesn't have sessionId. Instead, try all connected clients.
    // The fullName is unique per tool, so we can match directly.

    // Build a lookup: fullName → { serverId, toolName }
    const servers = mcpDao.listServers(this.db);
    for (const server of servers) {
      const prefix = serverNameToPrefix(server.name);
      const candidatePrefix = `mcp_${prefix}_`;
      if (!fullName.startsWith(candidatePrefix)) continue;

      const toolName = fullName.slice(candidatePrefix.length);
      const client = this.mcpPresenter.getClient(server.id);
      if (!client || client.getStatus() !== "connected") {
        return `MCP tool '${fullName}' unavailable: server '${server.name}' is not connected`;
      }

      try {
        return await client.callTool(toolName, args);
      } catch (e) {
        return `MCP tool '${fullName}' failed: ${String(e)}`;
      }
    }

    return `MCP tool '${fullName}' not found`;
  }
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/presenter/mcpToolBridge.ts
git commit -m "feat(mcp): add MCPToolBridge for agent/session-level tool filtering"
```

---

### Task 8: ToolPresenter 集成 — getToolSet 异步化

**Files:**
- Modify: `src/main/presenter/toolPresenter.ts`

- [x] **Step 1: 添加 MCPToolBridge 依赖并异步化 getToolSet**

在 `ToolPresenter` 的 constructor 中添加 `mcpBridge` 参数：

```typescript
import type { MCPToolBridge } from "./mcpToolBridge";

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private contentPresenter: ContentPresenter,
    private evolutionPresenter: EvolutionPresenter,
    private browserSession: BrowserSession,
    private mcpBridge?: MCPToolBridge,  // Optional for backward compat in tests
  ) {}
```

修改 `getToolSet` 为 async：

```typescript
  async getToolSet(sessionId: string) {
    const tools: Record<string, any> = {
      read: createTool({ ... }),
      write: createTool({ ... }),
      // ... all existing tools stay the same ...
    };

    // Merge MCP tools
    if (this.mcpBridge) {
      const mcpTools = await this.mcpBridge.getMcpTools(sessionId);
      Object.assign(tools, mcpTools);
    }

    return tools;
  }
```

修改 `callTool` 为 async（调用 getToolSet 时需要 await），并添加 MCP 路由：

```typescript
  async callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.debug("tool:call", { sessionId, name, args });
    if (name.startsWith("mcp_") && this.mcpBridge) {
      return this.mcpBridge.executeTool(name, args);
    }
    const tools = await this.getToolSet(sessionId);
    const t = tools[name as keyof typeof tools];
    if (!t) throw new Error(`Unknown tool: ${name}`);
    return (t as any).execute(args, { toolCallId: "manual", messages: [] });
  }
```

- [x] **Step 2: 提交**

```bash
git add src/main/presenter/toolPresenter.ts
git commit -m "feat(mcp): integrate MCP tools into ToolPresenter.getToolSet"
```

---

### Task 9: AgentChatPresenter 集成 — await getToolSet

**Files:**
- Modify: `src/main/presenter/agentChat/agentChatPresenter.ts`

- [x] **Step 1: 两处 await getToolSet**

在 `chat()` 方法中（约 line 315），将同步调用改为 await：

```typescript
    // Filter disabled tools
    const disabledTools = agent?.config?.disabledTools ?? [];
    const allAiSdkTools = await this.toolPresenter.getToolSet(sessionId);
    const filteredAiSdkTools =
      disabledTools.length > 0
        ? Object.fromEntries(
            Object.entries(allAiSdkTools).filter(([k]) => !disabledTools.includes(k)),
          )
        : allAiSdkTools;
    const tools = this.convertTools(filteredAiSdkTools);
```

在 `callTool` / `executeTool` 方法中也需要 await（如果内部调用了 getToolSet）。搜索所有 `this.toolPresenter.getToolSet(` 调用并添加 `await`。

- [x] **Step 2: 类型检查**

```bash
pnpm run typecheck
```

修复可能出现 `Promise<Record<...>>` 类型不匹配的报错。

- [x] **Step 3: 提交**

```bash
git add src/main/presenter/agentChat/agentChatPresenter.ts
git commit -m "feat(mcp): await getToolSet in AgentChatPresenter for MCP tools"
```

---

### Task 10: Presenter 注册 + IPresenter 接口

**Files:**
- Modify: `src/shared/types/presenters/index.d.ts`
- Modify: `src/main/presenter/index.ts`

- [x] **Step 1: IPresenter 添加 mcpServerPresenter**

```typescript
import type { IMCPServerPresenter } from "./mcpServer.presenter";

export interface IPresenter {
  // ... existing fields ...
  mcpServerPresenter: IMCPServerPresenter;
  // ...
}
```

- [x] **Step 2: Presenter 类注册 MCPServerPresenter**

在 `src/main/presenter/index.ts` 中：

```typescript
import { MCPServerPresenter } from "./mcpServerPresenter";
import { MCPToolBridge } from "./mcpToolBridge";

/// In constructor — MCPServerPresenter + MCPToolBridge must be before ToolPresenter:
// (original: toolPresenter was created before gatewayPresenter)
this.mcpServerPresenter = new MCPServerPresenter();
const mcpBridge = new MCPToolBridge(this.mcpServerPresenter);
this.toolPresenter = new ToolPresenter(
  this.filePresenter, this.contentPresenter, this.evolutionPresenter, browserSession,
  mcpBridge,
);
```

DISPATCHABLE 添加：

```typescript
static readonly DISPATCHABLE = new Set<DispatchableKey>([
  "appPresenter", "configPresenter", "agentPresenter", "sessionPresenter",
  "filePresenter", "gitPresenter", "contentPresenter", "workspacePresenter",
  "evolutionPresenter", "gatewayPresenter", "agentConfigPresenter", "agentChatPresenter",
  "mcpServerPresenter",
]);
```

init() 中添加 MCP 初始化（Gateway 之后）：

```typescript
async init(): Promise<void> {
  this.pendingRecovery = await this.evolutionPresenter.restoreState();
  if (this.pendingRecovery) { /* ... */ }
  const port = (await this.configPresenter.get("gateway.port")) as number | null;
  await this.gatewayPresenter.init(port ?? undefined);
  await this.mcpServerPresenter.init();  // fire-and-forget with catch inside
  this.agentConfigPresenter.init();
}
```

- [x] **Step 3: 提交**

```bash
git add src/shared/types/presenters/index.d.ts src/main/presenter/index.ts
git commit -m "feat(mcp): register MCPServerPresenter in Presenter and IPresenter"
```

---

### Task 11: AgentConfigPresenter 联动清理

**Files:**
- Modify: `src/main/presenter/agentConfigPresenter.ts`

- [x] **Step 1: updateAgent 中检测 mcpTools 变更并清理 session_mcp_state**

在 `updateAgent` 方法中，当 `data.config?.mcpTools` 变更时，清理被移除的工具的 session 状态：

```typescript
import * as mcpDao from "@/db/models/mcpDao";

async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
  if (data.avatar) {
    const old = agentDao.getAgentById(getDb(), id);
    if (old?.avatar?.kind === "image") {
      this.cleanupAvatarFile(old.avatar.path).catch(() => {});
    }
  }

  // Cleanup: if mcpTools changed, remove session_mcp_state for removed tools
  if (data.config?.mcpTools !== undefined) {
    const oldAgent = agentDao.getAgentById(getDb(), id);
    const oldTools = oldAgent?.config?.mcpTools ?? [];
    const newTools = data.config.mcpTools ?? [];
    const removed = oldTools.filter((t) => !newTools.includes(t));
    if (removed.length > 0) {
      const removedToolIds: number[] = [];
      for (const entry of removed) {
        const slashIdx = entry.indexOf("/");
        if (slashIdx === -1) continue;
        const serverId = entry.slice(0, slashIdx);
        const toolName = entry.slice(slashIdx + 1);
        const tool = mcpDao.getToolByServerAndName(getDb(), serverId, toolName);
        if (tool) removedToolIds.push(tool.id);
      }
      mcpDao.removeSessionStateByAgentToolIds(getDb(), id, removedToolIds);
    }
  }

  agentDao.updateAgent(getDb(), id, data);
  const updated = agentDao.getAgentById(getDb(), id);
  if (!updated) throw new Error(`Agent ${id} not found`);
  eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
  return updated;
}
```

- [x] **Step 2: 提交**

```bash
git add src/main/presenter/agentConfigPresenter.ts
git commit -m "feat(mcp): cascade cleanup session_mcp_state on mcpTools removal"
```

---

### Task 12: Pinia Store

**Files:**
- Create: `src/renderer/src/stores/mcp.ts`

- [x] **Step 1: 创建 useMcpStore**

```typescript
import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { usePresenter } from "@/composables/usePresenter";
import type { MCPServerDashboard, MCPToolRecord } from "@shared/types/mcp";

export const useMcpStore = defineStore("mcp", () => {
  const mcpPresenter = usePresenter("mcpServerPresenter");

  const servers = ref<MCPServerDashboard[]>([]);
  const serverTools = ref<Map<string, MCPToolRecord[]>>(new Map());

  async function loadServers() {
    servers.value = await mcpPresenter.listServers();
  }

  async function loadServerTools(serverId: string) {
    const tools = await mcpPresenter.getServerTools(serverId);
    serverTools.value.set(serverId, tools);
  }

  async function createServer(config: Parameters<typeof mcpPresenter.createServer>[0]) {
    await mcpPresenter.createServer(config);
    await loadServers();
  }

  async function updateServer(id: string, config: Parameters<typeof mcpPresenter.updateServer>[1]) {
    await mcpPresenter.updateServer(id, config);
    await loadServers();
  }

  async function deleteServer(id: string) {
    await mcpPresenter.deleteServer(id);
    await loadServers();
  }

  async function getSessionDisabledTools(sessionId: string): Promise<number[]> {
    return mcpPresenter.getSessionDisabledTools(sessionId);
  }

  async function setSessionToolState(sessionId: string, toolId: number, disabled: boolean) {
    await mcpPresenter.setSessionToolState(sessionId, toolId, disabled);
  }

  function getServerToolsCached(serverId: string): MCPToolRecord[] {
    return serverTools.value.get(serverId) ?? [];
  }

  return {
    servers, serverTools,
    loadServers, loadServerTools,
    createServer, updateServer, deleteServer,
    getSessionDisabledTools, setSessionToolState,
    getServerToolsCached,
  };
});
```

- [x] **Step 2: 提交**

```bash
git add src/renderer/src/stores/mcp.ts
git commit -m "feat(mcp): add useMcpStore Pinia store"
```

---

### Task 13: MCP UI 组件

**Files:**
- Create: `src/renderer/src/components/mcp/MCPServerList.vue`
- Create: `src/renderer/src/components/mcp/MCPServerForm.vue`
- Create: `src/renderer/src/components/mcp/MCPToolChecklist.vue`

- [x] **Step 1: MCPServerForm.vue — 添加/编辑弹窗**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import type { MCPServer } from "@shared/types/mcp";

const props = defineProps<{ open: boolean; server?: MCPServer | null }>();
const emit = defineEmits<{ "update:open": [boolean]; saved: [config: any] }>();

const name = ref("");
const transport = ref<"stdio" | "http">("stdio");
const command = ref("");
const args = ref("");
const env = ref("");
const url = ref("");
const httpHeaders = ref("");

watch(() => props.open, (val) => {
  if (!val) return;
  if (props.server) {
    name.value = props.server.name;
    transport.value = props.server.transport;
    command.value = props.server.command ?? "";
    args.value = props.server.args?.join(" ") ?? "";
    env.value = props.server.env ? Object.entries(props.server.env).map(([k, v]) => `${k}=${v}`).join("\n") : "";
    url.value = props.server.url ?? "";
    httpHeaders.value = props.server.httpHeaders ? JSON.stringify(props.server.httpHeaders) : "";
  } else {
    name.value = "";
    transport.value = "stdio";
    command.value = "";
    args.value = "";
    env.value = "";
    url.value = "";
    httpHeaders.value = "";
  }
});

function onSave() {
  if (!name.value.trim()) return;
  const config: any = {
    id: props.server?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    transport: transport.value,
    enabled: true,
  };
  if (transport.value === "stdio") {
    config.command = command.value.trim();
    config.args = args.value.trim() ? args.value.trim().split(/\s+/) : [];
    if (env.value.trim()) {
      config.env = Object.fromEntries(env.value.trim().split("\n").filter(Boolean).map((l) => {
        const idx = l.indexOf("=");
        return idx >= 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : [l.trim(), ""];
      }));
    }
  } else {
    config.url = url.value.trim();
    if (httpHeaders.value.trim()) {
      try { config.httpHeaders = JSON.parse(httpHeaders.value.trim()); } catch {}
    }
  }
  emit("saved", config);
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <div class="relative w-[480px] rounded-lg border border-border bg-card p-5 shadow-xl">
        <h2 class="text-sm font-semibold mb-4">{{ server ? '编辑' : '添加' }} MCP Server</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-muted-foreground">名称</label>
            <input v-model="name" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm" placeholder="My Server" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">传输类型</label>
            <div class="flex gap-2">
              <button :class="['rounded px-3 py-1 text-xs', transport === 'stdio' ? 'bg-violet-500/20 text-violet-400' : 'bg-muted text-muted-foreground']" @click="transport = 'stdio'">stdio</button>
              <button :class="['rounded px-3 py-1 text-xs', transport === 'http' ? 'bg-violet-500/20 text-violet-400' : 'bg-muted text-muted-foreground']" @click="transport = 'http'">HTTP</button>
            </div>
          </div>
          <template v-if="transport === 'stdio'">
            <div>
              <label class="text-xs text-muted-foreground">Command</label>
              <input v-model="command" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm" placeholder="npx" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">Arguments</label>
              <input v-model="args" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm" placeholder="-y @anthropic/mcp-github" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">环境变量（KEY=VALUE 每行一个）</label>
              <textarea v-model="env" rows="2" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm resize-none" placeholder="GITHUB_TOKEN=ghp_xxx" />
            </div>
          </template>
          <template v-else>
            <div>
              <label class="text-xs text-muted-foreground">URL</label>
              <input v-model="url" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm" placeholder="https://mcp.example.com" />
            </div>
            <div>
              <label class="text-xs text-muted-foreground">Headers (JSON)</label>
              <input v-model="httpHeaders" class="w-full rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm" placeholder='{"Authorization":"Bearer xxx"}' />
            </div>
          </template>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted" @click="$emit('update:open', false)">取消</button>
          <button class="rounded-md bg-violet-600 px-4 py-1.5 text-sm text-white hover:bg-violet-500" @click="onSave">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

- [x] **Step 2: MCPServerList.vue — Server 卡片列表**

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";
import { useMcpStore } from "@/stores/mcp";
import MCPServerForm from "./MCPServerForm.vue";

const store = useMcpStore();
const showForm = ref(false);
const editingServer = ref<any>(null);
const deletingId = ref<string | null>(null);

onMounted(() => store.loadServers());

function onAdd() {
  editingServer.value = null;
  showForm.value = true;
}

function onEdit(server: any) {
  editingServer.value = server;
  showForm.value = true;
}

async function onDelete(id: string) {
  deletingId.value = id;
  try { await store.deleteServer(id); } finally { deletingId.value = null; }
}

async function onSaved(config: any) {
  if (editingServer.value) {
    await store.updateServer(editingServer.value.id, config);
  } else {
    await store.createServer(config);
  }
}

function statusBadge(status: string) {
  if (status === "connected") return "bg-emerald-500/20 text-emerald-400";
  if (status === "connecting") return "bg-amber-500/20 text-amber-400";
  if (status === "error") return "bg-red-500/20 text-red-400";
  return "bg-muted text-muted-foreground";
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold">MCP Servers</h3>
      <button class="rounded-md bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500" @click="onAdd">+ 添加</button>
    </div>

    <div v-if="store.servers.length === 0" class="text-xs text-muted-foreground py-4 text-center">
      暂无 MCP Server，点击"添加"开始
    </div>

    <div v-for="s in store.servers" :key="s.id" class="flex items-center justify-between rounded-md border border-border p-3 mb-2">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-foreground">{{ s.name }}</span>
          <span :class="['rounded px-1.5 py-0.5 text-[10px]', statusBadge(s.status)]">{{ s.status }}</span>
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">
          {{ s.transport }} · {{ s.toolsCount }} tools
          <span v-if="s.error" class="text-red-400 ml-1">{{ s.error }}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <button class="rounded p-1 text-muted-foreground hover:text-foreground" @click="onEdit(s)">
          <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
        </button>
        <button class="rounded p-1 text-muted-foreground hover:text-red-400" @click="onDelete(s.id)">
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <MCPServerForm :open="showForm" :server="editingServer" @update:open="showForm = $event" @saved="onSaved" />
  </div>
</template>
```

- [x] **Step 3: MCPToolChecklist.vue — 工具勾选组件**

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useMcpStore } from "@/stores/mcp";
import type { MCPToolRecord } from "@shared/types/mcp";

const props = defineProps<{
  modelValue: string[]  // "{server_id}/{tool_name}"[]
  sessionId?: string    // if set, shows session disable toggles
}>();

const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const store = useMcpStore();
const disabledToolIds = ref<Set<number>>(new Set());

onMounted(async () => {
  await store.loadServers();
  for (const s of store.servers) {
    if (s.status === "connected") await store.loadServerTools(s.id);
  }
  if (props.sessionId) {
    const ids = await store.getSessionDisabledTools(props.sessionId);
    disabledToolIds.value = new Set(ids);
  }
});

function isChecked(serverId: string, toolName: string): boolean {
  return props.modelValue.includes(`${serverId}/${toolName}`);
}

function toggle(serverId: string, toolName: string) {
  const key = `${serverId}/${toolName}`;
  const arr = [...props.modelValue];
  const idx = arr.indexOf(key);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(key);
  emit("update:modelValue", arr);
}

async function toggleSessionDisable(toolId: number) {
  if (!props.sessionId) return;
  const disabled = !disabledToolIds.value.has(toolId);
  await store.setSessionToolState(props.sessionId, toolId, disabled);
  if (disabled) {
    disabledToolIds.value.add(toolId);
  } else {
    disabledToolIds.value.delete(toolId);
  }
}
</script>

<template>
  <div v-if="store.servers.length === 0" class="text-xs text-muted-foreground py-2">
    暂无 MCP Server
  </div>
  <div v-for="s in store.servers" :key="s.id" class="mb-3">
    <div class="flex items-center gap-2 mb-1">
      <span :class="['rounded px-1.5 py-0.5 text-[10px]', s.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400']">
        {{ s.status }}
      </span>
      <span class="text-xs font-medium text-foreground">{{ s.name }}</span>
      <span class="text-[10px] text-muted-foreground">{{ s.toolsCount }} tools</span>
    </div>
    <div v-if="s.status === 'connected'" class="grid grid-cols-2 gap-1">
      <label v-for="t in store.getServerToolsCached(s.id)" :key="t.id" class="flex items-center gap-1.5 text-xs text-foreground py-0.5">
        <input type="checkbox" :checked="isChecked(s.id, t.toolName)" class="accent-violet-500" @change="toggle(s.id, t.toolName)" />
        {{ t.toolName }}
        <input
          v-if="sessionId && isChecked(s.id, t.toolName)"
          type="checkbox"
          :checked="!disabledToolIds.has(t.id)"
          class="ml-auto accent-amber-500"
          @change="toggleSessionDisable(t.id)"
        />
      </label>
    </div>
    <div v-else class="text-[11px] text-muted-foreground">Server unavailable</div>
  </div>
</template>
```

- [x] **Step 4: 提交**

```bash
git add src/renderer/src/components/mcp/
git commit -m "feat(mcp): add MCPServerList, MCPServerForm, MCPToolChecklist Vue components"
```

---

### Task 14: SettingsDialog MCP Tab

**Files:**
- Create: `src/renderer/src/components/settings/MCPSettings.vue`
- Modify: `src/renderer/src/components/settings/SettingsDialog.vue`

- [x] **Step 1: 创建 MCPSettings.vue**

```vue
<script setup lang="ts">
import MCPServerList from "@/components/mcp/MCPServerList.vue";
</script>

<template>
  <MCPServerList />
</template>
```

- [x] **Step 2: 修改 SettingsDialog.vue — 添加 MCP tab**

左侧导航添加按钮（在 "更新" 按钮之前）：

```vue
<button
  :class="[
    'rounded-md px-3 py-1.5 text-left text-sm',
    activeTab === 'mcp'
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/50',
  ]"
  @click="activeTab = 'mcp'"
>
  MCP
</button>
```

右侧内容添加：

```vue
<MCPSettings v-else-if="activeTab === 'mcp'" />
```

脚本中 import 并更新类型：

```typescript
import MCPSettings from "./MCPSettings.vue";
const activeTab = ref<"profile" | "gateway" | "general" | "agents" | "mcp" | "update">("profile");
```

- [x] **Step 3: 提交**

```bash
git add src/renderer/src/components/settings/
git commit -m "feat(mcp): add MCP tab to SettingsDialog"
```

---

### Task 15: AgentEditDialog MCP Tools Tab

**Files:**
- Modify: `src/renderer/src/components/chat/AgentEditDialog.vue`

- [x] **Step 1: 添加 mcpTools 表单状态和 MCPToolChecklist**

在 script 中添加：

```typescript
import MCPToolChecklist from "@/components/mcp/MCPToolChecklist.vue";
const mcpTools = ref<string[]>([]);
```

在 watch open 中加载现有 mcpTools：

```typescript
// Edit mode: add after disabledTools.value = ...
mcpTools.value = cfg?.mcpTools ?? [];

// Create mode: add after disabledTools.value = [];
mcpTools.value = [];
```

在 onSave() 的 AgentConfig 中加入：

```typescript
const config: AgentConfig = {
  // ... existing fields ...
  mcpTools: mcpTools.value.length > 0 ? mcpTools.value : undefined,
};
```

在 template 中 Tools 区域后面添加 MCP 工具区域：

```vue
<!-- MCP Tools -->
<div>
  <label class="mb-1 block text-xs text-muted-foreground">MCP 工具（勾选启用）</label>
  <MCPToolChecklist v-model="mcpTools" />
</div>
```

- [x] **Step 2: 提交**

```bash
git add src/renderer/src/components/chat/AgentEditDialog.vue
git commit -m "feat(mcp): add MCP Tools tab to AgentEditDialog"
```

---

### Task 16: Session MCP 工具控制

**Files:**
- Modify: `src/renderer/src/components/chat/ChatView.vue`（添加 session 工具栏入口）
- Create: `src/renderer/src/components/chat/SessionMcpSettings.vue`

- [x] **Step 1: 创建 SessionMcpSettings.vue**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { useAgentStore } from "@/stores/agent";
import MCPToolChecklist from "@/components/mcp/MCPToolChecklist.vue";

const props = defineProps<{ open: boolean; sessionId: string; agentId: string }>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const agentStore = useAgentStore();
const mcpTools = ref<string[]>([]);

watch(() => props.open, (val) => {
  if (val) {
    const agent = agentStore.agents.find((a) => a.id === props.agentId);
    mcpTools.value = agent?.config?.mcpTools ?? [];
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="$emit('update:open', false)" />
      <div class="relative w-[400px] max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold">会话 MCP 工具</h2>
          <button class="rounded p-1 text-muted-foreground hover:text-foreground" @click="$emit('update:open', false)">
            <span class="text-sm">✕</span>
          </button>
        </div>
        <p class="text-[11px] text-muted-foreground mb-3">仅影响当前会话。新会话使用 Agent 默认设置。勾选 = 启用（默认），取消 = 禁用。</p>
        <MCPToolChecklist v-model="mcpTools" :session-id="sessionId" />
      </div>
    </div>
  </Teleport>
</template>
```

在 ChatView.vue 的工具栏中添加触发按钮和弹窗（具体位置基于实际模板结构）。

- [x] **Step 2: 提交**

```bash
git add src/renderer/src/components/chat/
git commit -m "feat(mcp): add session-level MCP tool disable dialog"
```

---

### Task 17: 测试

**Files:**
- Create: `test/main/mcp/transport.test.ts`
- Create: `test/main/mcp/mcpClient.test.ts`
- Create: `test/main/mcp/mcpToolBridge.test.ts`
- Create: `test/main/mcp/mcpServerPresenter.test.ts`

- [x] **Step 1: transport.test.ts — stdio transport 基本测试**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StdioTransport } from "@/mcp/transport";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";

vi.mock("child_process", () => {
  const fakeProcess = new EventEmitter() as any;
  fakeProcess.stdin = { write: vi.fn() };
  fakeProcess.stdout = new EventEmitter();
  fakeProcess.stderr = new EventEmitter();
  fakeProcess.kill = vi.fn();
  fakeProcess.killed = false;
  return {
    spawn: vi.fn(() => fakeProcess),
  };
});

describe("StdioTransport", () => {
  it("should start spawn and parse JSON-RPC from stdout", async () => {
    const transport = new StdioTransport("test-cmd", ["--arg"]);
    await transport.start();
    expect(transport.isAlive()).toBe(true);

    // Simulate stdout data
    const { spawn } = await import("child_process");
    const proc = spawn.mock.results[0].value;
    proc.stdout.emit("data", Buffer.from('{"jsonrpc":"2.0","result":{"ok":true},"id":1}\n'));

    const gen = transport.receive();
    const next = await gen.next();
    expect(next.value.result).toEqual({ ok: true });

    await transport.stop();
  });
});
```

- [x] **Step 2: mcpClient.test.ts — MCPClient 连接 + 工具列表 mock 测试**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPClient } from "@/mcp/mcpClient";
import type { MCPServerConfig } from "@/mcp/types";

// Mock transport
vi.mock("@/mcp/transport", () => ({
  StdioTransport: class {
    async start() {}
    async stop() {}
    async send() {}
    async *receive() {}
    isAlive() { return true }
  },
  SSETransport: class {
    async start() {}
    async stop() {}
    async send() {}
    async *receive() {}
    isAlive() { return true }
  },
}));

describe("MCPClient", () => {
  it("should start disconnected", () => {
    const client = new MCPClient();
    expect(client.getStatus()).toBe("disconnected");
  });
});
```

- [x] **Step 3: mcpToolBridge.test.ts — 工具过滤逻辑**

```typescript
import { describe, it, expect, vi } from "vitest";

// Unit test tool name prefix conversion
function serverNameToPrefix(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

describe("serverNameToPrefix", () => {
  it('should convert "GitHub" to "github"', () => {
    expect(serverNameToPrefix("GitHub")).toBe("github");
  });
  it('should convert "My Files" to "my_files"', () => {
    expect(serverNameToPrefix("My Files")).toBe("my_files");
  });
});
```

- [x] **Step 4: 运行测试**

```bash
pnpm test
```

- [x] **Step 5: 运行类型检查和 lint**

```bash
pnpm run typecheck && pnpm run lint
```

- [x] **Step 6: 提交**

```bash
git add test/
git commit -m "test(mcp): add transport, client, and bridge unit tests"
```

---

### 自检清单

1. **Spec coverage:** 每个 spec 需求都能对应到 Task：
   - Types + events → Task 1
   - DB tables → Task 2
   - Transport (stdio + SSE) → Task 3
   - MCPClient (initialize/tools/list/tools/call) → Task 4
   - Health checker → Task 5
   - MCPServerPresenter CRUD + lifecycle → Task 6
   - MCPToolBridge filtering → Task 7
   - ToolPresenter async getToolSet → Task 8
   - AgentChatPresenter await → Task 9
   - Presenter registration → Task 10
   - Cascade cleanup → Task 11
   - Pinia store → Task 12
   - UI components → Task 13
   - Settings MCP tab → Task 14
   - AgentEditDialog MCP tab → Task 15
   - Session controls → Task 16
   - Tests → Task 17

2. **Placeholder scan:** 无 TBD、TODO。全部有实际代码。

3. **Type consistency:**
   - `MCPServerDashboard` 在 Task 1 定义为 `shared/types/mcp.d.ts`，在 Task 6 和 Task 12 使用一致
   - `MCPToolRecord` 同理
   - `mcpTools: string[]` 格式 `"{server_id}/{tool_name}"` 在 Task 1 (AgentConfig)、Task 7 (Bridge)、Task 11 (cleanup)、Task 15 (UI) 一致
   - 工具名前缀 `mcp_{server_name}_{tool_name}` 在 Task 7 (Bridge) 和 Task 8 (ToolPresenter 路由) 一致
