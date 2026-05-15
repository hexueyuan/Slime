import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFiles = new Map<string, string>();

vi.mock("os", () => ({
  homedir: () => "/home/tester",
}));

vi.mock("fs", () => ({
  existsSync: (path: string) => mockFiles.has(path),
  readFileSync: (path: string) => mockFiles.get(path),
}));

describe("getBaseUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockFiles.clear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reads the default config from ~/.slime instead of ~/.slime-dev", async () => {
    process.env.SLIME_DEV_MODE = "1";
    mockFiles.set(
      "/home/tester/.slime/slime.config.json",
      JSON.stringify({ task_server_port: 41111 }),
    );
    mockFiles.set(
      "/home/tester/.slime-dev/slime.config.json",
      JSON.stringify({ task_server_port: 49999 }),
    );

    const { getBaseUrl } = await import("../../../src/cli/utils/baseUrl");

    expect(getBaseUrl()).toBe("http://127.0.0.1:41111");
  });

  it("uses explicit data env config before the default Slime home", async () => {
    process.env.SLIME_USER_DATA_DIR = "/tmp/slime-staging";
    mockFiles.set(
      "/tmp/slime-staging/.slime-home/slime.config.json",
      JSON.stringify({ task_server_port: 42222 }),
    );
    mockFiles.set(
      "/home/tester/.slime/slime.config.json",
      JSON.stringify({ task_server_port: 41111 }),
    );

    const { getBaseUrl } = await import("../../../src/cli/utils/baseUrl");

    expect(getBaseUrl()).toBe("http://127.0.0.1:42222");
  });

  it("keeps SLIME_TASK_PORT as highest priority", async () => {
    process.env.SLIME_TASK_PORT = "43333";
    mockFiles.set(
      "/home/tester/.slime/slime.config.json",
      JSON.stringify({ task_server_port: 41111 }),
    );

    const { getBaseUrl } = await import("../../../src/cli/utils/baseUrl");

    expect(getBaseUrl()).toBe("http://127.0.0.1:43333");
  });
});
