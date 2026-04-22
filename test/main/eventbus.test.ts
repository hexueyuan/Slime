import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@/eventbus";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("should emit and receive main events via sendToMain", () => {
    const handler = vi.fn();
    bus.on("test:event", handler);
    bus.sendToMain("test:event", "payload1", 42);
    expect(handler).toHaveBeenCalledWith("payload1", 42);
  });

  it("should send to renderer via webContents.send", () => {
    const mockSend = vi.fn();
    const mockWin = { webContents: { send: mockSend } } as any;
    bus.setWindow(mockWin);
    bus.sendToRenderer("test:event", "data");
    expect(mockSend).toHaveBeenCalledWith("test:event", "data");
  });

  it("should not throw if no window set when sendToRenderer", () => {
    expect(() => bus.sendToRenderer("test:event", "data")).not.toThrow();
  });

  it("should send to both main and renderer via send", () => {
    const mainHandler = vi.fn();
    const mockSend = vi.fn();
    const mockWin = { webContents: { send: mockSend } } as any;
    bus.on("test:event", mainHandler);
    bus.setWindow(mockWin);
    bus.send("test:event", "both");
    expect(mainHandler).toHaveBeenCalledWith("both");
    expect(mockSend).toHaveBeenCalledWith("test:event", "both");
  });
});
