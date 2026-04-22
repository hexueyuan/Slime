import { contextBridge } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";

exposeElectronAPI();

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", {});
  } catch (error) {
    console.error("Preload: Failed to expose API via contextBridge:", error);
  }
} else {
  // @ts-expect-error fallback for non-isolated context
  window.api = {};
}
