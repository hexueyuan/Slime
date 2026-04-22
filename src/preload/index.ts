import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";
import type { IpcChannel, IpcChannels } from "@shared/types";

exposeElectronAPI();

const api = {
  invoke: <C extends IpcChannel>(
    channel: C,
    ...args: IpcChannels[C]["request"] extends void ? [] : [IpcChannels[C]["request"]]
  ): Promise<IpcChannels[C]["response"]> => {
    return ipcRenderer.invoke(channel, ...args);
  },

  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, ...args: unknown[]): void => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("slime", api);
  } catch (error) {
    console.error("Preload: Failed to expose API via contextBridge:", error);
  }
} else {
  window.slime = api;
}
