import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { IFilePresenter } from "@shared/types/presenters";
import { logger } from "@/utils";

export class FilePresenter implements IFilePresenter {
  constructor(private projectRoot?: string) {}

  private resolveSafe(userPath: string): string {
    const root = this.projectRoot || process.cwd();
    const resolved = resolve(root, userPath);
    if (!resolved.startsWith(root)) {
      throw new Error(`Path "${userPath}" resolves outside project root`);
    }
    return resolved;
  }

  async read(path: string, offset?: number, limit?: number): Promise<string> {
    const abs = this.resolveSafe(path);
    logger.debug("file:read", { path: abs });
    const content = await readFile(abs, "utf-8");
    if (offset === undefined && limit === undefined) return content;
    const lines = content.split("\n");
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : lines.length;
    return lines.slice(start, end).join("\n");
  }

  async write(path: string, content: string): Promise<boolean> {
    const abs = this.resolveSafe(path);
    logger.debug("file:write", { path: abs, length: content.length });
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
    return true;
  }

  async edit(path: string, oldText: string, newText: string): Promise<boolean> {
    const abs = this.resolveSafe(path);
    logger.debug("file:edit", { path: abs });
    const content = await readFile(abs, "utf-8");
    const idx = content.indexOf(oldText);
    if (idx === -1) throw new Error(`old_text not found in "${path}"`);
    if (content.indexOf(oldText, idx + 1) !== -1) {
      throw new Error(`old_text matches multiple times in "${path}"`);
    }
    const updated = content.slice(0, idx) + newText + content.slice(idx + oldText.length);
    await writeFile(abs, updated, "utf-8");
    return true;
  }
}
