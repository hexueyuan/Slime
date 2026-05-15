# Runtime Profile and Data Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make development use real Slime data by default, keep staging/E2E isolated by explicit env vars, and prevent two Slime processes from sharing one data directory.

**Architecture:** Add a small runtime profile resolver around Electron `app` paths, update path helpers to derive Slime home from the selected profile, and add a lock utility that owns `{userData}/.slime/runtime.lock`. Keep startup wiring thin in `src/main/index.ts`.

**Tech Stack:** Electron main process, TypeScript, Node `fs`/`path`, Vitest.

---

### Task 1: Runtime Profile Resolution

**Files:**

- Create: `src/main/utils/runtimeProfile.ts`
- Test: `test/main/runtimeProfile.test.ts`

- [ ] **Step 1: Write failing tests** for E2E priority, staging override, production packaged default, and development default using Electron's default `userData`.
- [ ] **Step 2: Run focused tests** with `pnpm exec vitest run test/main/runtimeProfile.test.ts`.
- [ ] **Step 3: Implement `resolveRuntimeProfile()`** so `SLIME_E2E_USER_DATA` wins over `SLIME_USER_DATA_DIR`, explicit env vars call `app.setPath("userData", value)`, and default dev no longer rewrites to `slime-dev`.
- [ ] **Step 4: Re-run focused tests** until green.

### Task 2: Paths and CLI Data Resolution

**Files:**

- Modify: `src/main/utils/paths.ts`
- Modify: `src/cli/utils/baseUrl.ts`
- Test: `test/main/paths.test.ts`
- Test: `test/main/cli/baseUrl.test.ts`

- [ ] **Step 1: Write failing tests** for `slimeHomeDir` defaulting to `~/.slime`, custom/E2E deriving `.slime-home` from `userData`, `SLIME_HOME_DIR` override, and CLI config lookup no longer using `.slime-dev`.
- [ ] **Step 2: Run focused tests** for paths and CLI base URL.
- [ ] **Step 3: Implement path resolution** with explicit env priority and production/development shared default.
- [ ] **Step 4: Re-run focused tests** until green.

### Task 3: Runtime Lock

**Files:**

- Create: `src/main/utils/runtimeLock.ts`
- Test: `test/main/runtimeLock.test.ts`

- [ ] **Step 1: Write failing tests** for creating a lock, rejecting live PID, replacing stale or malformed locks, and releasing only current PID ownership.
- [ ] **Step 2: Run focused lock tests**.
- [ ] **Step 3: Implement `acquireRuntimeLock(profile)`** using atomic lock writes, `process.kill(pid, 0)` liveness checks, and ownership-checked release.
- [ ] **Step 4: Re-run focused lock tests** until green.

### Task 4: Startup Wiring and Scripts

**Files:**

- Modify: `src/main/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Remove the non-packaged `slime-dev` rewrite** from startup.
- [ ] **Step 2: Resolve profile before single-instance lock**, log profile/userData on startup, acquire runtime lock after directory creation, and release it on `will-quit`.
- [ ] **Step 3: Add `dev:staging` and `test:e2e` scripts**.
- [ ] **Step 4: Run typecheck, lint, and focused tests**.
