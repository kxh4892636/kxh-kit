import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    exports: false,
    deps: {
      // The host owns every @deepseek-ai package; never bundle them.
      neverBundle: [/^@deepseek-ai\//],
    },
  },
  fmt: {},
  test: {
    include: ["src/**/*.test.ts"],
  },
});
