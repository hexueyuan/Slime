import { vi } from "vitest";

export const app = {
  getName: vi.fn(() => "Slime"),
  getVersion: vi.fn(() => "0.1.0"),
  getPath: vi.fn(() => "/mock/path"),
  on: vi.fn(),
  quit: vi.fn(),
  isReady: vi.fn(() => true),
  requestSingleInstanceLock: vi.fn(() => true),
  whenReady: vi.fn(() => Promise.resolve()),
  setAppUserModelId: vi.fn(),
};

export const BrowserWindow = vi.fn(() => ({
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  on: vi.fn(),
  show: vi.fn(),
  webContents: { send: vi.fn(), on: vi.fn() },
  isDestroyed: vi.fn(() => false),
}));

export const ipcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
};

export const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  send: vi.fn(),
};

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
};

export const shell = {
  openExternal: vi.fn(),
};
