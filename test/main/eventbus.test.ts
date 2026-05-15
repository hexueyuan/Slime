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
});
