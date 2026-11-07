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
  test: {
    // `.worktrees/*` 是 worker 现场（整份仓库副本）：从仓库根跑测试会把现场里的测试也扫进来，
    // 报的是「现场里 cwd 不对」这类假红（`Can't find meta/_journal.json` 等）。
    // 验收口径是 `cd packages/pi-toolkit && vp test --run`；这里再把现场排除，根目录跑也不假红。
    // Vitest 的 `exclude` 是**覆盖**语义，所以它自己的默认项要一并列上。
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "**/.worktrees/**",
    ],
  },
});
