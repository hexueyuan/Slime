import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { app } from "electron";
import type { RuntimeProfile } from "./runtimeProfile";

export interface RuntimeLock {
  lockFile: string;
  release(): void;
}

interface RuntimeLockRecord {
  pid: number;
  profile: string;
  startedAt: string;
  userData: string;
  appVersion: string;
}

export class RuntimeLockError extends Error {
  constructor(
    message: string,
    readonly lockFile: string,
  ) {
    super(message);
    this.name = "RuntimeLockError";
  }
}

function readLock(lockFile: string): RuntimeLockRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(lockFile, "utf-8")) as Partial<RuntimeLockRecord>;
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0
      ? (parsed as RuntimeLockRecord)
      : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function writeLock(lockFile: string, profile: RuntimeProfile): void {
  const record: RuntimeLockRecord = {
    pid: process.pid,
    profile: profile.name,
    startedAt: new Date().toISOString(),
    userData: profile.userData,
    appVersion: app.getVersion(),
  };
  const tempFile = `${lockFile}.${process.pid}.tmp`;
  writeFileSync(tempFile, JSON.stringify(record, null, 2), "utf-8");
  renameSync(tempFile, lockFile);
}

function currentProcessOwns(lockFile: string): boolean {
  const lock = readLock(lockFile);
  return lock?.pid === process.pid;
}

export function acquireRuntimeLock(profile: RuntimeProfile): RuntimeLock {
  const lockFile = join(profile.userData, ".slime", "runtime.lock");
  mkdirSync(dirname(lockFile), { recursive: true });

  if (existsSync(lockFile)) {
    const currentLock = readLock(lockFile);
    if (currentLock && isPidAlive(currentLock.pid)) {
      throw new RuntimeLockError(
        "Another Slime instance is already using this data directory. Please quit the running Slime before starting this one.",
        lockFile,
      );
    }
  }

  writeLock(lockFile, profile);

  return {
    lockFile,
    release() {
      if (existsSync(lockFile) && currentProcessOwns(lockFile)) {
        unlinkSync(lockFile);
      }
    },
  };
}
