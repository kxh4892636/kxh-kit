import { expect, test } from "vitest";
import {
  currentPlatform,
  platformFor,
  SUPPORTED_PLATFORMS,
  UNSUPPORTED_PLATFORM_MESSAGE,
} from "./current.js";
// 平台选择在任意平台都可测：只按平台名选择适配器，不读取系统进程表。
test("按平台选择适配器并复用同一实例", (): void => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const selected = platformFor(platform);
    expect(platformFor(platform)).toBe(selected);
    expect(typeof selected.snapshot).toBe("function");
    expect(typeof selected.terminate).toBe("function");
  }
  // macOS 接到 BSD ps 适配器：同一平台名返回同一实例（适配器每次构造都是新对象）。
  const darwin = platformFor("darwin");
  expect(platformFor("darwin")).toBe(darwin);
  // 当前平台与缓存返回同一实例；不在支持列表内的平台必须报可读错误。
  if ((SUPPORTED_PLATFORMS as readonly string[]).includes(process.platform)) {
    expect(platformFor(process.platform)).toBe(currentPlatform());
    expect(currentPlatform()).toBe(currentPlatform());
  } else {
    expect((): unknown => currentPlatform()).toThrow(
      UNSUPPORTED_PLATFORM_MESSAGE(process.platform),
    );
  }
});
test("未知平台给出可读错误", (): void => {
  for (const platform of ["freebsd", "aix", "android", "linux-x64", "sunos"])
    expect((): unknown => platformFor(platform)).toThrow(UNSUPPORTED_PLATFORM_MESSAGE(platform));
  expect((): unknown => platformFor("freebsd")).toThrow(/unsupported platform: freebsd/);
  expect(UNSUPPORTED_PLATFORM_MESSAGE("freebsd")).toMatch(/win32, linux, darwin/);
});
