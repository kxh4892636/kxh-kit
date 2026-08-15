import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

const resolveFromRoot = (relativePath: string) => path.resolve(process.cwd(), relativePath);
const virtualViteEnvModuleId = "\0virtual:@vite/env";
const viteEnvStubPath = resolveFromRoot("vitest.env.stub.ts");
const viteEnvClientPathPattern = /\/vite\/dist\/client\/env\.mjs$/;

// 两层测试项目: node 环境覆盖主进程纯函数路由与数据层; happy-dom 环境覆盖
// fork client 组件与 api-bridge (继承 difit 的测试模式, 测试与实现同级)。
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/main/**/*.test.ts", "src/utils/**/*.test.ts", "src/types/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "client",
          environment: "happy-dom",
          globals: true,
          include: [
            "src/client/**/*.test.ts",
            "src/client/**/*.test.tsx",
            "src/api-bridge/**/*.test.ts",
          ],
          setupFiles: ["./vitest.setup.ts"],
          pool: "forks",
        },
      },
    ],
  },
  server: {
    fs: {
      strict: false,
      allow: [resolveFromRoot("."), resolveFromRoot("node_modules")],
    },
  },
  plugins: [
    {
      name: "vitest-virtual-vite-env",
      enforce: "pre",
      resolveId(id) {
        if (id === "/@vite/env" || id === "@vite/env") {
          return virtualViteEnvModuleId;
        }
        return null;
      },
      load(id) {
        if (id === virtualViteEnvModuleId || viteEnvClientPathPattern.test(id)) {
          return fs.readFileSync(viteEnvStubPath, "utf8");
        }
        return null;
      },
    },
  ],
});
