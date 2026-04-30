import { describe, it, expect, vi } from "vitest";

vi.mock("child_process", () => {
  const { EventEmitter } = require("events");
  const fakeProcess = new EventEmitter() as any;
  fakeProcess.stdin = { write: vi.fn() };
  fakeProcess.stdout = new EventEmitter();
  fakeProcess.stderr = new EventEmitter();
  fakeProcess.kill = vi.fn();
  fakeProcess.killed = false;
  return { spawn: vi.fn(() => fakeProcess) };
});

import { StdioTransport } from "@/mcp/transport";

describe("StdioTransport", () => {
  it("should start and parse JSON-RPC from stdout", async () => {
    const transport = new StdioTransport("test-cmd", ["--arg"]);
    await transport.start();
    expect(transport.isAlive()).toBe(true);

    const { spawn } = await import("child_process");
    const proc = (spawn as any).mock.results[0].value;
    proc.stdout.emit("data", Buffer.from('{"jsonrpc":"2.0","result":{"ok":true},"id":1}\n'));

    const gen = transport.receive();
    const next = await gen.next();
    expect(next.value.result).toEqual({ ok: true });

    await transport.stop();
  });

  it("should mark dead on process exit", async () => {
    const transport = new StdioTransport("test-cmd");
    await transport.start();

    const { spawn } = await import("child_process");
    const proc = (spawn as any).mock.results[0].value;
    proc.emit("exit", 1);

    expect(transport.isAlive()).toBe(false);
    await transport.stop();
  });

  it("should stop resolve pending receive", async () => {
    const transport = new StdioTransport("test-cmd");
    await transport.start();

    // start receiving (will hang until stop)
    const gen = transport.receive();
    const promise = gen.next();

    await transport.stop();
    // stop resolves the pending Promise, generator yields once more,
    // then the while loop exits on next iteration
    await promise;
    const result = await gen.next();
    expect(result.done).toBe(true);
  });
});
