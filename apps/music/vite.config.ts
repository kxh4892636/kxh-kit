import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

const backend = process.env["MUSIC_API_ORIGIN"] ?? "http://127.0.0.1:5210";

export default defineConfig({
  root: "client",
  base: process.env["MUSIC_BASE"] ?? "/",
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./client", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/media": { target: backend, changeOrigin: true },
      "/waves": { target: backend, changeOrigin: true },
    },
  },
  build: { outDir: "../dist/client", emptyOutDir: true },
});
