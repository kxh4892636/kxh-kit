import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    // .agents 已列在 fmt/lint ignorePatterns 中；整目录新增时，绝对路径串加引号后会超过 Windows 8191 上限。
    "!**/.agents/**": "vp check --fix",
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
