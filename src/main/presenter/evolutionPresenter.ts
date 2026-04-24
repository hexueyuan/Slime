import type { IEvolutionPresenter } from "@shared/types/presenters";
import type {
  EvolutionStage,
  EvolutionStatus,
  EvolutionPlan,
  EvolutionNode,
} from "@shared/types/evolution";
import type { GitPresenter } from "./gitPresenter";
import type { ConfigPresenter } from "./configPresenter";
import { EVOLUTION_EVENTS } from "@shared/events";
import { eventBus } from "@/eventbus";
import { logger, paths } from "@/utils";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { app } from "electron";

const CHANGELOG_FILE = "CHANGELOG.slime.md";

export class EvolutionPresenter implements IEvolutionPresenter {
  private stage: EvolutionStage = "idle";
  private description?: string;
  private plan?: EvolutionPlan;
  private startCommit?: string;

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

  startEvolution(description: string): boolean {
    if (this.stage !== "idle") return false;
    this.description = description;
    this.setStage("discuss");
    this.git.getCurrentCommit().then((ref) => {
      this.startCommit = ref;
    });
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
    if (this.stage === "idle") return false;
    if ((this.stage === "coding" || this.stage === "applying") && this.startCommit) {
      await this.git.rollbackToRef(this.startCommit);
    }
    this.reset();
    logger.info("Evolution cancelled");
    return true;
  }

  async rollback(tag: string): Promise<boolean> {
    if (this.stage !== "idle") return false;
    const result = await this.git.rollbackToRef(tag);
    if (result) {
      eventBus.sendToRenderer(EVOLUTION_EVENTS.STAGE_CHANGED, "idle");
      logger.info("Rolled back to", { tag });
    }
    return result;
  }

  async getHistory(): Promise<EvolutionNode[]> {
    const tags = await this.git.listTags("egg-*");
    return tags.map((tag, i) => ({
      id: tag,
      tag,
      description: tag,
      request: "",
      changes: [],
      createdAt: "",
      gitRef: tag,
      parent: tags[i + 1],
    }));
  }

  restart(): void {
    if (app.isPackaged) {
      logger.warn("Packaged mode restart not yet implemented");
      return;
    }
    logger.info("Restart requested (dev mode)");
    eventBus.sendToRenderer(EVOLUTION_EVENTS.COMPLETED, "restart-needed", "");
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
