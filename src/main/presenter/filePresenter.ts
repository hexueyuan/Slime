import type { IFilePresenter } from "@shared/types/presenters";
import { logger } from "@/utils";

export class FilePresenter implements IFilePresenter {
  async read(path: string): Promise<string> {
    logger.debug("file:read called", { path });
    // TODO: 实现文件读取
    return "";
  }

  async write(path: string, content: string): Promise<boolean> {
    logger.debug("file:write called", { path, contentLength: content.length });
    // TODO: 实现文件写入
    return false;
  }
}
