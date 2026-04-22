import { EventEmitter } from "events";
import type { BrowserWindow } from "electron";

export class EventBus extends EventEmitter {
  private win: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  sendToMain(event: string, ...args: unknown[]): void {
    this.emit(event, ...args);
  }

  sendToRenderer(event: string, ...args: unknown[]): void {
    this.win?.webContents.send(event, ...args);
  }

  send(event: string, ...args: unknown[]): void {
    this.sendToMain(event, ...args);
    this.sendToRenderer(event, ...args);
  }
}

export const eventBus = new EventBus();
