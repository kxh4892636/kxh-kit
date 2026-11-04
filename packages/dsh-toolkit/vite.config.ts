import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

/** 宿主半与客户端半走两份 pack 配置：单次 `vp pack` 会按顺序构建两者。 */
export default defineConfig({
  pack: [
    {
      // 宿主半：node ESM，产物 dist/index.mjs + index.d.mts。
      entry: ["src/index.ts"],
      exports: false,
      deps: {
        // tsdown <0.23 compatibility: resolve external dependency subpaths.
        // Remove to preserve subpath imports as written (the new default).
        // https://tsdown.dev/options/dependencies#deps-resolveDepSubpath
        resolveDepSubpath: true,
      },
    },
    {
      // 客户端半：浏览器 CJS，产物由 scripts/wrap-client.mjs 包成模块载体的形态。
      entry: ["src/client/index.ts"],
      format: ["cjs"],
      platform: "browser",
      outDir: "dist/client",
      dts: false,
      sourcemap: false,
      // 客户端产物必须在宿主宿主半之后构建，且不能清掉它。
      clean: false,
      deps: {
        // react / react-dom / UI 基座由宿主页面的模块表提供：自带一份会拆开 hook 上下文。
        neverBundle: ["react", "react-dom", "@deepseek-ai/dsh-client-ui-primitives"],
      },
    },
  ],
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    // 宿主的 ui-primitives 只存在于浏览器模块表，单测用本地替身渲染组件树。
    alias: {
      "@deepseek-ai/dsh-client-ui-primitives": fileURLToPath(
        new URL("./src/client/test-primitives.ts", import.meta.url),
      ),
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/test-support.ts",
        "src/client/test-primitives.ts",
        "src/client/*.d.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
