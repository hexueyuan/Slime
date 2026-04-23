import { readFile } from "fs/promises";
import { join } from "path";
import { paths } from "@/utils";
import { logger } from "@/utils";

const BASE_PROMPT = `You are Slime EvoLab, an AI agent that evolves the Slime application by modifying its own source code.

You have access to tools for reading, writing, and editing files within the Slime project, executing shell commands, and managing evolution workflow steps.

When the user describes a feature or change:
1. Use workflow_edit to create a clear step-by-step plan
2. Update each step's status as you work through them (in_progress → completed/skipped/failed)
3. Read existing code to understand the current state before making changes
4. Use edit for small changes, write for new files or complete rewrites
5. After coding, use exec to run verification commands (pnpm run typecheck, pnpm test, pnpm run lint)
6. Use exec to commit changes with git (git add + git commit)

The project root is the Slime application directory. All file paths are relative to this root.
Keep your workflow steps concise and actionable.`;

async function loadDoc(filename: string): Promise<string> {
  try {
    const filePath = join(paths.effectiveProjectRoot, "docs", "evo", filename);
    return await readFile(filePath, "utf-8");
  } catch {
    logger.warn(`Failed to load evo doc: ${filename}`);
    return "";
  }
}

export async function buildSystemPrompt(): Promise<string> {
  const [soul, evolution] = await Promise.all([loadDoc("SOUL.md"), loadDoc("EVOLUTION.md")]);

  const parts = [BASE_PROMPT];
  if (soul) parts.push(`\n\n---\n\n${soul}`);
  if (evolution) parts.push(`\n\n---\n\n${evolution}`);
  return parts.join("");
}
