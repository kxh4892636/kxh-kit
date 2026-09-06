import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/test-support/**"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", environment: "node", include: ["src/**/*.test.ts"] },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          testTimeout: 15000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: "chrome" } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
