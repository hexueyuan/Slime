import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { paths } from "./paths";
import { logger } from "./logger";

export class JsonStore<T> {
  private filePath: string;

  constructor(
    relativePath: string,
    private defaultValue: T,
    baseDir?: string,
  ) {
    this.filePath = join(baseDir || paths.dataDir, relativePath);
  }

  async read(): Promise<T> {
    try {
      if (!existsSync(this.filePath)) return this.defaultValue;
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      logger.warn("JsonStore read failed, returning default", { path: this.filePath });
      return this.defaultValue;
    }
  }

  async write(data: T): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
