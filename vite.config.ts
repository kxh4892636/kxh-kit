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
  },
  run: {
    cache: true,
  },
});
