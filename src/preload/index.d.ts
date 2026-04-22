export interface ElectronIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
  removeAllListeners(channel: string): void;
}

export interface ElectronApi {
  ipcRenderer: ElectronIpcRenderer;
}

declare global {
  interface Window {
    electron: ElectronApi;
  }
}
