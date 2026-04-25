import type { IEvolutionPresenter } from "@shared/types/presenters";
import type {
  EvolutionStage,
  EvolutionStatus,
  EvolutionPlan,
  EvolutionNode,
  EvolutionArchive,
  EvolutionDependency,
} from "@shared/types/evolution";
import type { GitPresenter } from "./gitPresenter";
import type { ConfigPresenter } from "./configPresenter";
import { EVOLUTION_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger, paths } from "@/utils";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { app } from "electron";

const CHANGELOG_FILE = "CHANGELOG.slime.md";

export class EvolutionPresenter implements IEvolutionPresenter {
  private stage: EvolutionStage = "idle";
  private description?: string;
  private plan?: EvolutionPlan;
  private startCommit?: string;
  rollbackInProgress = false;

  constructor(
    private git: GitPresenter,
    private config: ConfigPresenter,
  ) {}

  getStatus(): EvolutionStatus {
    return {
      stage: this.stage,
      description: this.description,
      plan: this.plan,
      startCommit: this.startCommit,
    };
  }

  async startEvolution(description: string): Promise<boolean> {
    if (this.stage !== "idle" || this.rollbackInProgress) return false;
    this.description = description;
    this.setStage("discuss");
    this.startCommit = await this.git.getCurrentCommit();
    return true;
  }

  submitPlan(plan: EvolutionPlan): boolean {
    if (this.stage !== "discuss") return false;
    this.plan = plan;
    this.setStage("coding");
    return true;
  }

  async completeEvolution(
    summary: string,
    semanticSummary?: string,
  ): Promise<{ success: boolean; error?: string; tag?: string }> {
    if (this.stage !== "coding") return { success: false, error: "Not in coding stage" };
    this.setStage("applying");

    try {
      const changedFiles = this.startCommit ? await this.git.getChangedFiles(this.startCommit) : [];
      const tagName = await this.nextTagName();
      await this.appendChangelog(tagName, summary, changedFiles);
      const committed = await this.git.addAndCommit(`evo: ${summary}`);
      if (!committed) throw new Error("git commit failed");
      const tagged = await this.git.tag(tagName, summary);
      if (!tagged) throw new Error("git tag failed");

      // Generate archive
      const endCommit = await this.git.getCurrentCommit();
      const tags = await this.git.listTags("egg-*");
      const parentTag = tags.find((t) => t !== tagName) || null;
      await this.writeArchive({
        version: 1,
        tag: tagName,
        parentTag,
        request: this.description || "",
        summary,
        plan: this.plan || { scope: [], changes: [] },
        createdAt: new Date().toISOString(),
        startCommit: this.startCommit || "",
        endCommit,
        changedFiles,
        semanticSummary: semanticSummary || "",
        status: "active",
      });

      this.reset();
      eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, tagName, summary);
      logger.info("Evolution completed", { tag: tagName, summary });
      return { success: true, tag: tagName };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Evolution apply failed", { error });
      this.setStage("coding");
      return { success: false, error };
    }
  }

  async cancel(): Promise<boolean> {
    if ((this.stage === "coding" || this.stage === "applying") && this.startCommit) {
      await this.git.rollbackToRef(this.startCommit);
    }
    if (this.stage !== "idle") {
      this.reset();
    }
    logger.info("Evolution cancelled");
    return true;
  }

  async getHistory(): Promise<EvolutionNode[]> {
    const tags = await this.git.listTags("egg-*");
    const changelog = await this.parseChangelog();
    const nodes: EvolutionNode[] = [];
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const entry = changelog.get(tag);
      const archive = await this.readArchive(tag);
      nodes.push({
        id: tag,
        tag,
        description: entry?.summary || tag,
        request: entry?.request || "",
        changes: entry?.changes || [],
        createdAt: entry?.date || "",
        gitRef: tag,
        parent: tags[i + 1],
        archived: archive?.status === "archived",
      });
    }
    return nodes;
  }

  restart(): void {
    logger.info("Restart requested");
    app.relaunch();
    app.quit();
  }

  // --- Archive CRUD ---

  private archiveDir(): string {
    return join(paths.effectiveProjectRoot, ".slime", "evolutions");
  }

  async writeArchive(archive: EvolutionArchive): Promise<void> {
    const dir = this.archiveDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${archive.tag}.json`), JSON.stringify(archive, null, 2), "utf-8");
  }

  async readArchive(tag: string): Promise<EvolutionArchive | null> {
    try {
      const content = await readFile(join(this.archiveDir(), `${tag}.json`), "utf-8");
      return JSON.parse(content) as EvolutionArchive;
    } catch {
      return null;
    }
  }

  async listArchives(): Promise<EvolutionArchive[]> {
    try {
      const files = await readdir(this.archiveDir());
      const archives: EvolutionArchive[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = await readFile(join(this.archiveDir(), file), "utf-8");
          archives.push(JSON.parse(content) as EvolutionArchive);
        } catch {
          /* skip corrupt files */
        }
      }
      return archives;
    } catch {
      return [];
    }
  }

  async checkDependencies(tag: string): Promise<{ dependencies: EvolutionDependency[] }> {
    const target = await this.readArchive(tag);
    if (!target) return { dependencies: [] };
    const all = await this.listArchives();
    const dependencies: EvolutionDependency[] = [];
    for (const a of all) {
      if (a.tag === tag || a.status !== "active") continue;
      if (a.createdAt <= target.createdAt) continue;
      const overlapping = a.changedFiles.filter((f) => target.changedFiles.includes(f));
      if (overlapping.length > 0) {
        dependencies.push({ tag: a.tag, summary: a.summary, overlappingFiles: overlapping });
      }
    }
    return { dependencies };
  }

  async archiveEvolution(tag: string, reason: string): Promise<void> {
    const archive = await this.readArchive(tag);
    if (!archive) return;
    archive.status = "archived";
    archive.archivedAt = new Date().toISOString();
    archive.archivedReason = reason;
    await this.writeArchive(archive);
  }

  private setStage(stage: EvolutionStage): void {
    this.stage = stage;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, stage);
  }

  private reset(): void {
    this.stage = "idle";
    this.description = undefined;
    this.plan = undefined;
    this.startCommit = undefined;
    eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle");
  }

  private async parseChangelog(): Promise<
    Map<string, { request: string; summary: string; date: string; changes: string[] }>
  > {
    const result = new Map<
      string,
      { request: string; summary: string; date: string; changes: string[] }
    >();
    let content: string;
    try {
      content = (await readFile(
        join(paths.effectiveProjectRoot, CHANGELOG_FILE),
        "utf-8",
      )) as string;
    } catch {
      return result;
    }

    const sections = content.split("## [");
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const headerMatch = section.match(/^(.+?)\]\s*-\s*(\S+)/);
      if (!headerMatch) continue;
      const tag = headerMatch[1];
      const date = headerMatch[2];

      const requestMatch = section.match(/- Request:\s*"(.*)"/);
      const summaryMatch = section.match(/- Summary:\s*(.*)/);

      const request = requestMatch ? requestMatch[1] : "";
      const summary = summaryMatch ? summaryMatch[1].trim() : "";

      const changes: string[] = [];
      const changesIdx = section.indexOf("### Changes");
      if (changesIdx !== -1) {
        const changesBlock = section.slice(changesIdx);
        const lines = changesBlock.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("- ") && !trimmed.includes("(no file changes recorded)")) {
            changes.push(trimmed.slice(2));
          }
        }
      }

      result.set(tag, { request, summary, date, changes });
    }
    return result;
  }

  private async nextTagName(): Promise<string> {
    const user = ((await this.config.get("evolution.user")) as string) || "dev";
    const tags = await this.git.listTags("egg-v0.1-*");
    const maxSeq = tags.reduce((max, t) => {
      const m = t.match(/\.(\d+)$/);
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    return `egg-v0.1-${user}.${maxSeq + 1}`;
  }

  private async appendChangelog(
    tag: string,
    summary: string,
    changedFiles: string[],
  ): Promise<void> {
    const filePath = join(paths.effectiveProjectRoot, CHANGELOG_FILE);
    let existing: string;
    try {
      const content = await readFile(filePath, "utf-8");
      existing = typeof content === "string" ? content : "# Slime Evolution Changelog\n\n";
    } catch {
      existing = "# Slime Evolution Changelog\n\n";
    }

    const date = new Date().toISOString().split("T")[0];
    const changesSection =
      changedFiles.length > 0
        ? changedFiles.map((f) => `- ${f}`).join("\n")
        : "- (no file changes recorded)";

    const entry =
      `## [${tag}] - ${date}\n\n` +
      `### Evolution\n` +
      `- Request: "${this.description || ""}"\n` +
      `- Summary: ${summary}\n` +
      `- Status: Success\n\n` +
      `### Changes\n` +
      `${changesSection}\n\n---\n\n`;

    const headerEnd = existing.indexOf("\n\n");
    if (headerEnd > -1) {
      const header = existing.slice(0, headerEnd + 2);
      const rest = existing.slice(headerEnd + 2);
      await writeFile(filePath, header + entry + rest, "utf-8");
    } else {
      await writeFile(filePath, existing + "\n" + entry, "utf-8");
    }
  }
}
