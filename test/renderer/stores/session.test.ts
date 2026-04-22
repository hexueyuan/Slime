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

  it("should start with empty sessions and no active session", () => {
    const store = useSessionStore();
    expect(store.sessions).toEqual([]);
    expect(store.activeSessionId).toBeNull();
  });

  it("should fetch sessions via IPC", async () => {
    const mockSessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    mockInvoke.mockResolvedValueOnce(mockSessions);

    const store = useSessionStore();
    await store.fetchSessions();

    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "sessionPresenter", "getSessions");
    expect(store.sessions).toEqual(mockSessions);
  });

  it("should create session via IPC and set as active", async () => {
    const newSession = { id: "s1", title: "新对话", createdAt: 1, updatedAt: 1 };
    mockInvoke.mockResolvedValueOnce(newSession);

    const store = useSessionStore();
    await store.createSession();

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "createSession",
      undefined,
    );
    expect(store.sessions).toContainEqual(newSession);
    expect(store.activeSessionId).toBe("s1");
  });

  it("should select session", () => {
    const store = useSessionStore();
    store.sessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    store.selectSession("s1");
    expect(store.activeSessionId).toBe("s1");
  });

  it("should delete session via IPC", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const store = useSessionStore();
    store.sessions = [{ id: "s1", title: "test", createdAt: 1, updatedAt: 1 }];
    store.activeSessionId = "s1";

    await store.deleteSession("s1");

    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "sessionPresenter",
      "deleteSession",
      "s1",
    );
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
  });
});
