import { fileURLToPath } from "node:url";
import { playwright } from "vite-plus/test/browser-playwright";
import { defineConfig } from "vite-plus";

const alias = {
  "@": fileURLToPath(new URL("./client", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["client/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
      exclude: ["**/*.test.*", "client/test-support/**"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["client/**/*.test.ts", "server/**/*.test.ts", "shared/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          include: ["client/**/*.test.tsx"],
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
