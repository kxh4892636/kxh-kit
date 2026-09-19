---
id: ed4ad2b2-1276-4a26-b71d-6b788c06e04c
---

# VSCode 调试配置

## 如何直接调试当前打开的 TypeScript 文件？

- 前置: 安装 `tsx`;
- 配置: 把 `runtimeExecutable` 指向项目内的 `tsx`, `program` 指向 `${file}`;

```json
{
  "type": "node",
  "request": "launch",
  "name": "core",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/tsx",
  "program": "${file}",
  "cwd": "${fileDirname}",
  "internalConsoleOptions": "openOnSessionStart",
  "skipFiles": ["<node_internals>/**", "node_modules/**"]
}
```

- 效果: 无需预编译, 直接运行并断点调试当前文件;

## 如何调试当前打开的测试文件？

- 配置: 以 `vitest.mjs` 作为入口, 用 `args` 传入 `run` 与当前文件;

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Current Test File",
  "autoAttachChildProcesses": true,
  "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
  "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
  "args": ["run", "${relativeFile}"],
  "smartStep": true,
  "console": "integratedTerminal"
}
```

- `${relativeFile}`: 当前打开文件相对工作区的路径, 只跑这一个测试文件;
- `autoAttachChildProcesses`: 自动附加到测试运行派生的子进程;
