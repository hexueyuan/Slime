import type { IGitPresenter } from "@shared/types/presenters";
import { logger } from "@/utils";

export class GitPresenter implements IGitPresenter {
  async tag(name: string, message: string): Promise<boolean> {
    logger.debug("git:tag called", { name, message });
    // TODO: 实现 Git tag
    return false;
  }
}
