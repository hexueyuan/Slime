import { describe, it, expect, vi, beforeEach } from "vitest";
import { ipcMain } from "electron";

vi.mock("@/presenter/gatewayPresenter", () => ({
  GatewayPresenter: vi.fn(() => ({
    init: vi.fn(),
    destroy: vi.fn(),
    getPort: vi.fn(() => 8930),
    getInternalKey: vi.fn(() => "sk-slime-mock"),
    listChannels: vi.fn(() => []),
    listGroups: vi.fn(() => []),
    listApiKeys: vi.fn(() => []),
    listPrices: vi.fn(() => []),
  })),
}));

const mockHandle = vi.mocked(ipcMain.handle);

function findHandler(channel: string) {
  const call = mockHandle.mock.calls.find((c) => c[0] === channel);
  return call?.[1];
}

describe("Presenter", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers presenter:call and dispatches allowed presenters", async () => {
    await import("@/presenter/index");
    expect(mockHandle).toHaveBeenCalledWith("presenter:call", expect.any(Function));
    const handler = findHandler("presenter:call")!;
    const result = await handler({} as any, "sessionPresenter", "getSessions");
    expect(Array.isArray(result)).toBe(true);
  });

  it("should reject non-dispatchable presenter names", async () => {
    await import("@/presenter/index");
    const handler = findHandler("presenter:call")!;
    await expect(handler({} as any, "notReal", "method")).rejects.toThrow("not dispatchable");
  });

  it("should reject non-existent methods", async () => {
    await import("@/presenter/index");
    const handler = findHandler("presenter:call")!;
    await expect(handler({} as any, "appPresenter", "noSuchMethod")).rejects.toThrow("not found");
  });
});
