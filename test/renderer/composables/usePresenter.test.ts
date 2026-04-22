import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePresenter } from "@/composables/usePresenter";

// mock window.electron
const mockInvoke = vi.fn();
Object.defineProperty(globalThis, "window", {
  value: {
    electron: {
      ipcRenderer: {
        invoke: mockInvoke,
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      },
    },
  },
  writable: true,
});

describe("usePresenter", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("should return a proxy that calls ipcRenderer.invoke", async () => {
    mockInvoke.mockResolvedValue("0.1.0");
    const appPresenter = usePresenter("appPresenter");
    const result = await appPresenter.getVersion();
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "appPresenter", "getVersion");
    expect(result).toBe("0.1.0");
  });

  it("should pass arguments through", async () => {
    mockInvoke.mockResolvedValue(null);
    const configPresenter = usePresenter("configPresenter");
    await configPresenter.get("theme");
    expect(mockInvoke).toHaveBeenCalledWith("presenter:call", "configPresenter", "get", "theme");
  });

  it("should handle multiple arguments", async () => {
    mockInvoke.mockResolvedValue(true);
    const configPresenter = usePresenter("configPresenter");
    await configPresenter.set("theme", "dark");
    expect(mockInvoke).toHaveBeenCalledWith(
      "presenter:call",
      "configPresenter",
      "set",
      "theme",
      "dark",
    );
  });
});
