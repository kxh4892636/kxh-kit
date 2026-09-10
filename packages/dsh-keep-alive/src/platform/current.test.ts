import { expect, test } from "vitest";
import { currentPlatform, platformFor, UNSUPPORTED_PLATFORM_MESSAGE } from "./current.js";
// 平台选择在任意平台都可测：只按平台名选择适配器，不读取系统进程表。
test("按平台选择适配器并复用同一实例", (): void => {
  const windows = platformFor("win32");
  expect(platformFor("win32")).toBe(windows);
  expect(typeof windows.snapshot).toBe("function");
  expect(typeof windows.terminate).toBe("function");
  // 已接入的平台（当前是 win32）选择结果稳定；尚未接入的平台按未知平台报错。
  if (process.platform === "win32" || process.platform === "linux")
    expect(platformFor(process.platform)).toBe(currentPlatform());
  else
    expect((): unknown => currentPlatform()).toThrow(
      UNSUPPORTED_PLATFORM_MESSAGE(process.platform),
    );
});
test("未知平台给出可读错误", (): void => {
  for (const platform of ["freebsd", "aix", "android", "linux-x64"])
    expect((): unknown => platformFor(platform)).toThrow(UNSUPPORTED_PLATFORM_MESSAGE(platform));
  expect((): unknown => platformFor("freebsd")).toThrow(/unsupported platform: freebsd/);
});
