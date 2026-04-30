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
  return (
    db.prepare("SELECT * FROM mcp_servers ORDER BY created_at").all() as Record<string, unknown>[]
  ).map(rowToServer);
}

export function getServer(db: BetterSqlite3.Database, id: string): MCPServer | undefined {
  const row = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToServer(row) : undefined;
}

export function createServer(
  db: BetterSqlite3.Database,
  server: Omit<MCPServer, "createdAt" | "updatedAt">,
): MCPServer {
  const now = Date.now();
  db.prepare(
    `INSERT INTO mcp_servers (id, name, transport, enabled, command, args, env, url, http_headers, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    server.id,
    server.name,
    server.transport,
    server.enabled ? 1 : 0,
    server.command ?? null,
    server.args ? JSON.stringify(server.args) : null,
    server.env ? JSON.stringify(server.env) : null,
    server.url ?? null,
    server.httpHeaders ? JSON.stringify(server.httpHeaders) : null,
    now,
    now,
  );
  return getServer(db, server.id)!;
}

export function updateServer(
  db: BetterSqlite3.Database,
  id: string,
  data: Partial<Omit<MCPServer, "id" | "createdAt" | "updatedAt">>,
): MCPServer | undefined {
  const fields: string[] = ["updated_at = ?"];
  const vals: unknown[] = [Date.now()];
  for (const [col, key] of [
    ["name", "name"],
    ["transport", "transport"],
    ["command", "command"],
    ["url", "url"],
  ] as const) {
    if (data[key] !== undefined) {
      fields.push(`${col} = ?`);
      vals.push(data[key]);
    }
  }
  if (data.enabled !== undefined) {
    fields.push("enabled = ?");
    vals.push(data.enabled ? 1 : 0);
  }
  if (data.args !== undefined) {
    fields.push("args = ?");
    vals.push(JSON.stringify(data.args));
  }
  if (data.env !== undefined) {
    fields.push("env = ?");
    vals.push(JSON.stringify(data.env));
  }
  if (data.httpHeaders !== undefined) {
    fields.push("http_headers = ?");
    vals.push(JSON.stringify(data.httpHeaders));
  }
  vals.push(id);
  db.prepare(`UPDATE mcp_servers SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
  return getServer(db, id);
}

export function deleteServer(db: BetterSqlite3.Database, id: string): void {
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
}

// --- Tool CRUD ---

export function listToolsByServer(db: BetterSqlite3.Database, serverId: string): MCPToolRecord[] {
  return (
    db
      .prepare("SELECT * FROM mcp_tools WHERE server_id = ? ORDER BY tool_name")
      .all(serverId) as Record<string, unknown>[]
  ).map(rowToTool);
}

export function getToolByServerAndName(
  db: BetterSqlite3.Database,
  serverId: string,
  toolName: string,
): MCPToolRecord | undefined {
  const row = db
    .prepare("SELECT * FROM mcp_tools WHERE server_id = ? AND tool_name = ?")
    .get(serverId, toolName) as Record<string, unknown> | undefined;
  return row ? rowToTool(row) : undefined;
}

export function getToolById(db: BetterSqlite3.Database, id: number): MCPToolRecord | undefined {
  const row = db.prepare("SELECT * FROM mcp_tools WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToTool(row) : undefined;
}

export function upsertTool(
  db: BetterSqlite3.Database,
  serverId: string,
  toolName: string,
  description: string | undefined,
  inputSchema: Record<string, unknown>,
): MCPToolRecord {
  const existing = getToolByServerAndName(db, serverId, toolName);
  if (existing) {
    db.prepare("UPDATE mcp_tools SET description = ?, input_schema = ? WHERE id = ?").run(
      description ?? null,
      JSON.stringify(inputSchema),
      existing.id,
    );
    return { ...existing, description: description ?? null, inputSchema };
  }
  const result = db
    .prepare(
      "INSERT INTO mcp_tools (server_id, tool_name, description, input_schema) VALUES (?, ?, ?, ?)",
    )
    .run(serverId, toolName, description ?? null, JSON.stringify(inputSchema));
  return {
    id: result.lastInsertRowid as number,
    serverId,
    toolName,
    description: description ?? null,
    inputSchema,
  };
}

export function deleteToolsByServer(db: BetterSqlite3.Database, serverId: string): void {
  db.prepare("DELETE FROM mcp_tools WHERE server_id = ?").run(serverId);
}

export function deleteStaleTools(
  db: BetterSqlite3.Database,
  serverId: string,
  currentNames: string[],
): void {
  if (currentNames.length === 0) {
    deleteToolsByServer(db, serverId);
    return;
  }
  const placeholders = currentNames.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM mcp_tools WHERE server_id = ? AND tool_name NOT IN (${placeholders})`,
  ).run(serverId, ...currentNames);
}

// --- Session state ---

export function getSessionDisabledToolIds(db: BetterSqlite3.Database, sessionId: string): number[] {
  const rows = db
    .prepare("SELECT tool_id FROM session_mcp_state WHERE session_id = ? AND disabled = 1")
    .all(sessionId) as { tool_id: number }[];
  return rows.map((r) => r.tool_id);
}

export function setSessionToolState(
  db: BetterSqlite3.Database,
  sessionId: string,
  toolId: number,
  disabled: boolean,
): void {
  if (disabled) {
    db.prepare(
      "INSERT OR REPLACE INTO session_mcp_state (session_id, tool_id, disabled) VALUES (?, ?, 1)",
    ).run(sessionId, toolId);
  } else {
    db.prepare("DELETE FROM session_mcp_state WHERE session_id = ? AND tool_id = ?").run(
      sessionId,
      toolId,
    );
  }
}

export function removeSessionStateByToolId(db: BetterSqlite3.Database, toolId: number): void {
  db.prepare("DELETE FROM session_mcp_state WHERE tool_id = ?").run(toolId);
}

export function removeSessionStateByAgentToolIds(
  db: BetterSqlite3.Database,
  agentId: string,
  removedToolIds: number[],
): void {
  if (removedToolIds.length === 0) return;
  const placeholders = removedToolIds.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM session_mcp_state WHERE tool_id IN (${placeholders}) AND session_id IN (SELECT id FROM agent_sessions WHERE agent_id = ?)`,
  ).run(...removedToolIds, agentId);
}
