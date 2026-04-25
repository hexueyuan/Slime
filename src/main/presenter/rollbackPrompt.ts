import type { EvolutionArchive, EvolutionDependency } from "@shared/types/evolution";

export function buildRollbackPrompt(
  archive: EvolutionArchive,
  deps: EvolutionDependency[],
): string {
  const lines: string[] = [];

  lines.push("# Rollback Task");
  lines.push("");
  lines.push(
    "You are performing a ROLLBACK — NOT a new evolution. Do NOT call evolution_start, evolution_plan, or evolution_complete.",
  );
  lines.push("");
  lines.push("## Target Evolution to Revert");
  lines.push(`- Tag: ${archive.tag}`);
  lines.push(`- Request: ${archive.request}`);
  lines.push(`- Summary: ${archive.summary}`);
  lines.push("");

  if (archive.semanticSummary) {
    lines.push("## Rollback Instructions");
    lines.push(archive.semanticSummary);
    lines.push("");
  }

  lines.push("## Changed Files");
  for (const f of archive.changedFiles) {
    lines.push(`- ${f}`);
  }
  lines.push("");

  if (deps.length > 0) {
    lines.push("## ⚠️ Dependent Evolutions (preserve these changes!)");
    for (const dep of deps) {
      lines.push(`- **${dep.tag}**: ${dep.summary}`);
      lines.push(`  Overlapping files: ${dep.overlappingFiles.join(", ")}`);
    }
    lines.push("");
    lines.push(
      "When reverting, carefully preserve changes from the dependent evolutions listed above.",
    );
    lines.push("");
  }

  lines.push("## Workflow");
  lines.push("1. Read each changed file to understand current state");
  lines.push("2. Remove or revert changes introduced by the target evolution");
  lines.push(
    "3. If a file was newly added by this evolution and no other evolution depends on it, delete it",
  );
  lines.push("4. Run `pnpm run typecheck` to verify");
  lines.push("5. If typecheck fails, analyze and fix errors");
  lines.push(
    "6. When typecheck passes, your task is complete — just output a summary of what was reverted",
  );

  return lines.join("\n");
}
