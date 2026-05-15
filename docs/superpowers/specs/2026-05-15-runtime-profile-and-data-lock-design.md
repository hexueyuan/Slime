# Runtime Profile and Data Lock Design

## Goal

Clarify how Slime separates production usage, manual development testing, staging/debug runs, and automated E2E tests.

The target model is:

```text
Installed Slime.app        -> real user data
pnpm run dev               -> real user data by default
pnpm run dev:staging       -> copied or explicitly assigned staging data
pnpm run test:e2e          -> temporary isolated data
same data dir, two Slimes  -> second instance exits
```

Because Slime is currently a single-user product, the development server does not need a long-lived independent data universe. Development should usually happen against the real Slime state, while E2E and dangerous migration/debug work remain isolated.

## Current State

In `src/main/index.ts`, non-packaged runs currently force Electron `userData` to `slime-dev`:

```typescript
if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "slime-dev"));
}
```

In `src/main/utils/paths.ts`, `slimeHomeDir` also branches by packaged state:

```typescript
return join(homedir(), app.isPackaged ? ".slime" : ".slime-dev");
```

This creates two persistent worlds:

```text
installed app -> production data
dev server    -> dev data
```

That was safer when development and production needed stronger separation, but it adds friction for a one-user Slime:

- Gateway config, API keys, agents, skills, and sessions diverge.
- Manual verification in dev does not reflect the real app state.
- Features that depend on self-evolution/workspace/session history are harder to test naturally.

## Desired Runtime Model

### Production

Production is the installed app and uses the real data directories:

```text
Electron userData: platform app data directory for Slime
Slime home:        ~/.slime
```

Production should not run at the same time as any other process using the same data directory.

### Development

`pnpm run dev` uses the same real data by default.

This means:

```text
Installed Slime.app and pnpm run dev are the same Slime state.
```

They differ only by executable/code source:

```text
Installed Slime.app -> packaged code
pnpm run dev        -> current source code
```

If the installed app is already running, `pnpm run dev` must fail fast instead of writing to the same SQLite/config/workspace files.

### Staging / Debug

Staging is explicit and opt-in. It is used for dangerous changes such as:

- Database migrations
- Config format migrations
- Evolution/apply workflow changes
- Reproducing a production issue against a copied data directory

Staging should be launched with an explicit data directory:

```bash
SLIME_USER_DATA_DIR=$HOME/.slime-staging pnpm run dev
```

Optionally, a helper script can copy real data into staging before launch.

### E2E

E2E is always isolated:

```text
one test run / worker -> one temporary userData directory
```

The E2E directory should be created by the test runner and deleted after the run. E2E must not read or write production data.

## Environment Variables

Runtime profile selection should be explicit and centralized.

Priority order:

```text
1. SLIME_E2E_USER_DATA
2. SLIME_USER_DATA_DIR
3. default Electron production userData
```

### `SLIME_E2E_USER_DATA`

Highest priority. Used only by automated tests.

Behavior:

- Set `app.setPath("userData", SLIME_E2E_USER_DATA)`.
- Mark profile as `e2e`.
- Use isolated Slime home/session directories under this temporary root unless separately overridden.
- Allow concurrent E2E workers only when each worker has a different directory.

### `SLIME_USER_DATA_DIR`

Manual override for staging/debug.

Behavior:

- Set `app.setPath("userData", SLIME_USER_DATA_DIR)`.
- Mark profile as `custom` or `staging`.
- Allow running alongside production only because the data directory is different.

### Optional: `SLIME_HOME_DIR`

If needed, add a second explicit override for `paths.slimeHomeDir`.

Without this variable, `slimeHomeDir` should follow the selected profile:

```text
production/development default -> ~/.slime
e2e/custom data dir            -> derived from selected userData
```

The important rule is to avoid half-shared state. If `userData` is isolated, sessions and Slime home should not silently point back to production.

## Data Directory Lock

Electron `app.requestSingleInstanceLock()` should remain, but it is not enough. Installed Slime and `pnpm run dev` may not always be treated as the same app identity. The stronger invariant is:

```text
Only one Slime process may own a given data directory.
```

Add a runtime lock file under the selected data root:

```text
{userData}/.slime/runtime.lock
```

Recommended lock content:

```json
{
  "pid": 12345,
  "profile": "development",
  "startedAt": "2026-05-15T12:00:00.000Z",
  "userData": "/Users/me/Library/Application Support/Slime",
  "appVersion": "0.8.14"
}
```

### Lock Acquisition

On startup:

1. Ensure base directories exist.
2. Try to create or claim `runtime.lock`.
3. If the lock does not exist, write it and continue.
4. If the lock exists and the recorded PID is alive, exit early.
5. If the lock exists but the PID is not alive, treat it as stale and overwrite it.

### Lock Release

On `will-quit`, remove the lock if it is still owned by the current PID.

The ownership check prevents one process from deleting another process's lock after a stale or unusual startup sequence.

### User-Facing Behavior

If another instance is running against the same data directory:

```text
Another Slime instance is already using this data directory.
Please quit the running Slime before starting this one.
```

For the first implementation, logging and clean exit are enough. A native dialog can be added later.

## Proposed Code Changes

### 1. Add `runtimeProfile.ts`

New file:

```text
src/main/utils/runtimeProfile.ts
```

Responsibilities:

- Read runtime-related environment variables.
- Set Electron `userData` when an override is present.
- Return a normalized profile object.

Sketch:

```typescript
export type RuntimeProfileName = "production" | "development" | "staging" | "e2e";

export interface RuntimeProfile {
  name: RuntimeProfileName;
  userData: string;
  isPackaged: boolean;
  isE2E: boolean;
  isCustomDataDir: boolean;
}

export function resolveRuntimeProfile(): RuntimeProfile {
  if (process.env.SLIME_E2E_USER_DATA) {
    app.setPath("userData", process.env.SLIME_E2E_USER_DATA);
    return {
      name: "e2e",
      userData: app.getPath("userData"),
      isPackaged: app.isPackaged,
      isE2E: true,
      isCustomDataDir: true,
    };
  }

  if (process.env.SLIME_USER_DATA_DIR) {
    app.setPath("userData", process.env.SLIME_USER_DATA_DIR);
    return {
      name: "staging",
      userData: app.getPath("userData"),
      isPackaged: app.isPackaged,
      isE2E: false,
      isCustomDataDir: true,
    };
  }

  return {
    name: app.isPackaged ? "production" : "development",
    userData: app.getPath("userData"),
    isPackaged: app.isPackaged,
    isE2E: false,
    isCustomDataDir: false,
  };
}
```

### 2. Add `runtimeLock.ts`

New file:

```text
src/main/utils/runtimeLock.ts
```

Responsibilities:

- Acquire data-directory lock.
- Detect live PID.
- Recover stale lock.
- Release lock on quit.

Sketch:

```typescript
export interface RuntimeLock {
  lockFile: string;
  release(): void;
}

export function acquireRuntimeLock(profile: RuntimeProfile): RuntimeLock {
  const lockFile = join(paths.slimeDir, "runtime.lock");
  // mkdir paths.slimeDir
  // if lock exists, parse and check pid
  // if live, throw RuntimeLockError
  // write current lock atomically
  // return release function
}
```

PID liveness can be checked with:

```typescript
process.kill(pid, 0);
```

On `ESRCH`, the process is gone and the lock is stale.

### 3. Update `index.ts`

Replace the current dev-only `slime-dev` branch.

New startup order:

```text
resolveRuntimeProfile()
requestSingleInstanceLock()
app.whenReady().then(bootstrap)
bootstrap()
  logger.info("Slime starting", { profile, userData })
  ensureDirectories()
  acquireRuntimeLock(profile)
  Presenter.init()
  createMainWindow()
will-quit
  releaseRuntimeLock()
```

`requestSingleInstanceLock()` remains useful, but data-dir lock becomes the real protection.

### 4. Update `paths.ts`

Remove default `.slime-dev` behavior from `slimeHomeDir`.

Desired default:

```typescript
get slimeHomeDir() {
  if (process.env.SLIME_HOME_DIR) {
    return process.env.SLIME_HOME_DIR;
  }

  if (process.env.SLIME_E2E_USER_DATA || process.env.SLIME_USER_DATA_DIR) {
    return join(this.userData, ".slime-home");
  }

  return join(homedir(), ".slime");
}
```

This keeps default production/development shared, while e2e/staging remain isolated unless deliberately overridden.

### 5. Update CLI Base URL Config Path

`src/cli/utils/baseUrl.ts` currently branches between `.slime-dev` and `.slime`.

It should use the same environment/profile rules as main process where possible:

```text
SLIME_DATA_DIR / SLIME_USER_DATA_DIR / SLIME_E2E_USER_DATA -> explicit data
default                                                   -> ~/.slime
```

This prevents CLI behavior from silently pointing to dev-only config after the app stops using `.slime-dev`.

### 6. Add Scripts

In `package.json`:

```json
{
  "dev:staging": "SLIME_USER_DATA_DIR=$HOME/.slime-staging pnpm run dev",
  "test:e2e": "playwright test"
}
```

Optional later helper:

```json
{
  "dev:staging:fresh": "node scripts/prepare-staging-data.js && SLIME_USER_DATA_DIR=$HOME/.slime-staging pnpm run dev"
}
```

The staging copy script should be careful not to overwrite staging data without confirmation.

## E2E Integration Plan

E2E should be added after the runtime profile and lock behavior is stable.

Recommended flow:

```text
Playwright test starts
  -> create temp userData dir
  -> launch Electron with SLIME_E2E_USER_DATA=temp
  -> use mocked Gateway/LLM responses
  -> run smoke checks
  -> close Electron
  -> delete temp dir
```

First E2E scenarios:

- App launches and main window becomes visible.
- Onboarding appears for a fresh profile.
- Basic gateway config screen can be opened.
- Chatroom can render against mocked state.

Avoid real LLM calls in E2E.

## Test Plan

### Unit Tests

Add tests for runtime profile resolution:

- `SLIME_E2E_USER_DATA` wins over all other modes.
- `SLIME_USER_DATA_DIR` creates staging/custom profile.
- Packaged app without overrides is production.
- Non-packaged app without overrides is development but uses default production data path.

Add tests for runtime lock behavior:

- Creates lock when none exists.
- Blocks startup when lock PID is alive.
- Replaces stale lock when PID is dead.
- Releases only when current process owns the lock.
- Ignores malformed stale lock safely.

Update path tests:

- `slimeHomeDir` defaults to `~/.slime`.
- E2E/custom profile does not leak sessions into `~/.slime`.

Update CLI tests:

- CLI config path no longer defaults to `.slime-dev`.
- Explicit env variables still route to the intended data/config directory.

### Manual Verification

1. Start installed Slime, then run `pnpm run dev`.
   - Expected: second process exits with a clear lock message.

2. Start `pnpm run dev`, then open installed Slime.
   - Expected: second process exits with a clear lock message.

3. Run staging:

   ```bash
   SLIME_USER_DATA_DIR=/tmp/slime-staging pnpm run dev
   ```

   - Expected: can run alongside installed Slime because data directories differ.

4. Run E2E with a temp directory.
   - Expected: no production config, sessions, API keys, or logs are touched.

## Migration Notes

Existing `.slime-dev` data should not be automatically migrated.

Reason:

- Production should become the default source of truth.
- `.slime-dev` was a development-only artifact.
- Automatic merging could overwrite or confuse real data.

If old dev data is needed, use a one-off manual copy or import process.

## Design Decisions

- **Default dev shares production data** because Slime is currently single-user and benefits from testing against the real state.
- **E2E remains fully isolated** because automated tests must be deterministic and must never touch real data.
- **Staging is explicit** because dangerous validation should be intentional.
- **Data-dir lock is required** because Electron single-instance locking is app-identity based, while the real risk is concurrent writes to the same data directory.
- **No automatic `.slime-dev` migration** because it is safer to leave old dev data untouched.

## Open Questions

- Should a second instance show a native dialog immediately, or is logging and exit enough for the first implementation?
- Should `dev:staging` copy production data automatically, or should copying remain a separate manual command?
- Should E2E use one temp profile per test file or one temp profile per worker?
- Should staging use `~/.slime-staging` by default, or a timestamped temp directory?

## Implementation Order

1. Add runtime profile resolution.
2. Update `index.ts` to stop forcing `slime-dev`.
3. Update `paths.ts` and CLI config path behavior.
4. Add data-directory runtime lock.
5. Add unit tests for profile/path/lock behavior.
6. Add `dev:staging` script.
7. Add Playwright E2E smoke tests in a separate change.
