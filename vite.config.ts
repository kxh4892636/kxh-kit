import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      ".agents/**",
      "packages/meta-kit/**",
      "packages/wiki-kit/**",
      "packages/code-kit/**",
    ],
  },
  lint: {
    ignorePatterns: [
      ".agents/**",
      "packages/meta-kit/**",
      "packages/wiki-kit/**",
      "packages/code-kit/**",
    ],
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
