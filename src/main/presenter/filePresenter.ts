import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { resolve, dirname, join, relative } from "path";
import type { IFilePresenter, DirEntry } from "@shared/types/presenters";
import { logger } from "@/utils";

const HIDDEN_DIR_PATTERNS = [
  ".git",
  "node_modules",
  "dist",
  ".slime",
  ".tmp",
  ".turbo",
  ".output",
  ".nuxt",
];

const FORBIDDEN_WRITE_PATTERNS = [
  /^\.git(\/|$)/,
  /^node_modules(\/|$)/,
  /^dist(\/|$)/,
  /^\.slime(\/|$)/,
  /\.secret\./,
  /\.key$/,
];

export class FilePresenter implements IFilePresenter {
  private trustedPaths: string[] = [];

  constructor(private projectRoot?: string) {}

  addTrustedPath(p: string): void {
    const normalized = p.endsWith("/") ? p : p + "/";
    if (!this.trustedPaths.includes(normalized)) {
      this.trustedPaths.push(normalized);
    }
  }

  private validateWritable(userPath: string, extraTrustedPaths?: string[]): void {
    const normalized = userPath.replace(/\\/g, "/");
    for (const pattern of FORBIDDEN_WRITE_PATTERNS) {
      if (pattern.test(normalized)) {
        // Allow writes to paths within extraTrustedPaths even if they match forbidden patterns
        const abs = this.resolveSafe(userPath, extraTrustedPaths);
        const inExtra = (extraTrustedPaths ?? []).some((tp) => {
          const normalized = tp.endsWith("/") ? tp : tp + "/";
          return abs.startsWith(normalized);
        });
        if (!inExtra) {
          throw new Error(`Cannot modify protected path: "${userPath}"`);
        }
        return;
      }
    }
  }

  private resolveSafe(userPath: string, extraTrustedPaths?: string[]): string {
    const root = this.projectRoot || process.cwd();
    const resolved = resolve(root, userPath);
    if (!resolved.startsWith(root)) {
      const allTrusted = [
        ...this.trustedPaths,
        ...(extraTrustedPaths ?? []).map((p) => (p.endsWith("/") ? p : p + "/")),
      ];
      const inTrusted = allTrusted.some((tp) => resolved.startsWith(tp));
      if (!inTrusted) {
        throw new Error(`Path "${userPath}" resolves outside project root`);
      }
    }
    return resolved;
  }

  async read(
    path: string,
    offset?: number,
    limit?: number,
    opts?: { extraTrustedPaths?: string[] },
  ): Promise<string> {
    const abs = this.resolveSafe(path, opts?.extraTrustedPaths);
    logger.debug("file:read", { path: abs });
    const content = await readFile(abs, "utf-8");
    if (offset === undefined && limit === undefined) return content;
    const lines = content.split("\n");
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : lines.length;
    return lines.slice(start, end).join("\n");
  }

  async write(
    path: string,
    content: string,
    opts?: { extraTrustedPaths?: string[] },
  ): Promise<boolean> {
    this.validateWritable(path, opts?.extraTrustedPaths);
    const abs = this.resolveSafe(path, opts?.extraTrustedPaths);
    logger.debug("file:write", { path: abs, length: content.length });
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
    return true;
  }

  async edit(
    path: string,
    oldText: string,
    newText: string,
    opts?: { extraTrustedPaths?: string[] },
  ): Promise<boolean> {
    this.validateWritable(path, opts?.extraTrustedPaths);
    const abs = this.resolveSafe(path, opts?.extraTrustedPaths);
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

  async listDir(path?: string, opts?: { extraTrustedPaths?: string[] }): Promise<DirEntry[]> {
    const root = this.projectRoot || process.cwd();
    const abs = path ? this.resolveSafe(path, opts?.extraTrustedPaths) : root;
    const entries = await readdir(abs, { withFileTypes: true });
    return entries
      .filter((e) => !HIDDEN_DIR_PATTERNS.includes(e.name))
      .map((e) => ({
        name: e.name,
        path: relative(root, join(abs, e.name)),
        type: e.isDirectory() ? ("dir" as const) : ("file" as const),
      }));
  }
}
