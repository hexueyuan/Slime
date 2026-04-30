import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPToolDef,
  MCPServerConfig,
  MCPToolCallResult,
} from "./types";
import { StdioTransport, SSETransport } from "./transport";
import type { MCPTransport } from "./transport";
import { logger } from "@/utils";

export class MCPClient {
  private transport: MCPTransport | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (v: JSONRPCResponse["result"]) => void; reject: (e: Error) => void }
  >();
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
      if (config.transport === "stdio") {
        this.transport = new StdioTransport(config.command!, config.args ?? [], config.env ?? {});
      } else {
        this.transport = new SSETransport(config.url!, config.headers ?? {});
      }

      await this.transport.start();
      this.startReceiveLoop();

      const result = await this.rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        clientInfo: { name: "Slime", version: "0.4.0" },
      });

      await this.transport.send({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        id: this.nextId(),
      });

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
    for (const [, { reject }] of this.pending) {
      reject(new Error("Client disconnected"));
    }
    this.pending.clear();
    await this.transport?.stop();
    this.transport = null;
  }

  async listTools(): Promise<MCPToolDef[]> {
    const result = (await this.rpc("tools/list")) as { tools: MCPToolDef[] };
    return result.tools;
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal): Promise<string> {
    const timeout = new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`MCP tool '${name}' timed out after 60s`)),
        60000,
      );
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error(`MCP tool '${name}' aborted`));
      });
    });
    const result = (await Promise.race([
      this.rpc("tools/call", { name, arguments: args }),
      timeout,
    ])) as MCPToolCallResult;
    if (result.isError) {
      throw new Error(result.content.map((c) => c.text ?? "").join("\n") || "Tool returned error");
    }
    return result.content.map((c) => c.text ?? JSON.stringify(c)).join("\n");
  }

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
    void (async () => {
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
