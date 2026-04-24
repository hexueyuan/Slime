import type { IGitPresenter } from "@shared/types/presenters";
import { spawn } from "child_process";
import { logger } from "@/utils";

export class GitPresenter implements IGitPresenter {
  constructor(private cwd: string) {}

  async tag(name: string, message: string): Promise<boolean> {
    const { exitCode } = await this.run("git", ["tag", "-a", name, "-m", message]);
    return exitCode === 0;
  }

  async listTags(pattern?: string): Promise<string[]> {
    const args = ["tag", "-l"];
    if (pattern) args.push(pattern);
    args.push("--sort=-creatordate");
    const { stdout, exitCode } = await this.run("git", args);
    if (exitCode !== 0) return [];
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async getCurrentCommit(): Promise<string> {
    const { stdout } = await this.run("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  }

  async rollbackToRef(ref: string): Promise<boolean> {
    const checkout = await this.run("git", ["checkout", ref, "--", "."]);
    if (checkout.exitCode !== 0) return false;
    const commit = await this.run("git", ["commit", "-m", `rollback to ${ref}`]);
    return commit.exitCode === 0;
  }

  async addAndCommit(message: string, files?: string[]): Promise<boolean> {
    const addArgs = files && files.length > 0 ? ["add", ...files] : ["add", "-A"];
    const add = await this.run("git", addArgs);
    if (add.exitCode !== 0) return false;
    const commit = await this.run("git", ["commit", "-m", message]);
    return commit.exitCode === 0;
  }

  async getChangedFiles(fromRef: string, toRef?: string): Promise<string[]> {
    const range = toRef ? `${fromRef}..${toRef}` : `${fromRef}..HEAD`;
    const { stdout, exitCode } = await this.run("git", ["diff", "--name-only", range]);
    if (exitCode !== 0) return [];
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  private run(
    cmd: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd: this.cwd });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on("close", (code) => {
        if (code !== 0) logger.warn("git command failed", { cmd, args, stderr, code });
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
      proc.on("error", (err) => {
        logger.error("git spawn error", { cmd, args, error: err.message });
        resolve({ stdout, stderr, exitCode: 1 });
      });
    });
  }
}
