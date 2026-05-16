# Gateway Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Gateway UI stalls under high request volume and after idle reactivation.

**Architecture:** Move Gateway log persistence from per-request synchronous flushes to a batched collector with flush notifications. Centralize renderer refresh scheduling so stats, logs, and channel charts are deduplicated, throttled, and only refreshed when relevant UI is active.

**Tech Stack:** TypeScript, Electron main process, Vue 3 Composition API, Pinia, Vitest, better-sqlite3.

---

### Task 1: Batch Gateway Log Persistence

**Files:**

- Modify: `src/main/gateway/stats.ts`
- Modify: `src/main/presenter/gatewayPresenter.ts`
- Test: `test/main/gateway-stats.test.ts`
- Test: `test/main/gatewayPresenter.test.ts`

- [ ] Add tests proving `StatsCollector` flushes by interval and by batch size, and invokes a callback once per flushed batch.
- [ ] Remove the per-request `statsCollector.flush()` call from `GatewayPresenter`.
- [ ] Emit `GATEWAY_EVENTS.LOG_ADDED` only from the collector flush callback.
- [ ] Keep `destroy()` flushing remaining buffered logs before shutdown.

### Task 2: Renderer Refresh Scheduler

**Files:**

- Create: `src/renderer/src/composables/useGatewayRefreshScheduler.ts`
- Modify: `src/renderer/src/views/GatewayPanel.vue`
- Modify: `src/renderer/src/components/gateway/LogTab.vue`
- Modify: `src/renderer/src/components/gateway/ChannelTab.vue`
- Test: `test/renderer/composables/useGatewayRefreshScheduler.test.ts`

- [ ] Add a reusable scheduler that coalesces repeated refresh requests, enforces a minimum interval, and supports immediate runs for activation.
- [ ] Replace direct `LOG_ADDED` refresh calls in GatewayPanel with scheduled stats refresh.
- [ ] Replace LogTab clear-and-reload on every event with scheduled first-page refresh while the tab is mounted.
- [ ] Replace ChannelTab local debounce with the scheduler.

### Task 3: Verification

**Files:**

- Modify only files touched by Tasks 1-2.

- [ ] Run focused main tests for Gateway stats and presenter behavior.
- [ ] Run focused renderer scheduler tests.
- [ ] Run `pnpm run format`.
- [ ] Run `pnpm run lint`.
- [ ] Run broader relevant tests if focused tests expose integration risk.
