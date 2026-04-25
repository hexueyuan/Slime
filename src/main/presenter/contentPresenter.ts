import type { FunctionContent } from "@shared/types/content";
import type { IContentPresenter } from "@shared/types/presenters";
import { CONTENT_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger } from "@/utils";

export class ContentPresenter implements IContentPresenter {
  private contents = new Map<string, FunctionContent>();

  setContent(sessionId: string, content: FunctionContent): void {
    this.contents.set(sessionId, content);
    eventBus.sendToRenderer(CONTENT_EVENTS.UPDATED, sessionId, content);
  }

  getContent(sessionId: string): FunctionContent | null {
    return this.contents.get(sessionId) ?? null;
  }

  clearContent(sessionId: string): void {
    this.contents.delete(sessionId);
    eventBus.sendToRenderer(CONTENT_EVENTS.CLEARED, sessionId);
  }

  confirmPreview(sessionId: string): void {
    logger.debug("content:preview-confirm", { sessionId });
  }

  adjustPreview(sessionId: string): void {
    logger.debug("content:preview-adjust", { sessionId });
  }

  cancelProgress(sessionId: string): void {
    logger.debug("content:progress-cancel", { sessionId });
  }

  async openFile(sessionId: string, filePath: string): Promise<void> {
    const { readFile } = await import("fs/promises");
    const { resolve, extname } = await import("path");
    const { paths } = await import("@/utils");
    const root = paths.effectiveProjectRoot;
    const abs = resolve(root, filePath);
    if (!abs.startsWith(root)) {
      throw new Error(`Path "${filePath}" resolves outside project root`);
    }
    const raw = await readFile(abs, "utf-8");
    const ext = extname(filePath).toLowerCase();
    if (ext === ".html" || ext === ".htm") {
      this.setContent(sessionId, { type: "preview", html: raw, title: filePath });
    } else if (ext === ".md") {
      this.setContent(sessionId, { type: "markdown", content: raw, title: filePath });
    } else {
      this.setContent(sessionId, {
        type: "markdown",
        content: "```\n" + raw + "\n```",
        title: filePath,
      });
    }
  }
}
