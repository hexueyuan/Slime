import { tool } from "ai";
import { z } from "zod";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { ToolSet } from "ai";
import type { FilePresenter } from "./filePresenter";
import type { WorkflowPresenter } from "./workflowPresenter";
import { logger, paths } from "@/utils";

const execAsync = promisify(execCb);

export class ToolPresenter {
  constructor(
    private filePresenter: FilePresenter,
    private workflowPresenter: WorkflowPresenter,
  ) {}

  getToolSet(): ToolSet {
    return {
      read: tool({
        description: "Read a file. Path is relative to project root.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          offset: z.number().int().min(0).optional().describe("Start line (0-based)"),
          limit: z.number().int().positive().optional().describe("Number of lines to read"),
        }),
      }),
      write: tool({
        description: "Write/create a file (full overwrite). Auto-creates directories.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          content: z.string().describe("Complete file content"),
        }),
      }),
      edit: tool({
        description:
          "Find and replace text in a file. old_text must match exactly once in the file.",
        parameters: z.object({
          path: z.string().describe("File path relative to project root"),
          old_text: z.string().describe("Exact text to find (must be unique)"),
          new_text: z.string().describe("Replacement text"),
        }),
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
      }),
      workflow_query: tool({
        description: "Query the current workflow and all step statuses.",
        parameters: z.object({}),
      }),
      step_query: tool({
        description: "Query a single workflow step by ID.",
        parameters: z.object({
          step_id: z.string().describe("Step ID"),
        }),
      }),
      step_update: tool({
        description: "Update a workflow step status.",
        parameters: z.object({
          step_id: z.string().describe("Step ID"),
          status: z.enum(["in_progress", "completed", "skipped", "failed"]).describe("New status"),
        }),
      }),
    };
  }

  async callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.debug("tool:call", { sessionId, name, args });

    switch (name) {
      case "read":
        return this.filePresenter.read(
          args.path as string,
          args.offset as number | undefined,
          args.limit as number | undefined,
        );
      case "write":
        return this.filePresenter.write(args.path as string, args.content as string);
      case "edit":
        return this.filePresenter.edit(
          args.path as string,
          args.old_text as string,
          args.new_text as string,
        );
      case "exec": {
        const cwd = paths.projectRoot;
        const timeout = (args.timeout_ms as number) || 30000;
        try {
          const { stdout, stderr } = await execAsync(args.command as string, {
            cwd,
            timeout,
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
      }
      case "workflow_edit":
        return this.workflowPresenter.editWorkflow(
          sessionId,
          args.steps as Array<{ id: string; title: string; description?: string }>,
        );
      case "workflow_query":
        return this.workflowPresenter.queryWorkflow(sessionId);
      case "step_query":
        return this.workflowPresenter.queryStep(sessionId, args.step_id as string);
      case "step_update":
        return this.workflowPresenter.updateStep(
          sessionId,
          args.step_id as string,
          args.status as any,
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
