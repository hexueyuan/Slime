import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock paths
const testDir = join(tmpdir(), `slime-agent-test-${Date.now()}`);
vi.mock("@/utils/paths", () => ({
  paths: { dataDir: testDir },
}));

// Mock eventBus
const mockSendToRenderer = vi.fn();
vi.mock("@/eventbus", () => ({
  eventBus: {
    sendToRenderer: mockSendToRenderer,
  },
}));

// Mock Vercel AI SDK streamText
const mockStreamText = vi.fn();
vi.mock("ai", () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

// Mock provider
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn(() => "mock-model")),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() => vi.fn(() => "mock-model")),
}));

const { AgentPresenter } = await import("@/presenter/agentPresenter");
const { SessionPresenter } = await import("@/presenter/sessionPresenter");

describe("AgentPresenter", () => {
  let agent: InstanceType<typeof AgentPresenter>;
  let sessionPresenter: InstanceType<typeof SessionPresenter>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    sessionPresenter = new SessionPresenter();
    agent = new AgentPresenter(sessionPresenter);
    mockSendToRenderer.mockClear();
    // Set env vars for getConfig()
    process.env.SLIME_AI_PROVIDER = "openai";
    process.env.SLIME_AI_API_KEY = "test-key";
    process.env.SLIME_AI_MODEL = "gpt-4o";
  });

  afterEach(() => {
    delete process.env.SLIME_AI_PROVIDER;
    delete process.env.SLIME_AI_API_KEY;
    delete process.env.SLIME_AI_MODEL;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should call streamText and emit stream events", async () => {
    const chunks = [
      { type: "text-delta", id: "1", text: "Hello" },
      { type: "text-delta", id: "1", text: " world" },
      { type: "finish", finishReason: "stop" },
    ];
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    const responseCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:response");
    expect(responseCall).toBeDefined();

    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });

  it("should emit error event on streamText failure", async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        throw new Error("API error");
      })(),
    });

    const session = await sessionPresenter.createSession("test");
    await agent.chat(session.id, { text: "hi", files: [] });

    const errorCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:error");
    expect(errorCall).toBeDefined();
  });

  it("should stop generation", async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: "text-delta", id: "1", text: "Hello" };
        await new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("aborted"));
          }, 50);
        });
      })(),
    });

    const session = await sessionPresenter.createSession("test");
    const chatPromise = agent.chat(session.id, { text: "hi", files: [] });
    await agent.stopGeneration(session.id);
    await chatPromise;
    const endCall = mockSendToRenderer.mock.calls.find((c) => c[0] === "stream:end");
    expect(endCall).toBeDefined();
  });
});
