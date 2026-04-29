import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock paths
const testDir = join(tmpdir(), `slime-agent-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir, effectiveProjectRoot: testDir },
}));

// Mock eventBus
const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: {
    sendToRenderer: mockSendToRenderer,
  },
}));

// Mock LLM client
const mockClientChat = vi.fn();
vi.mock("@/llm", () => ({
  createLLMClient: vi.fn(() => ({ chat: mockClientChat })),
}));

const { AgentPresenter } = await import("@/presenter/agentPresenter");
const { SessionPresenter } = await import("@/presenter/sessionPresenter");

describe("AgentPresenter", () => {
  let agent: InstanceType<typeof AgentPresenter>;
  let sessionPresenter: InstanceType<typeof SessionPresenter>;
  const mockConfigPresenter = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => true),
  };
  const mockToolPresenter = {
    getToolSet: vi.fn(() => ({})),
  };
  const mockEvolutionPresenter = {
    getStatus: vi.fn(() => ({ stage: "idle" })),
    finalizeEvolution: vi.fn(async () => false),
  };
  const mockContentPresenter = {
    setContent: vi.fn(),
    clearContent: vi.fn(),
    getContent: vi.fn(),
  };
  const mockGatewayPresenter = {
    getPort: vi.fn(() => 8930),
    getInternalKey: vi.fn(() => "sk-slime-test"),
    select: vi.fn(() => ({
      matched: {
        reasoning: {
          groupName: "test-model",
          modelName: "test-model",
          modelId: 1,
          channelId: 1,
          capabilities: ["reasoning"],
        },
      },
      missing: [],
    })),
  };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    sessionPresenter = new SessionPresenter();
    agent = new AgentPresenter(
      sessionPresenter,
      mockConfigPresenter as any,
      mockToolPresenter as any,
      mockEvolutionPresenter as any,
      mockContentPresenter as any,
      mockGatewayPresenter as any,
    );
    mockSendToRenderer.mockClear();
    mockClientChat.mockClear();
    mockGatewayPresenter.select.mockReturnValue({
      matched: {
        reasoning: {
          groupName: "test-model",
          modelName: "test-model",
          modelId: 1,
          channelId: 1,
          capabilities: ["reasoning"],
        },
      },
      missing: [],
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should call streamText and emit stream events", async () => {
    mockClientChat.mockImplementation(async function* () {
      yield { type: "text", text: "Hello" };
      yield { type: "text", text: " world" };
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    const responseCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:response");
    expect(responseCall).toBeDefined();

    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });

  it("should emit error event on streamText failure", async () => {
    mockClientChat.mockImplementation(async function* () {
      yield { type: "error", error: "API error" };
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    const errorCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:error");
    expect(errorCall).toBeDefined();
  });

  it("should stop generation", async () => {
    mockClientChat.mockImplementation((_msgs: any, _tools: any, _opts: any, signal: any) =>
      (async function* () {
        yield { type: "text", text: "Hello" };
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          signal?.addEventListener("abort", resolve);
        });
      })(),
    );

    const session = await sessionPresenter.createSession("test");
    const chatPromise = agent.chat(session.id, { text: "hi", files: [] });
    await new Promise((r) => setTimeout(r, 20));
    await agent.stopGeneration(session.id);
    await chatPromise;
    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });

  describe("chat with no model configured", () => {
    it("should emit error when select returns no reasoning match", async () => {
      mockGatewayPresenter.select.mockReturnValue({
        matched: {},
        missing: ["reasoning"],
      });
      const session = await sessionPresenter.createSession("test");
      await agent.chat(session.id, { text: "hi", files: [] });

      const errorCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:error");
      expect(errorCall).toBeDefined();
      expect(errorCall![2]).toContain("No model configured");
    });
  });
});
