import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts 为薄壳（进程接线），逻辑在 cli.ts 中由 cli.spec.ts 覆盖。
      exclude: ["src/**/*.spec.ts", "src/**/*.d.ts", "src/main.ts"],
      excludeAfterRemap: true,
      reporter: ["text", "json", "html"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
