import { describe, it, expect, vi, beforeEach } from "vitest";
import { ipcMain } from "electron";

const mockHandle = vi.mocked(ipcMain.handle);

describe("Presenter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should register presenter:call handler on import", async () => {
    await import("@/presenter/index");
    expect(mockHandle).toHaveBeenCalledWith("presenter:call", expect.any(Function));
  });

  it("should dispatch to appPresenter.getVersion", async () => {
    const { Presenter } = await import("@/presenter/index");
    const presenter = Presenter.getInstance();
    const result = presenter.appPresenter.getVersion();
    expect(result).toBe("0.1.0");
  });

  it("should have sessionPresenter registered", async () => {
    const { Presenter } = await import("@/presenter/index");
    const presenter = Presenter.getInstance();
    expect(presenter.sessionPresenter).toBeDefined();
    expect(typeof presenter.sessionPresenter.getSessions).toBe("function");
  });

  it("should dispatch to sessionPresenter via IPC", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    const result = await handler({} as any, "sessionPresenter", "getSessions");
    expect(Array.isArray(result)).toBe(true);
  });

  it("should reject non-dispatchable presenter names", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    await expect(handler({} as any, "notReal", "method")).rejects.toThrow("not dispatchable");
  });

  it("should reject non-existent methods", async () => {
    await import("@/presenter/index");
    const handler = mockHandle.mock.calls[0][1];
    await expect(handler({} as any, "appPresenter", "noSuchMethod")).rejects.toThrow("not found");
  });
});
