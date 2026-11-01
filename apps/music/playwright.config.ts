import { defineConfig } from "@playwright/test";

const port = "5299";
const musicRoot = process.env["MUSIC_ROOT"] ?? "C:\\Users\\kxh\\Music\\musopen-flac";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node dist/server/main.js",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: port,
      MUSIC_ROOT: musicRoot,
      TRACKS_FILE: "./server/data/tracks.json",
      WAVES_ROOT: "./server/data/waves",
      CLIENT_DIR: "./dist/client",
    },
  },
});
