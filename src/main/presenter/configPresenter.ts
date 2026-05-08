import { JsonStore, logger, paths } from "@/utils";
import { app } from "electron";
import { eventBus } from "@/eventbus";
import { CONFIG_EVENTS } from "@shared/events";
import type { IConfigPresenter } from "@shared/types/presenters";

const DEFAULT_CONFIG: Record<string, unknown> = {
  task_server_port: app.isPackaged ? 40001 : 40002,
};

export class ConfigPresenter implements IConfigPresenter {
  private store = new JsonStore<Record<string, unknown>>(
    "slime.config.json",
    DEFAULT_CONFIG,
    paths.slimeHomeDir,
  );

  async ensureDefaults(): Promise<void> {
    const data = await this.store.read();
    let changed = false;
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
      if (data[k] === undefined) {
        data[k] = v;
        changed = true;
      }
    }
    if (changed) await this.store.write(data);
  }

  async get(key: string): Promise<unknown> {
    const data = await this.store.read();
    return data[key] ?? null;
  }

  async set(key: string, value: unknown): Promise<boolean> {
    const data = await this.store.read();
    data[key] = value;
    await this.store.write(data);
    eventBus.sendToRenderer(CONFIG_EVENTS.CHANGED, key, value);
    logger.debug("Config set", { key });
    return true;
  }

  async readAll(): Promise<Record<string, unknown>> {
    return this.store.read();
  }
}
