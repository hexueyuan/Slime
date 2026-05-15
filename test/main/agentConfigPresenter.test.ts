import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegistry, mockEventBus } = vi.hoisted(() => {
  const mockRegistry = {
    load: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const mockEventBus = {
    sendToRenderer: vi.fn(),
  };
  return { mockRegistry, mockEventBus };
});

vi.mock("@/agents/agentRegistry", () => ({
  agentRegistry: mockRegistry,
}));

vi.mock("@/eventbus", () => ({
  eventBus: mockEventBus,
}));

// stub out electron dialog so tests don't crash
vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn() },
}));

import { AgentConfigPresenter } from "@/presenter/agentConfigPresenter";
import { AGENT_EVENTS } from "@shared/events";

let p: AgentConfigPresenter;

beforeEach(() => {
  vi.clearAllMocks();
  mockRegistry.list.mockReturnValue([]);
  p = new AgentConfigPresenter();
});

describe("AgentConfigPresenter", () => {
  it("init calls agentRegistry.load", async () => {
    await p.init();
    expect(mockRegistry.load).toHaveBeenCalled();
  });

  it("listAgents returns registry list", async () => {
    const agents = [{ id: "a", name: "A" }];
    mockRegistry.list.mockReturnValue(agents);
    const result = await p.listAgents();
    expect(result).toBe(agents);
  });

  it("getAgent returns agent or null", async () => {
    mockRegistry.getById.mockReturnValue({ id: "a", name: "A" });
    expect(await p.getAgent("a")).toEqual({ id: "a", name: "A" });

    mockRegistry.getById.mockReturnValue(undefined);
    expect(await p.getAgent("missing")).toBeNull();
  });

  it("createAgent calls registry.create and emits event", async () => {
    const created = { id: "gen-id", name: "New Agent" };
    mockRegistry.create.mockResolvedValue(created);
    const result = await p.createAgent({ name: "New Agent" });
    expect(mockRegistry.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: "New Agent" }),
    );
    expect(result).toBe(created);
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("createAgent uses provided id", async () => {
    mockRegistry.create.mockResolvedValue({ id: "my-id", name: "X" });
    await p.createAgent({ id: "my-id", name: "X" });
    expect(mockRegistry.create).toHaveBeenCalledWith("my-id", expect.any(Object));
  });

  it("updateAgent calls registry.update and emits event", async () => {
    const updated = { id: "a", name: "Updated" };
    mockRegistry.update.mockResolvedValue(updated);
    const result = await p.updateAgent("a", { name: "Updated" });
    expect(mockRegistry.update).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ name: "Updated" }),
    );
    expect(result).toBe(updated);
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("deleteAgent calls registry.delete and emits event", async () => {
    mockRegistry.delete.mockResolvedValue(undefined);
    await p.deleteAgent("a");
    expect(mockRegistry.delete).toHaveBeenCalledWith("a");
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("deleteAgent protected throws (registry throws)", async () => {
    mockRegistry.delete.mockRejectedValue(new Error("Cannot delete protected agent"));
    await expect(p.deleteAgent("prot")).rejects.toThrow("Cannot delete protected agent");
  });

  it("getAgentDir returns null when directory should be hidden", async () => {
    mockRegistry.getById.mockReturnValue({ id: "hal-ai", name: "哈尔", protected: true });
    expect(await p.getAgentDir("hal-ai")).toBeNull();

    mockRegistry.getById.mockReturnValue(undefined);
    expect(await p.getAgentDir("missing")).toBeNull();
  });
});
