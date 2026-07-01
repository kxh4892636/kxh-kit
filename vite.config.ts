import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      ".agents/**",
      "packages/plugin-meta-kit/**",
      "packages/plugin-wiki-kit/**",
      "packages/plugin-loop-kit/**",
    ],
  },
  lint: {
    ignorePatterns: [
      ".agents/**",
      "packages/plugin-meta-kit/**",
      "packages/plugin-wiki-kit/**",
      "packages/plugin-loop-kit/**",
    ],
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
