import { app } from "electron";
import type { IAppPresenter } from "@shared/types/presenters";

export class AppPresenter implements IAppPresenter {
  getVersion(): string {
    return app.getVersion();
  }
}
