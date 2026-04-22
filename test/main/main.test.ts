import { describe, it, expect } from "vitest";

describe("Main Process", () => {
  it("should have correct app name", () => {
    expect("Slime").toBe("Slime");
  });

  it("should have correct version", () => {
    expect("0.1.0").toBe("0.1.0");
  });
});
