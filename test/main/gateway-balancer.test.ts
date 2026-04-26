import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBalancer } from "@/gateway/balancer";
import { createCircuitBreaker } from "@/gateway/circuit";
import { createKeyPool } from "@/gateway/keypool";
import type { GroupItem, ChannelKey } from "@shared/types/gateway";

function makeItem(overrides: Partial<GroupItem> = {}): GroupItem {
  return { id: 1, groupId: 1, channelId: 1, modelName: "m", priority: 0, weight: 1, ...overrides };
}

function makeKey(overrides: Partial<ChannelKey> = {}): ChannelKey {
  return { id: 1, channelId: 1, key: "sk-1", enabled: true, createdAt: "", ...overrides };
}

describe("balancer", () => {
  it("failover sorts by priority descending", () => {
    const b = createBalancer();
    const items = [
      makeItem({ id: 1, priority: 1 }),
      makeItem({ id: 2, priority: 10 }),
      makeItem({ id: 3, priority: 5 }),
    ];
    const result = b.sort(items, "failover");
    expect(result.map((i) => i.priority)).toEqual([10, 5, 1]);
  });

  it("random does not modify original array", () => {
    const b = createBalancer();
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })];
    const original = [...items];
    b.sort(items, "random");
    expect(items).toEqual(original);
  });

  it("round_robin rotates on each call", () => {
    const b = createBalancer();
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 }), makeItem({ id: 3 })];
    const first = b.sort(items, "round_robin");
    const second = b.sort(items, "round_robin");
    expect(first[0].id).not.toBe(second[0].id);
  });

  it("weighted favors higher weight", () => {
    const b = createBalancer();
    const heavy = makeItem({ id: 1, weight: 1000 });
    const light = makeItem({ id: 2, weight: 1 });
    let heavyFirst = 0;
    for (let i = 0; i < 100; i++) {
      const result = b.sort([heavy, light], "weighted");
      if (result[0].id === 1) heavyFirst++;
    }
    expect(heavyFirst).toBeGreaterThan(80);
  });

  it("empty list returns empty", () => {
    const b = createBalancer();
    expect(b.sort([], "round_robin")).toEqual([]);
    expect(b.sort([], "random")).toEqual([]);
    expect(b.sort([], "failover")).toEqual([]);
    expect(b.sort([], "weighted")).toEqual([]);
  });
});

describe("circuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state is closed, isTripped false", () => {
    const cb = createCircuitBreaker();
    expect(cb.isTripped(1, 1, "m")).toBe(false);
  });

  it("opens after reaching failure threshold", () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i++) cb.recordFailure(1, 1, "m");
    expect(cb.isTripped(1, 1, "m")).toBe(true);
  });

  it("recordSuccess resets to closed", () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure(1, 1, "m");
    cb.recordFailure(1, 1, "m");
    cb.recordSuccess(1, 1, "m");
    cb.recordFailure(1, 1, "m");
    expect(cb.isTripped(1, 1, "m")).toBe(false);
  });

  it("transitions to half_open after cooldown", () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, baseCooldown: 10_000 });
    cb.recordFailure(1, 1, "m");
    cb.recordFailure(1, 1, "m");
    expect(cb.isTripped(1, 1, "m")).toBe(true);

    vi.advanceTimersByTime(10_000);
    expect(cb.isTripped(1, 1, "m")).toBe(false); // half_open, first probe allowed
    expect(cb.isTripped(1, 1, "m")).toBe(true); // half_open blocks subsequent
  });

  it("half_open success restores closed", () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, baseCooldown: 10_000 });
    cb.recordFailure(1, 1, "m");
    cb.recordFailure(1, 1, "m");

    vi.advanceTimersByTime(10_000);
    cb.isTripped(1, 1, "m"); // transitions to half_open
    cb.recordSuccess(1, 1, "m");
    expect(cb.isTripped(1, 1, "m")).toBe(false);
  });

  it("half_open failure re-opens with doubled cooldown", () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, baseCooldown: 10_000 });
    cb.recordFailure(1, 1, "m");
    cb.recordFailure(1, 1, "m"); // open, tripCount=1

    vi.advanceTimersByTime(10_000); // cooldown = 10s * 2^0 = 10s
    cb.isTripped(1, 1, "m"); // half_open
    cb.recordFailure(1, 1, "m"); // re-open, tripCount=2

    // cooldown should now be 10s * 2^1 = 20s
    vi.advanceTimersByTime(10_000);
    expect(cb.isTripped(1, 1, "m")).toBe(true); // still open
    vi.advanceTimersByTime(10_000);
    expect(cb.isTripped(1, 1, "m")).toBe(false); // half_open again
  });

  it("getHealthScore returns 1 when all closed", () => {
    const cb = createCircuitBreaker();
    cb.recordFailure(1, 1, "m"); // 1 failure, still closed
    expect(cb.getHealthScore(1, "m")).toBe(1);
  });

  it("getHealthScore decreases with open entries", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(1, 1, "m"); // open
    cb.recordFailure(1, 2, "m"); // open
    // key 3 not recorded → not in map → not counted
    expect(cb.getHealthScore(1, "m")).toBe(0);
  });

  it("reset clears all state", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(1, 1, "m");
    expect(cb.isTripped(1, 1, "m")).toBe(true);
    cb.reset();
    expect(cb.isTripped(1, 1, "m")).toBe(false);
  });
});

describe("keyPool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects first available key", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker();
    const keys = [makeKey({ id: 1 }), makeKey({ id: 2 })];
    const result = pool.selectKey(keys, 1, "m", cb);
    expect(result?.id).toBe(1);
  });

  it("skips disabled key", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker();
    const keys = [makeKey({ id: 1, enabled: false }), makeKey({ id: 2 })];
    const result = pool.selectKey(keys, 1, "m", cb);
    expect(result?.id).toBe(2);
  });

  it("skips 429 cooled key", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker();
    const keys = [makeKey({ id: 1 }), makeKey({ id: 2 })];
    pool.mark429(1, 1, 60_000);
    const result = pool.selectKey(keys, 1, "m", cb);
    expect(result?.id).toBe(2);
  });

  it("skips circuit-broken key", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(1, 1, "m");
    const keys = [makeKey({ id: 1 }), makeKey({ id: 2 })];
    const result = pool.selectKey(keys, 1, "m", cb);
    expect(result?.id).toBe(2);
  });

  it("returns undefined when all unavailable", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(1, 1, "m");
    const keys = [makeKey({ id: 1, enabled: false })];
    const result = pool.selectKey(keys, 1, "m", cb);
    expect(result).toBeUndefined();
  });

  it("429 cooldown expires and key becomes available", () => {
    const pool = createKeyPool();
    const cb = createCircuitBreaker();
    const keys = [makeKey({ id: 1 })];
    pool.mark429(1, 1, 5_000);
    expect(pool.selectKey(keys, 1, "m", cb)).toBeUndefined();

    vi.advanceTimersByTime(5_000);
    expect(pool.selectKey(keys, 1, "m", cb)?.id).toBe(1);
  });
});
