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
          this.resolveNext = (v) => {
            clearTimeout(timeout);
            resolve(v.value);
          };
        });
      }
    }
  }

  isAlive(): boolean {
    return this.alive;
  }
}
