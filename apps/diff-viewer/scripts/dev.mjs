// 开发编排: tsc watch 编译 main/preload + vite dev server 提供 renderer + electron。
// 仓库路径等参数原样透传给 electron, 例如: pnpm dev D:/some/repo
import { spawn } from "node:child_process";

import electronPath from "electron";
import { createServer } from "vite";

const passthroughArgs = process.argv.slice(2);
const children = [];

const shutdown = (code) => {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// 1. main/preload 先全量编译一次, 再挂 watch 增量编译
await new Promise((resolvePromise, rejectPromise) => {
  const initial = spawn("tsc", ["-p", "tsconfig.main.json"], { stdio: "inherit", shell: true });
  initial.on("exit", (code) =>
    code === 0 ? resolvePromise() : rejectPromise(new Error(`tsc exited with code ${code}`)),
  );
});
children.push(
  spawn("tsc", ["-p", "tsconfig.main.json", "-w", "--preserveWatchOutput"], {
    stdio: "inherit",
    shell: true,
  }),
);

// 2. renderer dev server (端口见 vite.config.ts, strictPort)
const server = await createServer();
await server.listen();
children.push({ kill: () => server.close() });

// 3. 启动 Electron 指向 dev server; electron npm 包默认导出二进制路径
const electron = spawn(electronPath, [".", ...passthroughArgs], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:5173" },
});
electron.on("close", (code) => shutdown(code ?? 0));
