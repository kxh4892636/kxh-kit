import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Electron 启动与首个渲染较慢, 留足超时; e2e 串行跑避免多实例互相干扰
  timeout: 120_000,
  workers: 1,
  retries: 0,
});
