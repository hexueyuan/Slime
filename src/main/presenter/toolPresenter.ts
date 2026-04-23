import { tool } from "ai";
import { z } from "zod";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { FilePresenter } from "./filePresenter";
import type { WorkflowPresenter } from "./workflowPresenter";
import { logger, paths } from "@/utils";

const execAsync = promisify(execCb);

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private workflowPresenter: WorkflowPresenter,
  ) {}

  getToolSet(sessionId: string) {
    return {
      read: tool({
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
      write: tool({
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
      edit: tool({
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
      exec: tool({
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
          const cwd = paths.projectRoot;
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              timeout: timeout_ms,
              maxBuffer: 1024 * 1024,
            });
            return { stdout, stderr, exit_code: 0 };
          } catch (err: any) {
            return {
              stdout: err.stdout || "",
              stderr: err.stderr || err.message,
              exit_code: err.code ?? 1,
            };
          }
        },
      }),
      workflow_edit: tool({
        description: "Create or overwrite the evolution workflow. All steps start as pending.",
        parameters: z.object({
          steps: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().optional(),
              }),
            )
            .min(1)
            .describe("Ordered list of workflow steps"),
        }),
        execute: async ({ steps }) => {
          return this.workflowPresenter.editWorkflow(sessionId, steps);
        },
      }),
      workflow_query: tool({
        description: "Query the current workflow and all step statuses.",
        parameters: z.object({}),
        execute: async () => {
          return this.workflowPresenter.queryWorkflow(sessionId) ?? "No workflow found";
        },
      }),
      step_query: tool({
        description: "Query a single workflow step by ID.",
        parameters: z.object({
          step_id: z.string().describe("Step ID"),
        }),
        execute: async ({ step_id }) => {
          return this.workflowPresenter.queryStep(sessionId, step_id) ?? "Step not found";
        },
      }),
      step_update: tool({
        description: "Update a workflow step status.",
        parameters: z.object({
          step_id: z.string().describe("Step ID"),
          status: z.enum(["in_progress", "completed", "skipped", "failed"]).describe("New status"),
        }),
        execute: async ({ step_id, status }) => {
          return this.workflowPresenter.updateStep(sessionId, step_id, status) ?? "Step not found";
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
