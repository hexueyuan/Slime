import { defineConfig } from "@playwright/test";

process.env.NO_PROXY = ["127.0.0.1", "localhost", process.env.NO_PROXY].filter(Boolean).join(",");

const useSystemChrome =
  process.env.PW_CHANNEL != null || (process.platform === "darwin" && !process.env.CI);
const e2eURL = process.env.PLAYWRIGHT_E2E_URL ?? "http://127.0.0.1:4178";
const e2eCommand =
  process.env.PLAYWRIGHT_E2E_COMMAND ?? "pnpm exec vite --config vite.e2e.config.ts";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eURL,
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
    ...(useSystemChrome ? { channel: process.env.PW_CHANNEL ?? "chrome" } : {}),
  },
  webServer: {
    command: e2eCommand,
    url: e2eURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
