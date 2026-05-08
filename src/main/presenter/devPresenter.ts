import { app } from "electron";
import { join } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { paths } from "@/utils";
import { readFile, writeFile, mkdir, rm, cp } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { eventBus } from "@/eventbus";
import { AGENT_EVENTS } from "@shared/events";
import { agentRegistry } from "@/agents/agentRegistry";
import type { IDevPresenter, BuiltinAgentInfo, SkillManifest } from "@shared/types/presenters";

export class DevPresenter implements IDevPresenter {
  private get agentsSrcDir(): string {
    return join(process.cwd(), "resources", "agents");
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

      const configPath = join(entryPath, "AGENT.json");
      if (!existsSync(configPath)) continue;

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const promptPath = join(entryPath, "PROMPT.md");
      const prompt = existsSync(promptPath) ? readFileSync(promptPath, "utf-8") : "";

      results.push({ id: entry, config, prompt });
    }
    return results;
  }

  async getBuiltinAgent(agentId: string): Promise<BuiltinAgentInfo | null> {
    const dir = join(this.agentsSrcDir, agentId);
    if (!existsSync(dir)) return null;

    const configPath = join(dir, "AGENT.json");
    if (!existsSync(configPath)) return null;

    const config = JSON.parse(await readFile(configPath, "utf-8"));
    const promptPath = join(dir, "PROMPT.md");
    const prompt = existsSync(promptPath) ? await readFile(promptPath, "utf-8") : "";

    return { id: agentId, config, prompt };
  }

  async saveBuiltinAgent(
    agentId: string,
    config: Record<string, unknown>,
    prompt: string,
  ): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "AGENT.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
    await writeFile(join(dir, "PROMPT.md"), prompt, "utf-8");
    agentRegistry.load();
    eventBus.sendToRenderer(AGENT_EVENTS.CHANGED);
  }

  async createBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (existsSync(dir)) throw new Error(`Agent '${agentId}' already exists`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "AGENT.json"), JSON.stringify({ name: agentId }, null, 2) + "\n");
    await writeFile(join(dir, "PROMPT.md"), "");
  }

  async deleteBuiltinAgent(agentId: string): Promise<void> {
    this.assertDev();
    const dir = join(this.agentsSrcDir, agentId);
    if (!existsSync(dir)) return;
    await rm(dir, { recursive: true });
  }

  private get builtinSkillsDir(): string {
    return paths.builtinSkillsDir;
  }

  async listGlobalSkills(): Promise<SkillManifest[]> {
    const results: SkillManifest[] = [];

    // Scan builtin skills (resources/skills/, uses SKILL.md frontmatter)
    const builtinDir = this.builtinSkillsDir;
    if (existsSync(builtinDir)) {
      for (const entry of readdirSync(builtinDir)) {
        const entryPath = join(builtinDir, entry);
        if (!statSync(entryPath).isDirectory()) continue;
        const skillMd = join(entryPath, "SKILL.md");
        if (!existsSync(skillMd)) continue;
        try {
          const content = readFileSync(skillMd, "utf-8");
          const fm = this.parseSkillFrontmatter(content);
          if (fm) {
            results.push({
              name: fm.name,
              description: fm.description,
              source: "builtin",
            });
          }
        } catch {
          // skip
        }
      }
    }

    // Scan installed skills (src/main/skills/, uses manifest.json)
    const dir = this.skillsSrcDir;
    if (existsSync(dir)) {
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
              source: "installed",
            });
          }
        } catch {
          // skip
        }
      }
    }

    // Scan market skills (~/.slime/slime-market/skills/, uses SKILL.md frontmatter)
    const marketDir = paths.marketSkillsDir;
    if (existsSync(marketDir)) {
      for (const entry of readdirSync(marketDir)) {
        const entryPath = join(marketDir, entry);
        if (!statSync(entryPath).isDirectory()) continue;
        const skillMd = join(entryPath, "SKILL.md");
        if (!existsSync(skillMd)) continue;
        try {
          const content = readFileSync(skillMd, "utf-8");
          const fm = this.parseSkillFrontmatter(content);
          if (fm) {
            results.push({
              name: fm.name,
              description: fm.description,
              source: "market",
            });
          }
        } catch {
          // skip
        }
      }
    }

    return results;
  }

  private parseSkillFrontmatter(content: string): { name: string; description: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const raw = match[1];
    let name = "";
    let description = "";
    for (const line of raw.split("\n")) {
      const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
      if (kv) {
        if (kv[1] === "name") name = kv[2].trim();
        if (kv[1] === "description") description = kv[2].trim();
      }
    }
    if (!name) return null;
    return { name, description };
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

  async getSkillContent(
    skillName: string,
    source: "builtin" | "installed" | "market",
  ): Promise<string | null> {
    let dir: string;
    if (source === "builtin") {
      dir = this.builtinSkillsDir;
    } else if (source === "market") {
      dir = paths.marketSkillsDir;
    } else {
      dir = this.skillsSrcDir;
    }
    const skillDir = join(dir, skillName);
    const skillMd = join(skillDir, "SKILL.md");
    if (existsSync(skillMd)) return readFileSync(skillMd, "utf-8");
    // fallback: try manifest-based skill with index.md
    const indexMd = join(skillDir, "index.md");
    if (existsSync(indexMd)) return readFileSync(indexMd, "utf-8");
    return null;
  }

  async saveSkillContent(
    skillName: string,
    source: "builtin" | "installed" | "market",
    content: string,
  ): Promise<void> {
    this.assertDev();
    let dir: string;
    if (source === "builtin") {
      dir = this.builtinSkillsDir;
    } else if (source === "market") {
      dir = paths.marketSkillsDir;
    } else {
      dir = this.skillsSrcDir;
    }
    const skillDir = join(dir, skillName);
    const skillMd = join(skillDir, "SKILL.md");
    await writeFile(skillMd, content, "utf-8");
  }

  async uninstallBuiltinSkill(skillName: string): Promise<void> {
    this.assertDev();
    const dir = join(this.builtinSkillsDir, skillName);
    if (!existsSync(dir)) return;
    await rm(dir, { recursive: true });
  }

  async uninstallMarketSkill(skillName: string): Promise<void> {
    const dir = join(paths.marketSkillsDir, skillName);
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
      "preview",
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
