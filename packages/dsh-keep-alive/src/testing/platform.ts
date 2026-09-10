import { test } from "vitest";
// 平台条件集中一处，避免各测试文件自行复制判定。跳过（而非静默通过）保留可见性。
export const onWindows = process.platform === "win32" ? test : test.skip;
export const onLinux = process.platform === "linux" ? test : test.skip;
export const onPosix = process.platform === "win32" ? test.skip : test;
