import { app } from "electron";
import { join } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { readFile, writeFile, mkdir, rm, cp } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import type { IDevPresenter, BuiltinAgentInfo, SkillManifest } from "@shared/types/presenters";

export class DevPresenter implements IDevPresenter {
  private get agentsSrcDir(): string {
    return join(process.cwd(), "src", "main", "agents");
  }

  private get skillsSrcDir(): string {
    return join(process.cwd(), "src", "main", "skills");
  }

  private assertDev(): void {
    if (app.isPackaged) {
      throw new Error("DevPresenter write operations are only available in dev mode");
    }
  }

  async isDev(): Promise<boolean> {
    return !app.isPackaged;
  }

  async listBuiltinAgents(): Promise<BuiltinAgentInfo[]> {
    const dir = this.agentsSrcDir;
    if (!existsSync(dir)) return [];

    const results: BuiltinAgentInfo[] = [];
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry);
      if (!statSync(entryPath).isDirectory()) continue;

      const configPath = join(entryPath, "config.json");
      if (!existsSync(configPath)) continue;

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const soulPath = join(entryPath, "soul.md");
      const soul = existsSync(soulPath) ? readFileSync(soulPath, "utf-8") : "";

      results.push({ id: entry, config, soul });
    }
    return results;
  }

  async getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null> {
    const dir = join(this.agentsSrcDir, agentId);
    if (!existsSync(dir)) return null;

    const configPath = join(dir, "config.json");
    if (!existsSync(configPath)) return null;

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    const soulPath = join(dir, "soul.md");
    const soul = existsSync(soulPath) ? await readFile(soulPath, "utf-8") : "";

    return { id: agentId, config, soul };
  }

  async saveBuiltinAgent(
    agentId: string,
    config: Record<string, unknown>,
    soul: string,
  ): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
    await writeFile(join(dir, "soul.md"), soul, "utf-8");
  }

  async createBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (existsSync(dir)) throw new Error(`Agent '${agentId}' already exists`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), JSON.stringify({ name: agentId }, null, 2) + "\n");
    await writeFile(join(dir, "soul.md"), "");
  }

  async deleteBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (!existsSync(dir)) return;
    await rm(dir, { recursive: true });
  }

  async listGlobalSkills(): Promise<SkillManifest[]> {
    const dir = this.skillsSrcDir;
    if (!existsSync(dir)) return [];

    const results: SkillManifest[] = [];
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry);
      if (!statSync(entryPath).isDirectory()) continue;

      const manifestPath = join(entryPath, "manifest.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (manifest.name) {
          results.push({
            name: manifest.name,
            description: manifest.description || "",
            version: manifest.version,
            author: manifest.author,
          });
        }
      } catch {
        // skip invalid manifests
      }
    }
    return results;
  }

  async installSkill(sourcePath: string): Promise<{ success: boolean; error?: string }> {
    this.assertDev();

    let sourceDir: string;
    let tempDir: string | null = null;

    if (sourcePath.endsWith(".zip")) {
      tempDir = join(tmpdir(), `slime-skill-${Date.now()}`);
      try {
        execSync(`unzip -o "${sourcePath}" -d "${tempDir}"`);
      } catch {
        return { success: false, error: "Failed to extract zip" };
      }
      // Find the manifest - could be in root or a subdirectory
      const entries = readdirSync(tempDir);
      if (existsSync(join(tempDir, "manifest.json"))) {
        sourceDir = tempDir;
      } else {
        const subdir = entries.find(
          (e) =>
            statSync(join(tempDir!, e)).isDirectory() &&
            existsSync(join(tempDir!, e, "manifest.json")),
        );
        if (!subdir) {
          await rm(tempDir, { recursive: true });
          return { success: false, error: "No manifest.json found in zip" };
        }
        sourceDir = join(tempDir, subdir);
      }
    } else {
      sourceDir = sourcePath;
    }

    const manifestPath = join(sourceDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      if (tempDir) await rm(tempDir, { recursive: true });
      return { success: false, error: "No manifest.json found" };
    }

    let manifest: { name?: string };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      if (tempDir) await rm(tempDir, { recursive: true });
      return { success: false, error: "Invalid manifest.json" };
    }

    if (!manifest.name) {
      if (tempDir) await rm(tempDir, { recursive: true });
      return { success: false, error: "manifest.json missing name field" };
    }

    const destDir = join(this.skillsSrcDir, manifest.name);
    await mkdir(this.skillsSrcDir, { recursive: true });
    await cp(sourceDir, destDir, { recursive: true });

    if (tempDir) await rm(tempDir, { recursive: true });
    return { success: true };
  }

  async uninstallSkill(skillName: string): Promise<void> {
    this.assertDev();
    const dir = join(this.skillsSrcDir, skillName);
    if (!existsSync(dir)) return;
    await rm(dir, { recursive: true });
  }

  async listAvailableTools(): Promise<string[]> {
    return [
      "read",
      "write",
      "edit",
      "exec",
      "list_dir",
      "ask_user",
      "open_url",
      "evolution_start",
      "evolution_plan",
      "evolution_complete",
      "browser_navigate",
      "browser_screenshot",
      "browser_click",
      "browser_type",
      "browser_scroll",
      "browser_select",
      "browser_hover",
      "browser_close",
      "browser_wait",
      "web_fetch",
      "skill",
      "subagent",
    ];
  }

  async listAvailableCliCommands(): Promise<string[]> {
    return ["help", "logs", "task"];
  }
}
