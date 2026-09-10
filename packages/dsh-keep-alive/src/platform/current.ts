import { windowsPlatform } from "./windows.js";
import type { ProcessSource } from "./processes.js";
// 文案按已接入的平台适配器生成，避免声称支持尚未接入的平台。
export const UNSUPPORTED_PLATFORM_MESSAGE = (platform: string): string =>
  "dsh-alive supports win32 only; unsupported platform: " + platform;
// 平台选择只在这里发生；其余模块面向 ProcessSource 接口，不感知 process.platform。
// 按平台名缓存，使同一进程内的选择结果稳定可比较，也避免重复构造适配器。
const cache = new Map<string, ProcessSource>();
export const platformFor = (platform: string = process.platform): ProcessSource => {
  const cached = cache.get(platform);
  if (cached) return cached;
  if (platform !== "win32") throw new Error(UNSUPPORTED_PLATFORM_MESSAGE(platform));
  const selected = windowsPlatform();
  cache.set(platform, selected);
  return selected;
};
export const currentPlatform = (): ProcessSource => platformFor();
