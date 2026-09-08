import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["AGENTS.md", ".agents/**"],
  },
  lint: {
    ignorePatterns: ["AGENTS.md", ".agents/**"],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // dsh-keep-alive 约定不使用 class；只约束该包，避免影响其它业务域。
        files: ["packages/dsh-keep-alive/src/**"],
        rules: { "max-classes-per-file": ["error", 0] },
      },
    ],
  },
  run: {
    cache: true,
  },
});
