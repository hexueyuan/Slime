import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitPresenter } from "../../src/main/presenter/gitPresenter";

// Mock child_process.spawn
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "child_process";
import { EventEmitter } from "events";

function mockSpawn(stdout: string, exitCode = 0) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  const mockSpawnFn = spawn as unknown as ReturnType<typeof vi.fn>;
  mockSpawnFn.mockReturnValueOnce(proc);
  setTimeout(() => {
    if (stdout) proc.stdout.emit("data", Buffer.from(stdout));
    proc.emit("close", exitCode);
  }, 0);
  return proc;
}

describe("GitPresenter", () => {
  let git: GitPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    git = new GitPresenter("/tmp/test-repo");
  });

  it("getCurrentCommit returns trimmed hash", async () => {
    mockSpawn("abc123def\n");
    const result = await git.getCurrentCommit();
    expect(result).toBe("abc123def");
    expect(spawn).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], { cwd: "/tmp/test-repo" });
  });

  it("tag creates annotated tag", async () => {
    mockSpawn("");
    const result = await git.tag("v1.0", "release");
    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith("git", ["tag", "-a", "v1.0", "-m", "release"], {
      cwd: "/tmp/test-repo",
    });
  });

  it("listTags returns parsed list", async () => {
    mockSpawn("v0.2\nv0.1\n");
    const result = await git.listTags("egg-*");
    expect(result).toEqual(["v0.2", "v0.1"]);
    expect(spawn).toHaveBeenCalledWith("git", ["tag", "-l", "egg-*", "--sort=-creatordate"], {
      cwd: "/tmp/test-repo",
    });
  });

  it("addAndCommit stages and commits", async () => {
    mockSpawn(""); // git add
    mockSpawn(""); // git commit
    const result = await git.addAndCommit("feat: test");
    expect(result).toBe(true);
  });

  it("getChangedFiles returns file list", async () => {
    mockSpawn("src/a.ts\nsrc/b.ts\n");
    const result = await git.getChangedFiles("abc123");
    expect(result).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("rollbackToRef checks out and commits", async () => {
    mockSpawn(""); // git checkout
    mockSpawn(""); // git commit
    const result = await git.rollbackToRef("abc123");
    expect(result).toBe(true);
  });

  it("returns false on spawn failure", async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    setTimeout(() => {
      proc.stderr.emit("data", Buffer.from("fatal: error"));
      proc.emit("close", 128);
    }, 0);
    const result = await git.tag("v1.0", "msg");
    expect(result).toBe(false);
  });
});
