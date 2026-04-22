import type { IConfigPresenter } from "@shared/types/presenters";
import { logger } from "@/utils";

export class ConfigPresenter implements IConfigPresenter {
  async get(key: string): Promise<unknown> {
    logger.debug("config:get called", { key });
    // TODO: 实现配置读取
    return null;
  }

  async set(key: string, value: unknown): Promise<boolean> {
    logger.debug("config:set called", { key, value });
    // TODO: 实现配置写入
    return false;
  }
}
