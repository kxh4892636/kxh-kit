import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: true,
    entry: ["src/remark.ts", "src/client/index.ts"],
    exports: true,
    deps: {
      resolveDepSubpath: true,
      neverBundle: ["react", "react/jsx-runtime", "react-dom", "@docusaurus/useBaseUrl"],
    },
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {},
});
