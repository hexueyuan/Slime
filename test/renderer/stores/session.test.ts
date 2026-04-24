import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ipcRenderer } from "electron";

const mockInvoke = vi.mocked(ipcRenderer.invoke);

(globalThis as any).window = {
  electron: { ipcRenderer: { invoke: mockInvoke, on: vi.fn(), removeAllListeners: vi.fn() } },
};

import { useSessionStore } from "@/stores/session";

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
  });

  it("should start with no active session", () => {
    const store = useSessionStore();
    expect(store.activeSessionId).toBeNull();
  });

  it("ensureSession should use existing session", async () => {
    const mockSessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    mockInvoke.mockResolvedValueOnce(mockSessions);

    const store = useSessionStore();
    await store.ensureSession();

    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "sessionPresenter", "getSessions");
    expect(store.activeSessionId).toBe("s1");
  });

  it("ensureSession should create session when none exist", async () => {
    const newSession = { id: "s2", title: "新对话", createdAt: 1, updatedAt: 1 };
    mockInvoke.mockResolvedValueOnce([]); // getSessions returns empty
    mockInvoke.mockResolvedValueOnce(newSession); // createSession

    const store = useSessionStore();
    await store.ensureSession();

    expect(store.activeSessionId).toBe("s2");
  });
});
