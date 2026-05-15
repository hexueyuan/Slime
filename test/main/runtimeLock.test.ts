import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { RuntimeProfile } from "@/utils/runtimeProfile";

describe("acquireRuntimeLock", () => {
  let root: string;
  let profile: RuntimeProfile;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "slime-lock-test-"));
    profile = {
      name: "development",
      userData: root,
      isPackaged: false,
      isE2E: false,
      isCustomDataDir: false,
    };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates a runtime lock when no lock exists", async () => {
    const { acquireRuntimeLock } = await import("@/utils/runtimeLock");
    const lock = acquireRuntimeLock(profile);

    const content = JSON.parse(readFileSync(lock.lockFile, "utf-8")) as Record<string, unknown>;
    expect(lock.lockFile).toBe(join(root, ".slime", "runtime.lock"));
    expect(content.pid).toBe(process.pid);
    expect(content.profile).toBe("development");
    expect(content.userData).toBe(root);
  });

  it("rejects a lock owned by a live process", async () => {
    const lockFile = join(root, ".slime", "runtime.lock");
    mkdirSync(join(root, ".slime"), { recursive: true });
    writeFileSync(
      lockFile,
      JSON.stringify({ pid: process.pid, profile: "production", userData: root }),
      "utf-8",
    );

    const { acquireRuntimeLock, RuntimeLockError } = await import("@/utils/runtimeLock");

    expect(() => acquireRuntimeLock(profile)).toThrow(RuntimeLockError);
  });

  it("replaces a stale lock whose pid is not alive", async () => {
    const lockFile = join(root, ".slime", "runtime.lock");
    mkdirSync(join(root, ".slime"), { recursive: true });
    writeFileSync(lockFile, JSON.stringify({ pid: 99999999 }), "utf-8");

    const { acquireRuntimeLock } = await import("@/utils/runtimeLock");
    const lock = acquireRuntimeLock(profile);

    const content = JSON.parse(readFileSync(lock.lockFile, "utf-8")) as Record<string, unknown>;
    expect(content.pid).toBe(process.pid);
  });

  it("replaces a malformed stale lock", async () => {
    const lockFile = join(root, ".slime", "runtime.lock");
    mkdirSync(join(root, ".slime"), { recursive: true });
    writeFileSync(lockFile, "{not-json", "utf-8");

    const { acquireRuntimeLock } = await import("@/utils/runtimeLock");
    const lock = acquireRuntimeLock(profile);

    const content = JSON.parse(readFileSync(lock.lockFile, "utf-8")) as Record<string, unknown>;
    expect(content.pid).toBe(process.pid);
  });

  it("releases only a lock still owned by the current process", async () => {
    const { acquireRuntimeLock } = await import("@/utils/runtimeLock");
    const lock = acquireRuntimeLock(profile);

    writeFileSync(lock.lockFile, JSON.stringify({ pid: 99999999 }), "utf-8");
    lock.release();
    expect(existsSync(lock.lockFile)).toBe(true);

    writeFileSync(lock.lockFile, JSON.stringify({ pid: process.pid }), "utf-8");
    lock.release();
    expect(existsSync(lock.lockFile)).toBe(false);
  });
});
