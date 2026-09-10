import { linuxPlatform } from "./linux.js";
import { windowsPlatform } from "./windows.js";
import type { ProcessSource } from "./processes.js";
// 文案按已接入的平台适配器生成。接入新平台还要同步 paths.ts 的数据目录与 versions.ts 的 npm 候选。
export const SUPPORTED_PLATFORMS = ["win32", "linux"] as const;
export const UNSUPPORTED_PLATFORM_MESSAGE = (platform: string): string =>
  "dsh-alive supports " + SUPPORTED_PLATFORMS.join(", ") + "; unsupported platform: " + platform;
// 平台选择只在这里发生；其余模块面向 ProcessSource 接口，不感知 process.platform。
// 按平台名缓存，使同一进程内的选择结果稳定可比较，也避免重复构造适配器。
const cache = new Map<string, ProcessSource>();
export const platformFor = (platform: string = process.platform): ProcessSource => {
  const cached = cache.get(platform);
  if (cached) return cached;
  const selected =
    platform === "win32" ? windowsPlatform() : platform === "linux" ? linuxPlatform() : undefined;
  if (!selected) throw new Error(UNSUPPORTED_PLATFORM_MESSAGE(platform));
  cache.set(platform, selected);
  return selected;
};
export const currentPlatform = (): ProcessSource => platformFor();
