import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: {
    effectiveProjectRoot: "/tmp/test",
    contextFile: "/tmp/test-state/context.json",
  },
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
}));

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter";
import { readFile, unlink } from "fs/promises";

function mockGit() {
  return {
    tag: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
    rollbackToRef: vi.fn().mockResolvedValue(true),
    addAndCommit: vi.fn().mockResolvedValue(true),
    stageAll: vi.fn().mockResolvedValue(true),
    getChangedFiles: vi.fn().mockResolvedValue([]),
  } as any;
}

function mockConfig() {
  return { get: vi.fn().mockResolvedValue("testuser") } as any;
}

describe("Evolution Recovery", () => {
  let evo: EvolutionPresenter;
  let git: ReturnType<typeof mockGit>;

  beforeEach(() => {
    vi.clearAllMocks();
    git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
  });

  it("restoreState with valid context restores internal fields", async () => {
    const context = {
      stage: "discuss",
      description: "add dark mode",
      startCommit: "abc123",
      sessionId: "sess-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).not.toBeNull();
    expect(evo.getStatus().stage).toBe("discuss");
    expect(evo.getStatus().description).toBe("add dark mode");
    expect(evo.getStatus().startCommit).toBe("abc123");
    expect(evo.getStatus().sessionId).toBe("sess-1");
  });

  it("restoreState with no file returns null and stays idle", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const result = await evo.restoreState();
    expect(result).toBeNull();
    expect(evo.getStatus().stage).toBe("idle");
  });

  it("restoreState with coding stage and plan restores plan", async () => {
    const context = {
      stage: "coding",
      description: "refactor",
      plan: { scope: ["src/a.ts"], changes: ["modify a"], risks: [] },
      startCommit: "def456",
      sessionId: "sess-2",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).not.toBeNull();
    expect(evo.getStatus().stage).toBe("coding");
    expect(evo.getStatus().plan).toEqual({ scope: ["src/a.ts"], changes: ["modify a"], risks: [] });
  });

  it("restoreState with idle stage clears state and returns null", async () => {
    const context = {
      stage: "idle",
      description: "",
      startCommit: "",
      sessionId: "",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalled();
  });

  it("recovery abandon calls cancel and clears state", async () => {
    const context = {
      stage: "coding",
      description: "test",
      startCommit: "abc123",
      sessionId: "sess-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    await evo.restoreState();
    expect(evo.getStatus().stage).toBe("coding");

    await evo.cancel();
    expect(evo.getStatus().stage).toBe("idle");
    expect(git.rollbackToRef).toHaveBeenCalledWith("abc123");
    expect(unlink).toHaveBeenCalled();
  });
});
