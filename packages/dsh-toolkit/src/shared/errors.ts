/**
 * 把任意抛出物收敛成一行可读消息。
 *
 * 各模块原先各自实现同一件事；错误消息会出现在日志、工具返回值与路由响应里，
 * 统一后措辞才一致。
 * @param error - 捕获到的值。
 * @returns `Error.message`，非 Error 时退回 `String(error)`。
 */
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
