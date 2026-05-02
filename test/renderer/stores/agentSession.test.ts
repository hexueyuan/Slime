import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const mockInvoke = vi.fn();
(globalThis as any).window = {
  electron: {
    ipcRenderer: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), removeAllListeners: vi.fn() },
  },
};

import { useAgentSessionStore } from "@/stores/agentSession";

const NOW = 1000000000000; // 固定基准时间
const DAY_MS = 24 * 60 * 60 * 1000;
const THRESHOLD_MS = 3 * DAY_MS;

function makeSession(overrides: Partial<{ id: string; updatedAt: number; isPinned: boolean }>) {
  return {
    id: "s1",
    agentId: "a1",
    title: "test",
    isPinned: false,
    sessionKind: "regular" as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("agentSession store - archive logic", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("recent session appears in activeSessions", async () => {
    const recent = makeSession({ id: "s1", updatedAt: NOW - DAY_MS });
    mockInvoke.mockResolvedValue([recent]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.activeSessions.map((s) => s.id)).toContain("s1");
    expect(store.archivedSessions.map((s) => s.id)).not.toContain("s1");
  });

  it("session older than 3 days appears in archivedSessions", async () => {
    const old = makeSession({ id: "s2", updatedAt: NOW - THRESHOLD_MS - 1 });
    mockInvoke.mockResolvedValue([old]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.archivedSessions.map((s) => s.id)).toContain("s2");
    expect(store.activeSessions.map((s) => s.id)).not.toContain("s2");
  });

  it("pinned session stays in activeSessions even if older than 3 days", async () => {
    const pinned = makeSession({ id: "s3", updatedAt: NOW - THRESHOLD_MS - 1, isPinned: true });
    mockInvoke.mockResolvedValue([pinned]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.activeSessions.map((s) => s.id)).toContain("s3");
    expect(store.archivedSessions.map((s) => s.id)).not.toContain("s3");
  });

  it("session exactly at threshold boundary goes to archivedSessions", async () => {
    const boundary = makeSession({ id: "s4", updatedAt: NOW - THRESHOLD_MS });
    mockInvoke.mockResolvedValue([boundary]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    expect(store.archivedSessions.map((s) => s.id)).toContain("s4");
  });

  it("activeSessions sorted: pinned first then by updatedAt DESC", async () => {
    const s1 = makeSession({ id: "s1", updatedAt: NOW - 1000, isPinned: false });
    const s2 = makeSession({ id: "s2", updatedAt: NOW - 500, isPinned: false });
    const s3 = makeSession({ id: "s3", updatedAt: NOW - 2000, isPinned: true });
    mockInvoke.mockResolvedValue([s1, s2, s3]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    const ids = store.activeSessions.map((s) => s.id);
    expect(ids[0]).toBe("s3"); // pinned first
    expect(ids[1]).toBe("s2"); // then newest
    expect(ids[2]).toBe("s1");
  });

  it("archivedSessions sorted by updatedAt DESC", async () => {
    const s1 = makeSession({ id: "s1", updatedAt: NOW - THRESHOLD_MS - DAY_MS });
    const s2 = makeSession({ id: "s2", updatedAt: NOW - THRESHOLD_MS - 2 * DAY_MS });
    mockInvoke.mockResolvedValue([s1, s2]);
    const store = useAgentSessionStore();
    await store.fetchSessions();
    const ids = store.archivedSessions.map((s) => s.id);
    expect(ids[0]).toBe("s1"); // less old = first
    expect(ids[1]).toBe("s2");
  });
});
