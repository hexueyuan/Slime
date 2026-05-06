import { z } from "zod";
import { exec as execCb } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { promisify } from "util";
import type { FilePresenter } from "./filePresenter";
import type { ContentPresenter } from "./contentPresenter";
import type { EvolutionPresenter } from "./evolutionPresenter";
import { logger, paths } from "@/utils";
import { app } from "electron";
import type { BrowserSession } from "@/browser/browserSession";
import type { MCPToolBridge } from "./mcpToolBridge";
import type { SkillPresenter } from "./skillPresenter";
import {
  makeBrowserNavigateTool,
  makeBrowserScreenshotTool,
  makeBrowserSnapshotTool,
  makeBrowserClickTool,
  makeBrowserTypeTool,
  makeBrowserScrollTool,
  makeBrowserEvaluateTool,
  makeBrowserWaitTool,
  makeBrowserCloseTool,
  makeWebFetchTool,
} from "@/browser/browserTools";

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
    if (reason === "absolute paths are not allowed") {
      if (pattern.test(command) && !/slime-cli\b/.test(command)) {
        throw new Error(`Command blocked: ${reason} — "${command}"`);
      }
      continue;
    }
    if (pattern.test(command)) {
      throw new Error(`Command blocked: ${reason} — "${command}"`);
    }
  }
}

function createTool(config: {
  description: string;
  parameters: z.ZodObject<any>;
  execute: (...args: any[]) => Promise<any>;
}) {
  return {
    description: config.description,
    inputSchema: config.parameters,
    execute: config.execute,
  };
}

export class ToolPresenter {
  private sessionContexts = new Map<string, { agentId: string; agentType: string }>();

  constructor(
    private filePresenter: FilePresenter,
    private contentPresenter: ContentPresenter,
    private evolutionPresenter: EvolutionPresenter,
    private browserSession: BrowserSession,
    private mcpBridge?: MCPToolBridge,
    private skillPresenter?: SkillPresenter,
  ) {}

  setSessionContext(sessionId: string, agentId: string, agentType: string): void {
    this.sessionContexts.set(sessionId, { agentId, agentType });
  }

  async getToolSet(sessionId: string) {
    const tools: Record<string, any> = {
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
          const rawCwd = paths.effectiveProjectRoot;
          const cwd = existsSync(rawCwd) ? rawCwd : homedir();
          const sessionCtx = this.sessionContexts.get(sessionId);
          const slimeEnv = sessionCtx
            ? {
                SLIME_ROLE: sessionCtx.agentType === "builtin" ? "builtin-agent" : "external-agent",
                SLIME_USER_ID: sessionCtx.agentId,
                SLIME_DATA_DIR: app.getPath("userData"),
              }
            : {};
          const fallbackPath = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd,
              shell: "/bin/sh",
              timeout: timeout_ms,
              maxBuffer: 1024 * 1024,
              env: {
                PATH: fallbackPath,
                ...process.env,
                ...slimeEnv,
              },
            });
            logger.debug("tool:exec:ok", {
              command,
              stdout: stdout.slice(0, 200),
              stderr: stderr.slice(0, 200),
            });
            return { stdout, stderr, exit_code: 0 };
          } catch (err: unknown) {
            const e = err as {
              stdout?: string;
              stderr?: string;
              message?: string;
              code?: number;
              killed?: boolean;
              signal?: string;
            };
            logger.error("tool:exec:error", {
              command,
              stdout: e.stdout,
              stderr: e.stderr,
              message: e.message,
              code: e.code,
              killed: e.killed,
              signal: e.signal,
            });
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
          const ok = await this.evolutionPresenter.startEvolution(description, sessionId);
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
          rollback_description: z
            .string()
            .describe(
              "Description of how to rollback: new files, modified modules, new dependencies, and how to safely revert",
            ),
        }),
        execute: async ({ summary, rollback_description }) => {
          const verification = await this.evolutionPresenter.runBuildVerification();
          if (!verification.success) {
            return `Build verification failed. Fix the issues and call evolution_complete again:\n${verification.error}`;
          }
          const result = await this.evolutionPresenter.completeEvolution(
            summary,
            rollback_description,
          );
          if (result.success) {
            return `Evolution complete! Tagged as ${result.tag}. Restart to see changes.`;
          }
          return `Apply failed: ${result.error}. Fix the issue and try again.`;
        },
      }),
      browser_navigate: createTool(makeBrowserNavigateTool(this.browserSession)),
      browser_screenshot: createTool(makeBrowserScreenshotTool(this.browserSession)),
      browser_snapshot: createTool(makeBrowserSnapshotTool(this.browserSession)),
      browser_click: createTool(makeBrowserClickTool(this.browserSession)),
      browser_type: createTool(makeBrowserTypeTool(this.browserSession)),
      browser_scroll: createTool(makeBrowserScrollTool(this.browserSession)),
      browser_evaluate: createTool(makeBrowserEvaluateTool(this.browserSession)),
      browser_wait: createTool(makeBrowserWaitTool(this.browserSession)),
      browser_close: createTool(makeBrowserCloseTool(this.browserSession)),
      web_fetch: createTool(makeWebFetchTool()),
      Skill: createTool({
        description: `Execute a skill within the main conversation.

When users ask you to perform tasks, check if any of the available skills match. Skills provide specialized capabilities and domain knowledge.

How to invoke:
- Set \`skill\` to the exact name of an available skill.

Important:
- Available skills are listed in a <system-reminder> tag in the system prompt.
- Only invoke a skill that appears in the available skills list.
- When a skill matches the user's request, invoke BEFORE generating any response.
- NEVER mention a skill without actually calling this tool.
- Do not invoke a skill that is already running.`,
        parameters: z.object({
          skill: z.string().describe("Exact name of the skill to invoke"),
          args: z.string().optional().describe("Optional arguments for the skill"),
        }),
        execute: async ({ skill }: { skill: string; args?: string }) => {
          if (!this.skillPresenter) {
            return "Skills are not available.";
          }
          try {
            const content = this.skillPresenter.loadSkill(skill);
            return `<system-reminder>\n${content}\n</system-reminder>`;
          } catch {
            return `Skill "${skill}" not found.`;
          }
        },
      }),
    };

    // Merge MCP tools
    if (this.mcpBridge) {
      const mcpTools = await this.mcpBridge.getMcpTools(sessionId);
      Object.assign(tools, mcpTools);
    }

    return tools;
  }

  async callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.debug("tool:call", { sessionId, name, args });
    if (name.startsWith("mcp_") && this.mcpBridge) {
      return this.mcpBridge.executeTool(name, args);
    }
    const tools = await this.getToolSet(sessionId);
    const t = tools[name as keyof typeof tools];
    if (!t) throw new Error(`Unknown tool: ${name}`);
    return (t as any).execute(args, { toolCallId: "manual", messages: [] });
  }
}
