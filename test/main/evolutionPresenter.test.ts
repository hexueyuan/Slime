import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/eventbus", () => ({
  eventBus: { sendToRenderer: vi.fn() },
}));

vi.mock("@/utils", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  paths: { effectiveProjectRoot: "/tmp/test", contextFile: "/tmp/test-state/context.json" },
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue("/tmp/test"),
    getPath: vi.fn().mockReturnValue("/tmp"),
    exit: vi.fn(),
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
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
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { EvolutionPresenter } from "../../src/main/presenter/evolutionPresenter";
import { EVOLUTION_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { readFile, writeFile, readdir, unlink } from "fs/promises";
import { execFile, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { app } from "electron";

function mockGit() {
  return {
    tag: vi.fn().mockResolvedValue(true),
    listTags: vi.fn().mockResolvedValue([]),
    getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
    rollbackToRef: vi.fn().mockResolvedValue(true),
    addAndCommit: vi.fn().mockResolvedValue(true),
    stageAll: vi.fn().mockResolvedValue(true),
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

  it("startEvolution stores sessionId", async () => {
    const result = await evo.startEvolution("test", "session-123");
    expect(result).toBe(true);
    expect(evo.getStatus().sessionId).toBe("session-123");
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

    // Phase 1: prepare (no commit, no getChangedFiles)
    const result = await evo.completeEvolution("did the thing", "revert a.ts changes");
    expect(result.success).toBe(true);
    expect(evo.getStatus().stage).toBe("applying");
    expect(git.addAndCommit).not.toHaveBeenCalled();
    expect(git.getChangedFiles).not.toHaveBeenCalled();

    // Phase 2: finalize (stageAll → getChangedFiles → changelog → commit + tag + archive)
    const finalized = await evo.finalizeEvolution();
    expect(finalized).toBe(true);
    expect(evo.getStatus().stage).toBe("idle");
    expect(git.stageAll).toHaveBeenCalled();
    expect(git.getChangedFiles).toHaveBeenCalledWith("abc123", undefined, { cached: true });
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

  // --- Build verification tests ---

  it("runBuildVerification returns success when typecheck and build pass", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, { stdout: "ok", stderr: "" });
      return {} as any;
    });

    const result = await evo.runBuildVerification();
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("runBuildVerification returns error when typecheck fails", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());

    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("typecheck error");
      err.stdout = "";
      err.stderr = "error TS2345: Argument of type 'string' is not assignable";
      err.code = 1;
      cb(err);
      return {} as any;
    });

    const result = await evo.runBuildVerification();
    expect(result.success).toBe(false);
    expect(result.error).toContain("typecheck failed");
    expect(result.error).toContain("TS2345");
  });

  it("runBuildVerification returns error when build fails after typecheck passes", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());

    let callCount = 0;
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        // typecheck passes
        cb(null, { stdout: "ok", stderr: "" });
      } else {
        // build fails
        const err: any = new Error("build error");
        err.stdout = "Build failed: Cannot find module";
        err.stderr = "";
        err.code = 1;
        cb(err);
      }
      return {} as any;
    });

    const result = await evo.runBuildVerification();
    expect(result.success).toBe(false);
    expect(result.error).toContain("build failed");
    expect(result.error).toContain("Cannot find module");
  });

  it("runBuildVerification truncates long error output", async () => {
    const git = mockGit();
    evo = new EvolutionPresenter(git, mockConfig());

    const longOutput = "x".repeat(5000);
    vi.mocked(execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("fail");
      err.stdout = "";
      err.stderr = longOutput;
      err.code = 1;
      cb(err);
      return {} as any;
    });

    const result = await evo.runBuildVerification();
    expect(result.success).toBe(false);
    // Output should be truncated to MAX_OUTPUT (2000 chars) + label
    expect(result.error!.length).toBeLessThan(2100);
  });

  // --- State persistence tests ---

  it("saveState writes context.json after startEvolution", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    await evo.startEvolution("test change", "sess-1");

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const contextCall = writeCalls.find((c) => (c[0] as string).includes("context.json"));
    expect(contextCall).toBeDefined();
    const saved = JSON.parse(contextCall![1] as string);
    expect(saved.stage).toBe("discuss");
    expect(saved.description).toBe("test change");
    expect(saved.sessionId).toBe("sess-1");
  });

  it("saveState updates context.json after submitPlan", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    await evo.startEvolution("test", "sess-1");
    vi.mocked(writeFile).mockClear();

    evo.submitPlan({ scope: ["a.ts"], changes: ["modify a"] });

    const writeCalls = vi.mocked(writeFile).mock.calls;
    const contextCall = writeCalls.find((c) => (c[0] as string).includes("context.json"));
    expect(contextCall).toBeDefined();
    const saved = JSON.parse(contextCall![1] as string);
    expect(saved.stage).toBe("coding");
    expect(saved.plan).toEqual({ scope: ["a.ts"], changes: ["modify a"] });
  });

  it("clearState deletes context.json on reset", async () => {
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(unlink).mockResolvedValue(undefined);
    await evo.startEvolution("test", "sess-1");
    await evo.cancel();

    expect(unlink).toHaveBeenCalledWith("/tmp/test-state/context.json");
  });

  it("loadState returns parsed context when file exists", async () => {
    const context = {
      stage: "coding",
      description: "test",
      startCommit: "abc123",
      sessionId: "sess-1",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z",
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(context));

    const result = await evo.restoreState();
    expect(result).not.toBeNull();
    expect(result!.stage).toBe("coding");
    expect(result!.sessionId).toBe("sess-1");
    expect(evo.getStatus().stage).toBe("coding");
  });

  it("loadState returns null and cleans up when file is corrupted", async () => {
    vi.mocked(readFile).mockResolvedValue("not valid json{{{");
    vi.mocked(unlink).mockResolvedValue(undefined);

    const result = await evo.restoreState();
    expect(result).toBeNull();
    expect(unlink).toHaveBeenCalledWith("/tmp/test-state/context.json");
    expect(evo.getStatus().stage).toBe("idle");
  });

  // --- resolveAppBundlePath & findBuiltApp tests ---

  describe("resolveAppBundlePath", () => {
    it("returns null when app is not packaged", () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      expect((evo as any).resolveAppBundlePath()).toBeNull();
    });
  });

  describe("findBuiltApp", () => {
    it("returns null when no .app found in dist", async () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      const result = await (evo as any).findBuiltApp();
      expect(result).toBeNull();
    });

    it("finds .app in mac-arm64 directory", async () => {
      const { readdir } = await import("fs/promises");
      (readdir as any).mockImplementation(async (dir: string) => {
        if (dir.includes("mac-arm64")) return ["Slime.app"];
        return [];
      });
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      const result = await (evo as any).findBuiltApp();
      expect(result).toContain("mac-arm64");
      expect(result).toContain("Slime.app");
    });
  });

  describe("runPackage", () => {
    it("executes pnpm run build:mac and returns success", async () => {
      (execFile as any).mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          cb(null, "build output", "");
        },
      );
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      const result = await (evo as any).runPackage();
      expect(result.success).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        "pnpm",
        ["run", "build:mac"],
        expect.objectContaining({ timeout: 600_000 }),
        expect.any(Function),
      );
    });

    it("returns error on build failure", async () => {
      (execFile as any).mockImplementation(
        (_cmd: string, _args: string[], _opts: any, cb: Function) => {
          const err = Object.assign(new Error("build failed"), { code: 1, stderr: "error output" });
          cb(err, "", "error output");
        },
      );
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      const result = await (evo as any).runPackage();
      expect(result.success).toBe(false);
      expect(result.error).toContain("error output");
    });
  });

  describe("selfReplace", () => {
    it("writes swap script and spawns detached bash", () => {
      vi.mocked(app.getPath).mockReturnValue("/tmp");
      vi.mocked(spawn).mockReturnValue({ unref: vi.fn() } as any);
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      (evo as any).selfReplace("/Applications/Slime.app", "/tmp/dist/mac-arm64/Slime.app");

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("swap-update.sh"),
        expect.stringContaining("rm -rf"),
        expect.objectContaining({ mode: 0o755 }),
      );
      expect(spawn).toHaveBeenCalledWith(
        "/bin/bash",
        [expect.stringContaining("swap-update.sh")],
        expect.objectContaining({ detached: true, stdio: "ignore" }),
      );
      expect(app.exit).toHaveBeenCalledWith(0);
    });
  });

  describe("applyEvolution", () => {
    it("in dev mode: resets to idle", async () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      await evo.startEvolution("test", "s1");
      evo.submitPlan({ scope: [], changes: [] });
      await evo.completeEvolution("summary");
      expect(evo.getStatus().stage).toBe("applying");

      await evo.applyEvolution();

      expect(evo.getStatus().stage).toBe("idle");
      expect(eventBus.sendToRenderer).toHaveBeenCalledWith(
        EVOLUTION_EVENTS.APPLY_PROGRESS,
        expect.objectContaining({ step: "committing" }),
      );
    });

    it("does nothing when not in applying stage", async () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      await evo.applyEvolution();
      // Should not throw, just return
      expect(evo.getStatus().stage).toBe("idle");
    });
  });

  describe("skipPackage", () => {
    it("resets evolution to idle", async () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      await evo.startEvolution("test");
      evo.submitPlan({ scope: [], changes: [] });
      await evo.completeEvolution("summary");
      expect(evo.getStatus().stage).toBe("applying");

      evo.skipPackage();
      expect(evo.getStatus().stage).toBe("idle");
    });

    it("does nothing when not in applying stage", () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      evo.skipPackage();
      expect(evo.getStatus().stage).toBe("idle");
    });
  });

  describe("retryPackage", () => {
    it("does nothing when not in applying stage", async () => {
      const evo = new EvolutionPresenter(mockGit(), mockConfig());
      await evo.retryPackage();
      expect(evo.getStatus().stage).toBe("idle");
    });
  });
});
