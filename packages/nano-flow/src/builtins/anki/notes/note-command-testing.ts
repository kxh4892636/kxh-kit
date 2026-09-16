import { vi } from "vitest";
import type { Logger } from "../logger";
import { scriptedPort } from "../testing/test-harness";

// note 命令边界测试共用的夹具: 按调用序号应答的假端口与日志替身。
// 两份 spec 共用, 因此单独成模块(notes/ 已到 13 个文件上限, 不再拆分)。
export const portFor = (
  handler: (action: string, invocation: number) => unknown,
): ReturnType<typeof scriptedPort> =>
  scriptedPort(
    (action: string, _params, invocation: number): unknown => handler(action, invocation),
    [],
  );

export const logger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
});
