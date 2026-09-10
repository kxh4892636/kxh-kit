import { test } from "vitest";
// 平台条件：真实 PowerShell、命名管道与 %LOCALAPPDATA% 只在 win32 可用；
// POSIX 上的等价用例由对应适配器测试承担。集中一处，避免各测试文件自行复制判定。
export const onWindows = process.platform === "win32" ? test : test.skip;
