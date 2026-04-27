import { z } from "zod";
import type { SubagentPresenter } from "../subagentPresenter";

export function createSubagentTool(subagentPresenter: SubagentPresenter, parentSessionId: string) {
  return {
    description:
      "Fork a sub-agent to handle a subtask. Use inherit mode to share parent context, or new mode for a clean start.",
    parameters: z.object({
      mode: z.enum(["inherit", "new"]).describe("inherit: share parent context; new: clean start"),
      prompt: z.string().describe("Task description for the sub-agent"),
    }),
    execute: async ({ mode, prompt }: { mode: "inherit" | "new"; prompt: string }) => {
      return subagentPresenter.fork(parentSessionId, mode, prompt);
    },
  };
}
