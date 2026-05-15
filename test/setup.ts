import { vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getName: vi.fn(() => "Slime"),
    getVersion: vi.fn(() => "0.1.0"),
    getPath: vi.fn(() => "/mock/path"),
    setPath: vi.fn(),
    on: vi.fn(),
    quit: vi.fn(),
    isReady: vi.fn(() => true),
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
  })),
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    send: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

beforeEach(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
