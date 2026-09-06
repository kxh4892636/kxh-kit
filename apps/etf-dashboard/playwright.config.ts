import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
process.env.ETF_E2E_RUN_ID ??= randomUUID();
const port = process.env.ETF_E2E_FRONTEND_PORT ?? "15173";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "e2e/test-results/" + process.env.ETF_E2E_RUN_ID,
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:" + port,
    channel: "chrome",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm run dev --host 127.0.0.1 --port " + port + " --strictPort",
    url: "http://127.0.0.1:" + port,
    reuseExistingServer: false,
    timeout: 120000,
    env: { VITE_API_BASE_URL: "http://127.0.0.1:" + (process.env.ETF_E2E_BACKEND_PORT ?? "18181") },
  },
});
