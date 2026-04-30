import { describe, it, expect } from "vitest";
import { MCPClient } from "@/mcp/mcpClient";

describe("MCPClient", () => {
  it("should start disconnected", () => {
    const client = new MCPClient();
    expect(client.getStatus()).toBe("disconnected");
  });

  it("should return null error and config when not connected", () => {
    const client = new MCPClient();
    expect(client.getError()).toBeNull();
    expect(client.getConfig()).toBeNull();
  });
});
