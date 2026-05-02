import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb, mockAgentDao, mockEventBus, mockFs } = vi.hoisted(() => {
  const mockDb = {} as unknown;
  const mockAgentDao = {
    ensureBuiltin: vi.fn(),
    listAgents: vi.fn(),
    getAgentById: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    removeAgent: vi.fn(),
  };
  const mockEventBus = {
    sendToRenderer: vi.fn(),
  };
  const mockFs = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    rename: vi.fn().mockResolvedValue(undefined),
  };
  return { mockDb, mockAgentDao, mockEventBus, mockFs };
});
vi.mock("@/db", () => ({
  getDb: () => mockDb,
}));

vi.mock("@/db/models/agentDao", () => mockAgentDao);

vi.mock("@/eventbus", () => ({
  eventBus: mockEventBus,
}));

vi.mock("fs/promises", () => ({
  default: mockFs,
  mkdir: mockFs.mkdir,
  writeFile: mockFs.writeFile,
  readFile: mockFs.readFile,
  rename: mockFs.rename,
}));

import { AgentConfigPresenter } from "@/presenter/agentConfigPresenter";
import { AGENT_EVENTS } from "@shared/events";

let p: AgentConfigPresenter;

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.writeFile.mockResolvedValue(undefined);
  p = new AgentConfigPresenter();
});

describe("AgentConfigPresenter", () => {
  it("init calls ensureBuiltin", () => {
    p.init();
    expect(mockAgentDao.ensureBuiltin).toHaveBeenCalledWith(mockDb);
  });

  it("listAgents returns list", async () => {
    const agents = [{ id: "a", name: "A" }];
    mockAgentDao.listAgents.mockReturnValue(agents);
    const result = await p.listAgents();
    expect(result).toBe(agents);
    expect(mockAgentDao.listAgents).toHaveBeenCalledWith(mockDb);
  });

  it("getAgent returns agent or null", async () => {
    mockAgentDao.getAgentById.mockReturnValue({ id: "a", name: "A" });
    expect(await p.getAgent("a")).toEqual({ id: "a", name: "A" });

    mockAgentDao.getAgentById.mockReturnValue(undefined);
    expect(await p.getAgent("missing")).toBeNull();
  });

  it("createAgent generates id and emits event", async () => {
    mockAgentDao.createAgent.mockReturnValue({ id: "gen-id", name: "New Agent" });
    const result = await p.createAgent({ name: "Test" });
    expect(mockAgentDao.createAgent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ name: "Test", type: "custom", enabled: true, protected: false }),
    );
    const callArgs = mockAgentDao.createAgent.mock.calls[0][1];
    expect(callArgs.id).toBeTruthy();
    expect(result).toEqual({ id: "gen-id", name: "New Agent" });
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("createAgent writes default SOUL.md with agent name", async () => {
    const agentName = "MyBot";
    mockAgentDao.createAgent.mockReturnValue({ id: "gen-id", name: agentName, type: "custom" });
    await p.createAgent({ name: agentName });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("SOUL.md"),
      `你是${agentName}，一个人工智能，你的任务是帮助用户解决问题。`,
    );
  });

  it("getAgentDir returns dir for custom agent", async () => {
    mockAgentDao.getAgentById.mockReturnValue({ id: "a1", name: "Bot", type: "custom" });
    const dir = await p.getAgentDir("a1");
    expect(dir).toBeTruthy();
    expect(typeof dir).toBe("string");
  });

  it("getAgentDir returns null for builtin agent", async () => {
    mockAgentDao.getAgentById.mockReturnValue({ id: "hal-ai", name: "哈尔", type: "builtin" });
    const dir = await p.getAgentDir("hal-ai");
    expect(dir).toBeNull();
  });

  it("createAgent uses provided id", async () => {
    mockAgentDao.createAgent.mockReturnValue({ id: "my-id", name: "X" });
    await p.createAgent({ id: "my-id", name: "X" });
    const callArgs = mockAgentDao.createAgent.mock.calls[0][1];
    expect(callArgs.id).toBe("my-id");
  });

  it("updateAgent updates and emits event", async () => {
    mockAgentDao.getAgentById.mockReturnValue({ id: "a", name: "Updated" });
    const result = await p.updateAgent("a", { name: "Updated" });
    expect(mockAgentDao.updateAgent).toHaveBeenCalledWith(mockDb, "a", { name: "Updated" });
    expect(result).toEqual({ id: "a", name: "Updated" });
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("updateAgent throws if agent not found", async () => {
    mockAgentDao.getAgentById.mockReturnValue(undefined);
    await expect(p.updateAgent("missing", { name: "X" })).rejects.toThrow(
      "Agent missing not found",
    );
  });

  it("deleteAgent removes and emits event", async () => {
    await p.deleteAgent("a");
    expect(mockAgentDao.removeAgent).toHaveBeenCalledWith(mockDb, "a");
    expect(mockEventBus.sendToRenderer).toHaveBeenCalledWith(AGENT_EVENTS.CHANGED);
  });

  it("deleteAgent protected throws", async () => {
    mockAgentDao.removeAgent.mockImplementation(() => {
      throw new Error("Cannot delete protected agent");
    });
    await expect(p.deleteAgent("prot")).rejects.toThrow("Cannot delete protected agent");
  });
});
