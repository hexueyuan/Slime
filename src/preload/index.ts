import { contextBridge, ipcRenderer } from "electron";

const electronApi = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
      ipcRenderer.invoke(channel, ...args),

    on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
        listener(...args);
      ipcRenderer.on(channel, wrappedListener);
      return () => ipcRenderer.removeListener(channel, wrappedListener);
    },

    removeAllListeners: (channel: string): void => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronApi);
  } catch (error) {
    console.error("Preload: Failed to expose API via contextBridge:", error);
  }
} else {
  (window as any).electron = electronApi;
}
