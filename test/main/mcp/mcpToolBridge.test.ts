import { describe, it, expect } from "vitest";

function serverNameToPrefix(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

describe("serverNameToPrefix", () => {
  it('should convert "GitHub" to "github"', () => {
    expect(serverNameToPrefix("GitHub")).toBe("github");
  });

  it('should convert "My Files" to "my_files"', () => {
    expect(serverNameToPrefix("My Files")).toBe("my_files");
  });

  it("should handle special characters", () => {
    expect(serverNameToPrefix("Test@#$Server")).toBe("test_server");
  });

  it("should handle leading/trailing underscores", () => {
    expect(serverNameToPrefix("_test_")).toBe("test");
  });
});
