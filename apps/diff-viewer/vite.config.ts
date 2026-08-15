import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/client",
  publicDir: "../../public",
  // 生产模式经 file:// 加载, 资源引用必须是相对路径
  base: "./",
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
  },
  css: {
    postcss: "./postcss.config.js",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
