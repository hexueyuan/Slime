import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test" },
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("not found")),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter";
import { eventBus } from "@/eventbus";

function mockGit() {
  return {
    tag: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
    rollbackToRef: vi.fn().mockResolvedValue(true),
    addAndCommit: vi.fn().mockResolvedValue(true),
    getChangedFiles: vi.fn().mockResolvedValue(["src/a.ts"]),
  } as any;
}

function mockConfig() {
  return {
    get: vi.fn().mockResolvedValue("testuser"),
  } as any;
}

describe("EvolutionPresenter", () => {
  let evo: EvolutionPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    evo = new EvolutionPresenter(mockGit(), mockConfig());
  });

  it("starts in idle stage", () => {
    expect(evo.getStatus().stage).toBe("idle");
  });

  it("startEvolution transitions to discuss", () => {
    const result = evo.startEvolution("add dark mode");
    expect(result).toBe(true);
    expect(evo.getStatus().stage).toBe("discuss");
    expect(evo.getStatus().description).toBe("add dark mode");
    expect(eventBus.sendToRenderer).toHaveBeenCalled();
  });

  it("startEvolution rejects when not idle", () => {
    evo.startEvolution("first");
    const result = evo.startEvolution("second");
    expect(result).toBe(false);
    expect(evo.getStatus().stage).toBe("discuss");
  });

  it("submitPlan transitions discuss → coding", () => {
    evo.startEvolution("test");
    const result = evo.submitPlan({ scope: ["src/a.ts"], changes: ["modify a"] });
    expect(result).toBe(true);
    expect(evo.getStatus().stage).toBe("coding");
  });

  it("submitPlan rejects when not in discuss", () => {
    const result = evo.submitPlan({ scope: [], changes: [] });
    expect(result).toBe(false);
  });

  it("completeEvolution runs apply flow", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
    evo.startEvolution("test change");
    await vi.waitFor(() => {
      expect(evo.getStatus().startCommit).toBe("abc123");
    });
    evo.submitPlan({ scope: ["src/a.ts"], changes: ["modify a"] });
    const result = await evo.completeEvolution("did the thing");
    expect(result.success).toBe(true);
    expect(evo.getStatus().stage).toBe("idle");
    expect(git.addAndCommit).toHaveBeenCalled();
    expect(git.tag).toHaveBeenCalled();
  });

  it("completeEvolution rejects when not in coding", async () => {
    const result = await evo.completeEvolution("nope");
    expect(result.success).toBe(false);
  });

  it("cancel resets to idle", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
    evo.startEvolution("test");
    const result = await evo.cancel();
    expect(result).toBe(true);
    expect(evo.getStatus().stage).toBe("idle");
  });

  it("cancel with code changes does git reset", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
    evo.startEvolution("test");
    await vi.waitFor(() => {
      expect(evo.getStatus().startCommit).toBe("abc123");
    });
    evo.submitPlan({ scope: ["a"], changes: ["b"] });
    await evo.cancel();
    expect(git.rollbackToRef).toHaveBeenCalledWith("abc123");
  });
});
