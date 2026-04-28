import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppPresenter } from "@/presenter/appPresenter";

const {
  mockElectronApp,
  mockDialog,
  mockUnlink,
  mockMkdirSync,
  mockReaddirSync,
  mockWriteFileSync,
  mockExecSync,
  mockSpawnReturn,
  mockSpawn,
} = vi.hoisted(() => {
  const mockSpawnReturn = { unref: vi.fn() };
  return {
    mockElectronApp: {
      getVersion: () => "0.0.0",
      isPackaged: false as boolean,
      getAppPath: vi.fn(() => "/Applications/Slime.app/Contents/Resources/app.asar"),
      getPath: vi.fn(() => "/tmp"),
      exit: vi.fn(),
    },
    mockDialog: { showOpenDialog: vi.fn() },
    mockUnlink: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockExecSync: vi.fn(),
    mockSpawnReturn,
    mockSpawn: vi.fn(() => mockSpawnReturn),
  };
});

vi.mock("electron", () => ({ app: mockElectronApp, dialog: mockDialog }));
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
vi.mock("fs/promises", () => ({ unlink: (...args: unknown[]) => mockUnlink(...args) }));
vi.mock("fs", () => ({
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));
vi.mock("child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

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

describe("AppPresenter.selectLocalZip", () => {
  let presenter: AppPresenter;

  beforeEach(() => {
    presenter = new AppPresenter();
    vi.clearAllMocks();
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
  });

  it("returns null when dialog canceled", async () => {
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await presenter.selectLocalZip();
    expect(result).toBeNull();
  });

  it("returns path when file selected", async () => {
    mockDialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/path/to/slime.zip"],
    });
    const result = await presenter.selectLocalZip();
    expect(result).toBe("/path/to/slime.zip");
  });
});

describe("AppPresenter.applyLocalZip", () => {
  let presenter: AppPresenter;

  beforeEach(() => {
    presenter = new AppPresenter();
    vi.clearAllMocks();
    mockElectronApp.isPackaged = false;
    mockElectronApp.getAppPath.mockReturnValue(
      "/Applications/Slime.app/Contents/Resources/app.asar",
    );
    mockElectronApp.getPath.mockReturnValue("/tmp");
    mockReaddirSync.mockReturnValue(["Slime.app"]);
    mockSpawn.mockReturnValue(mockSpawnReturn);
  });

  it("returns error in dev mode", async () => {
    const result = await presenter.applyLocalZip("/fake/slime.zip");
    expect(result).toEqual({ success: false, error: "仅 packaged 模式支持本地更新" });
  });

  it("returns error when no .app found in zip", async () => {
    mockElectronApp.isPackaged = true;
    mockReaddirSync.mockReturnValue([]);
    const result = await presenter.applyLocalZip("/fake/slime.zip");
    expect(result).toEqual({ success: false, error: "安装包内未找到 .app 文件" });
  });

  it("spawns swap script and exits in packaged mode", async () => {
    mockElectronApp.isPackaged = true;
    await presenter.applyLocalZip("/fake/slime.zip");
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("ditto -xk"),
      expect.any(Object),
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      "/bin/bash",
      expect.any(Array),
      expect.objectContaining({ detached: true }),
    );
    expect(mockElectronApp.exit).toHaveBeenCalledWith(0);
  });
});
