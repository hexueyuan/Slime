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
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter";
import { eventBus } from "@/eventbus";
import { readFile, writeFile, readdir } from "fs/promises";

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

  it("startEvolution rejects when rollback in progress", async () => {
    evo.rollbackInProgress = true;
    const result = await evo.startEvolution("test");
    expect(result).toBe(false);
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

  it("completeEvolution runs apply flow and writes archive", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());
    await evo.startEvolution("test change");
    expect(evo.getStatus().startCommit).toBe("abc123");
    evo.submitPlan({ scope: ["src/a.ts"], changes: ["modify a"] });
    const result = await evo.completeEvolution("did the thing", "revert a.ts changes");
    expect(result.success).toBe(true);
    expect(evo.getStatus().stage).toBe("idle");
    expect(git.addAndCommit).toHaveBeenCalled();
    expect(git.tag).toHaveBeenCalled();
    // Archive should be written
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(".json"),
      expect.stringContaining('"tag"'),
      "utf-8",
    );
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

  // --- Archive tests ---

  it("writeArchive + readArchive round-trip", async () => {
    const archive = {
      version: 1 as const,
      tag: "egg-v0.1-dev.1",
      parentTag: null,
      request: "test",
      summary: "test summary",
      plan: { scope: [], changes: [] },
      createdAt: "2026-04-25T00:00:00.000Z",
      startCommit: "aaa",
      endCommit: "bbb",
      changedFiles: ["src/a.ts"],
      semanticSummary: "revert a.ts",
      status: "active" as const,
    };

    vi.mocked(writeFile).mockResolvedValue(undefined);
    await evo.writeArchive(archive);
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("egg-v0.1-dev.1.json"),
      expect.any(String),
      "utf-8",
    );

    // Mock readFile to return the archive
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(archive));
    const read = await evo.readArchive("egg-v0.1-dev.1");
    expect(read).not.toBeNull();
    expect(read!.tag).toBe("egg-v0.1-dev.1");
    expect(read!.status).toBe("active");
  });

  it("readArchive returns null for missing archive", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("not found"));
    const result = await evo.readArchive("nonexistent");
    expect(result).toBeNull();
  });

  it("listArchives returns all archives", async () => {
    const a1 = { tag: "egg-v0.1-dev.1", status: "active" };
    const a2 = { tag: "egg-v0.1-dev.2", status: "archived" };

    vi.mocked(readdir).mockResolvedValue(["egg-v0.1-dev.1.json", "egg-v0.1-dev.2.json"] as any);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(a1))
      .mockResolvedValueOnce(JSON.stringify(a2));

    const archives = await evo.listArchives();
    expect(archives).toHaveLength(2);
  });

  it("checkDependencies finds overlapping files", async () => {
    const target = {
      version: 1,
      tag: "egg-v0.1-dev.1",
      parentTag: null,
      request: "test",
      summary: "first",
      plan: { scope: [], changes: [] },
      createdAt: "2026-04-24T00:00:00.000Z",
      startCommit: "a",
      endCommit: "b",
      changedFiles: ["src/a.ts", "src/b.ts"],
      semanticSummary: "",
      status: "active",
    };
    const later = {
      version: 1,
      tag: "egg-v0.1-dev.2",
      parentTag: "egg-v0.1-dev.1",
      request: "test2",
      summary: "second",
      plan: { scope: [], changes: [] },
      createdAt: "2026-04-25T00:00:00.000Z",
      startCommit: "b",
      endCommit: "c",
      changedFiles: ["src/a.ts", "src/c.ts"],
      semanticSummary: "",
      status: "active",
    };

    // readArchive for target
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(target));
    // listArchives
    vi.mocked(readdir).mockResolvedValue(["egg-v0.1-dev.1.json", "egg-v0.1-dev.2.json"] as any);
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify(target)) // readArchive(tag)
      .mockResolvedValueOnce(JSON.stringify(target)) // listArchives file 1
      .mockResolvedValueOnce(JSON.stringify(later)); // listArchives file 2

    const { dependencies } = await evo.checkDependencies("egg-v0.1-dev.1");
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].tag).toBe("egg-v0.1-dev.2");
    expect(dependencies[0].overlappingFiles).toEqual(["src/a.ts"]);
  });

  it("archiveEvolution sets status to archived", async () => {
    const archive = {
      version: 1,
      tag: "egg-v0.1-dev.1",
      status: "active",
      changedFiles: [],
      semanticSummary: "",
      request: "",
      summary: "",
      plan: { scope: [], changes: [] },
      createdAt: "",
      startCommit: "",
      endCommit: "",
      parentTag: null,
    };

    vi.mocked(readFile).mockResolvedValue(JSON.stringify(archive));
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await evo.archiveEvolution("egg-v0.1-dev.1", "rolled back");

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("egg-v0.1-dev.1.json"),
      expect.stringContaining('"archived"'),
      "utf-8",
    );
  });
});
