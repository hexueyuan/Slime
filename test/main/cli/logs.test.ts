import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/cli/utils/logReader", () => ({
  readLogs: vi.fn().mockReturnValue(["[INFO]  t1  line1", "[ERROR] t2  line2"]),
  clearLogs: vi.fn().mockReturnValue("/tmp/slime-data/logs/slime-2026-05-05.log"),
}));

import { runLogs } from "../../../src/cli/commands/logs";
import { readLogs, clearLogs } from "../../../src/cli/utils/logReader";
import type { CallerContext } from "../../../src/cli/auth";

const ctx: CallerContext = { role: "builtin-agent", userId: "hal-ai", dataDir: "/tmp/slime-data" };

describe("runLogs", () => {
  let output: string[];
  let exitCode: number | undefined;

  beforeEach(() => {
    output = [];
    exitCode = undefined;
    vi.mocked(readLogs).mockReturnValue(["[INFO]  t1  line1", "[ERROR] t2  line2"]);
    vi.mocked(clearLogs).mockReturnValue("/tmp/slime-data/logs/slime-2026-05-05.log");
    vi.spyOn(process.stdout, "write").mockImplementation((s) => {
      output.push(String(s));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    });
  });

  it("prints all log lines", () => {
    runLogs([], ctx);
    expect(output.join("")).toContain("[INFO]");
    expect(output.join("")).toContain("[ERROR]");
  });

  it("passes key to readLogs", () => {
    runLogs(["--key", "error"], ctx);
    expect(readLogs).toHaveBeenCalledWith(
      "/tmp/slime-data",
      expect.objectContaining({ key: "error" }),
    );
  });

  it("passes tail to readLogs", () => {
    runLogs(["--tail", "10"], ctx);
    expect(readLogs).toHaveBeenCalledWith("/tmp/slime-data", expect.objectContaining({ tail: 10 }));
  });

  it("passes head to readLogs", () => {
    runLogs(["--head", "5"], ctx);
    expect(readLogs).toHaveBeenCalledWith("/tmp/slime-data", expect.objectContaining({ head: 5 }));
  });

  it("exits with error when --head and --tail both provided", () => {
    expect(() => runLogs(["--head", "5", "--tail", "5"], ctx)).toThrow("exit");
    expect(exitCode).toBe(1);
  });

  it("calls clearLogs and prints path on --clear", () => {
    runLogs(["--clear"], ctx);
    expect(clearLogs).toHaveBeenCalledWith("/tmp/slime-data");
    expect(output.join("")).toContain("Cleared:");
  });

  it("prints no logs message when readLogs returns empty", () => {
    vi.mocked(readLogs).mockReturnValueOnce([]);
    runLogs([], ctx);
    expect(output.join("")).toContain("No logs found for today");
  });
});
