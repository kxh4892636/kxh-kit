import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const alias = {
  "@": fileURLToPath(new URL("./client", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
};

export default defineConfig({
  test: {
    environment: "node",
    include: ["client/**/*.test.ts", "server/**/*.test.ts", "shared/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "client/app/store/**/*.ts",
        "client/app/lib/**/*.ts",
        "client/app/api/**/*.ts",
        "client/app/playback/prefetch.ts",
        "server/**/*.ts",
        "shared/**/*.ts",
      ],
      exclude: ["**/*.test.*", "server/main.ts", "server/server.ts"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
    resolve: { alias },
  },
});
