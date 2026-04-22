import { app } from "electron";
import { registerHandler } from "../index";

export function registerAppHandlers(): void {
  registerHandler("app:getVersion", () => app.getVersion());
}
