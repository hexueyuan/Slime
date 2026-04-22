// @ts-check
import { readFileSync } from "node:fs";

const msgPath = process.argv[2] || ".git/COMMIT_EDITMSG";
const msg = readFileSync(msgPath, "utf-8").trim();

const commitRE = /^(revert: )?(feat|fix|docs|style|refactor|perf|test|chore)(\(.+\))?: .{1,50}/;

if (!commitRE.test(msg)) {
  console.error(
    [
      "",
      "ERROR: invalid commit message format.",
      "",
      "Examples:",
      "  feat(renderer): add evolution center page",
      "  fix(main): handle window close event",
      "",
      "Format: type(scope?): subject (max 50 chars)",
      "Types: feat|fix|docs|style|refactor|perf|test|chore",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
