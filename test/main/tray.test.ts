import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface MockTrayInstance {
  destroy: ReturnType<typeof vi.fn>;
  setContextMenu: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setToolTip: ReturnType<typeof vi.fn>;
}

interface MockBrowserWindow {
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
}

const {
  mockTrayConstructor,
  mockTrayDestroy,
  mockMenuConstructor,
  mockNativeImage,
  mockBrowserWindow,
  getClickHandler,
  setClickHandler,
} = vi.hoisted(() => {
  let clickHandler: (() => void) | null = null;

  const mockTrayDestroy = vi.fn();
  const mockTraySetContextMenu = vi.fn();
  const mockTrayInstance: MockTrayInstance = {
    destroy: mockTrayDestroy,
    setContextMenu: mockTraySetContextMenu,
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "click") clickHandler = cb;
    }),
    setToolTip: vi.fn(),
  };

  const mockTrayConstructor = vi.fn(() => mockTrayInstance);
  const mockMenuConstructor = vi.fn();

  const mockNativeImage = {
    createFromPath: vi.fn(() => ({
      resize: vi.fn(() => ({ setTemplateImage: vi.fn() })),
    })),
  };

  const mockBrowserWindow: MockBrowserWindow = {
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
  };

  return {
    mockTrayConstructor,
    mockTrayDestroy,
    mockMenuConstructor,
    mockNativeImage,
    mockBrowserWindow,
    getClickHandler: () => clickHandler,
    setClickHandler: (h: (() => void) | null) => {
      clickHandler = h;
    },
  };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => "/mock/path"),
    quit: vi.fn(),
  },
  Tray: mockTrayConstructor,
  Menu: { buildFromTemplate: mockMenuConstructor },
  nativeImage: mockNativeImage,
}));

import { TrayManager } from "@/tray";

describe("TrayManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setClickHandler(null);
  });

  afterEach(() => {
    TrayManager.destroy();
  });

  it("init creates a Tray with icon", () => {
    TrayManager.init(mockBrowserWindow as any);

    expect(mockTrayConstructor).toHaveBeenCalled();
  });

  it("left-click shows window when hidden", () => {
    (mockBrowserWindow.isVisible as any).mockReturnValue(false);
    TrayManager.init(mockBrowserWindow as any);

    getClickHandler()?.();

    expect(mockBrowserWindow.show).toHaveBeenCalled();
    expect(mockBrowserWindow.focus).toHaveBeenCalled();
  });

  it("left-click hides window when visible", () => {
    (mockBrowserWindow.isVisible as any).mockReturnValue(true);
    TrayManager.init(mockBrowserWindow as any);

    getClickHandler()?.();

    expect(mockBrowserWindow.hide).toHaveBeenCalled();
  });

  it("destroy destroys the tray", () => {
    TrayManager.init(mockBrowserWindow as any);
    TrayManager.destroy();

    expect(mockTrayDestroy).toHaveBeenCalled();
  });
});
