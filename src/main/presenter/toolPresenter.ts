import { tool } from "ai";
import { z } from "zod";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { FilePresenter } from "./filePresenter";
import type { ContentPresenter } from "./contentPresenter";
import type { EvolutionPresenter } from "./evolutionPresenter";
import { logger, paths } from "@/utils";

const execAsync = promisify(execCb);

const EXEC_BLOCKED_PATTERNS: [RegExp, string][] = [
  [/(?:^|\s)\//, "absolute paths are not allowed"],
  [/rm\s+(-[^\s]*\s+)*\.git/, "cannot delete .git"],
  [/rm\s+(-[^\s]*\s+)*node_modules/, "cannot delete node_modules"],
  [/curl\s.*\|\s*(?:sh|bash)/, "piping curl to shell is not allowed"],
  [/wget\b/, "wget is not allowed"],
];

function validateCommand(command: string): void {
  for (const [pattern, reason] of EXEC_BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked: ${reason} — "${command}"`);
    }
  }
}

// Helper: AI SDK v6 uses 'inputSchema' instead of 'parameters'
function createTool(config: {
  description: string;
  parameters: z.ZodObject<any>;
  execute: (...args: any[]) => Promise<any>;
}) {
  return tool({
    description: config.description,
    inputSchema: config.parameters,
    execute: config.execute,
  } as any);
}

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private contentPresenter: ContentPresenter,
    private evolutionPresenter: EvolutionPresenter,
  ) {}

  getToolSet(sessionId: string) {
    return {
      read: createTool({
        description: "Read a file. Path is relative to project root.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          offset: z.number().int().min(0).optional().describe("Start line (0-based)"),
          limit: z.number().int().positive().optional().describe("Number of lines to read"),
        }),
        execute: async ({ path, offset, limit }) => {
          return this.filePresenter.read(path, offset, limit);
        },
      }),
      write: createTool({
        description: "Write/create a file (full overwrite). Auto-creates directories.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          content: z.string().describe("Complete file content"),
        }),
        execute: async ({ path, content }) => {
          const ok = await this.filePresenter.write(path, content);
          return ok ? `Written to ${path}` : `Failed to write ${path}`;
        },
      }),
      edit: createTool({
        description:
          "Find and replace text in a file. old_text must match exactly once in the file.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          old_text: z.string().describe("Exact text to find (must be unique)"),
          new_text: z.string().describe("Replacement text"),
        }),
        execute: async ({ path, old_text, new_text }) => {
          const ok = await this.filePresenter.edit(path, old_text, new_text);
          return ok ? `Edited ${path}` : `Failed to edit ${path}`;
        },
      }),
      exec: createTool({
        description: "Execute a shell command in the project root directory.",
        parameters: z.object({
          command: z.string().min(1).describe("Shell command to execute"),
          timeout_ms: z
            .number()
            .int()
            .positive()
            .optional()
            .default(30000)
            .describe("Timeout in milliseconds"),
        }),
        execute: async ({ command, timeout_ms }) => {
          validateCommand(command);
          const cwd = paths.effectiveProjectRoot;
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout: timeout_ms,
              maxBuffer: 1024 * 1024,
            });
            return { stdout, stderr, exit_code: 0 };
          } catch (err: unknown) {
            const e = err as { stdout?: string; stderr?: string; message?: string; code?: number };
            return {
              stdout: e.stdout || "",
              stderr: e.stderr || e.message || "",
              exit_code: e.code ?? 1,
            };
          }
        },
      }),
      ask_user: createTool({
        description:
          "Ask the user a question with options. Renders in the function panel. Optionally include an HTML file for preview above options.",
        parameters: z.object({
          question: z.string().describe("The question to ask"),
          options: z
            .array(
              z.object({
                label: z.string(),
                value: z.string(),
                recommended: z.boolean().optional(),
              }),
            )
            .min(1)
            .describe("Choice options"),
          multiple: z.boolean().optional().default(false).describe("Allow multiple selection"),
          html_file: z
            .string()
            .optional()
            .describe("Optional HTML file path (relative) to show above options"),
        }),
        execute: async () => {
          throw new Error("ask_user should be handled by AgentPresenter");
        },
      }),
      open: createTool({
        description:
          "Open a file in the preview panel. Supports .md (Markdown), .html (HTML preview), and other text files.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
        }),
        execute: async ({ path }) => {
          await this.contentPresenter.openFile(sessionId, path);
          return `Opened ${path} in preview panel`;
        },
      }),
      evolution_start: createTool({
        description: "Start an evolution. Transitions to discuss stage. Must be in idle stage.",
        parameters: z.object({
          description: z.string().describe("User's evolution request"),
        }),
        execute: async ({ description }) => {
          const ok = await this.evolutionPresenter.startEvolution(description);
          return ok
            ? "Evolution started. You are now in discuss stage. Clarify requirements with ask_user before calling evolution_plan."
            : "Cannot start: another evolution is in progress.";
        },
      }),
      evolution_plan: createTool({
        description:
          "Submit the evolution plan. Transitions from discuss to coding stage. Must be in discuss stage.",
        parameters: z.object({
          scope: z.array(z.string()).describe("Files/modules affected"),
          changes: z.array(z.string()).describe("What will be changed"),
          risks: z.array(z.string()).optional().describe("Potential risks"),
        }),
        execute: async ({ scope, changes, risks }) => {
          const ok = this.evolutionPresenter.submitPlan({ scope, changes, risks });
          return ok
            ? "Plan submitted. You are now in coding stage. Implement the changes and call evolution_complete when done."
            : "Cannot submit plan: not in discuss stage.";
        },
      }),
      evolution_complete: createTool({
        description:
          "Complete the evolution. Triggers apply flow (CHANGELOG, commit, tag). Must be in coding stage.",
        parameters: z.object({
          summary: z.string().describe("One-line summary of what was evolved"),
        }),
        execute: async ({ summary }) => {
          const result = await this.evolutionPresenter.completeEvolution(summary);
          if (result.success) {
            return `Evolution complete! Tagged as ${result.tag}. Restart to see changes.`;
          }
          return `Apply failed: ${result.error}. Fix the issue and try again.`;
        },
      }),
    };
  }

  async callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.debug("tool:call", { sessionId, name, args });
    const tools = this.getToolSet(sessionId);
    const t = tools[name as keyof typeof tools];
    if (!t) throw new Error(`Unknown tool: ${name}`);
    return (t as any).execute(args, { toolCallId: "manual", messages: [] });
  }
}
