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
import { readFile } from "fs/promises";

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

  it("startEvolution transitions to discuss", async () => {
    const result = await evo.startEvolution("add dark mode");
    expect(result).toBe(true);
    expect(evo.getStatus().stage).toBe("discuss");
    expect(evo.getStatus().description).toBe("add dark mode");
    expect(evo.getStatus().startCommit).toBe("abc123");
    expect(eventBus.sendToRenderer).toHaveBeenCalled();
  });

  it("startEvolution rejects when not idle", async () => {
    await evo.startEvolution("first");
    const result = await evo.startEvolution("second");
    expect(result).toBe(false);
    expect(evo.getStatus().stage).toBe("discuss");
  });

  it("submitPlan transitions discuss → coding", async () => {
    await evo.startEvolution("test");
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
    await evo.startEvolution("test change");
    expect(evo.getStatus().startCommit).toBe("abc123");
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
    await evo.startEvolution("test");
    const result = await evo.cancel();
    expect(result).toBe(true);
    expect(evo.getStatus().stage).toBe("idle");
  });

  it("cancel with code changes does git reset", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
    await evo.startEvolution("test");
    expect(evo.getStatus().startCommit).toBe("abc123");
    evo.submitPlan({ scope: ["a"], changes: ["b"] });
    await evo.cancel();
    expect(git.rollbackToRef).toHaveBeenCalledWith("abc123");
  });

  it("getHistory returns enriched nodes from CHANGELOG", async () => {
    const git = mockGit();
    git.listTags.mockResolvedValue(["egg-v0.1-dev.2", "egg-v0.1-dev.1"]);
    evo = new EvolutionPresenter(git, mockConfig());

    const changelog = `# Slime Evolution Changelog

## [egg-v0.1-dev.2] - 2026-04-24

### Evolution

- Request: "添加时钟功能"
- Summary: 新增赛博时钟
- Status: Success

### Changes

- src/components/Clock.vue
- src/views/Main.vue

---

## [egg-v0.1-dev.1] - 2026-04-24

### Evolution

- Request: "缩小字体"
- Summary: 缩小对话字体
- Status: Success

### Changes

- (no file changes recorded)

---
`;
    vi.mocked(readFile).mockResolvedValue(changelog);

    const history = await evo.getHistory();
    expect(history).toHaveLength(2);

    expect(history[0].tag).toBe("egg-v0.1-dev.2");
    expect(history[0].request).toBe("添加时钟功能");
    expect(history[0].description).toBe("新增赛博时钟");
    expect(history[0].createdAt).toBe("2026-04-24");
    expect(history[0].changes).toEqual(["src/components/Clock.vue", "src/views/Main.vue"]);

    expect(history[1].tag).toBe("egg-v0.1-dev.1");
    expect(history[1].request).toBe("缩小字体");
    expect(history[1].changes).toEqual([]);
  });

  it("getHistory returns basic nodes when CHANGELOG is missing", async () => {
    const git = mockGit();
    git.listTags.mockResolvedValue(["egg-v0.1-dev.1"]);
    evo = new EvolutionPresenter(git, mockConfig());

    vi.mocked(readFile).mockRejectedValue(new Error("not found"));

    const history = await evo.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].tag).toBe("egg-v0.1-dev.1");
    expect(history[0].request).toBe("");
    expect(history[0].description).toBe("egg-v0.1-dev.1");
  });
});
