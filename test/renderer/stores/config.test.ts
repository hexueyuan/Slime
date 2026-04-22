import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "@/stores/config";

// mock window.electron for usePresenter
const mockInvoke = vi.fn();
Object.defineProperty(globalThis, "window", {
  value: {
    electron: {
      ipcRenderer: {
        invoke: mockInvoke,
        on: vi.fn(() => vi.fn()),
        removeAllListeners: vi.fn(),
      },
    },
  },
  writable: true,
});

describe("configStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke.mockReset();
  });

  it("should start with empty cache", () => {
    const store = useConfigStore();
    expect(store.cache).toEqual({});
  });

  it("should get config via presenter", async () => {
    mockInvoke.mockResolvedValue("dark");
    const store = useConfigStore();
    const value = await store.get("theme");
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "configPresenter", "get", "theme");
    expect(value).toBe("dark");
    expect(store.cache["theme"]).toBe("dark");
  });

  it("should set config via presenter", async () => {
    mockInvoke.mockResolvedValue(true);
    const store = useConfigStore();
    const result = await store.set("theme", "dark");
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "configPresenter",
      "set",
      "theme",
      "dark",
    );
    expect(result).toBe(true);
  });
});
