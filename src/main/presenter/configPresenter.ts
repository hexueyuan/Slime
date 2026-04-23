import { JsonStore, logger, paths } from "@/utils";
import { eventBus } from "@/eventbus";
import { CONFIG_EVENTS } from "@shared/events";
import type { IConfigPresenter } from "@shared/types/presenters";

export class ConfigPresenter implements IConfigPresenter {
  private store = new JsonStore<Record<string, unknown>>("slime.config.json", {}, paths.configDir);

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
}
