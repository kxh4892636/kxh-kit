import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    entry: ["src/index.ts", "src/redirect.tsx"],
    exports: true,
    deps: {
      neverBundle: ["@docusaurus/Head", "react", "react/jsx-runtime"],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
