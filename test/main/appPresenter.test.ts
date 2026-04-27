import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppPresenter } from "@/presenter/appPresenter";

vi.mock("electron", () => ({ app: { getVersion: () => "0.0.0" } }));
vi.mock("@/utils", () => ({
  paths: {
    get slimeDir() {
      return "/mock/.slime";
    },
    get configFile() {
      return "/mock/.slime/config/slime.config.json";
    },
  },
}));

const mockUnlink = vi.fn();
vi.mock("fs/promises", () => ({ unlink: (...args: unknown[]) => mockUnlink(...args) }));

describe("AppPresenter", () => {
  let presenter: AppPresenter;

  beforeEach(() => {
    presenter = new AppPresenter();
    vi.clearAllMocks();
  });

  it("getVersion returns app version", () => {
    expect(presenter.getVersion()).toBe("0.0.0");
  });

  it("resetAllData deletes both files", async () => {
    mockUnlink.mockResolvedValue(undefined);
    const result = await presenter.resetAllData();
    expect(result).toEqual({ success: true });
    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith("/mock/.slime/gateway.db");
    expect(mockUnlink).toHaveBeenCalledWith("/mock/.slime/config/slime.config.json");
  });

  it("resetAllData ignores ENOENT", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    mockUnlink.mockRejectedValue(err);
    const result = await presenter.resetAllData();
    expect(result).toEqual({ success: true });
  });

  it("resetAllData returns error on other failures", async () => {
    const err = new Error("permission denied");
    mockUnlink.mockImplementation((p: string) => {
      if (p.endsWith("gateway.db")) return Promise.reject(err);
      return Promise.resolve();
    });
    const result = await presenter.resetAllData();
    expect(result).toEqual({ success: false, error: "permission denied" });
  });
});
