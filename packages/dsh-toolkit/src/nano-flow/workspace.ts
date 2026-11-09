/**
 * 解析当前工作区根目录。
 *
 * 三处调用点（预设挂载、工具执行、Note 面板）原先各自实现一遍「配置优先、其次会话 cwd」，
 * 语义漂移过一次（面板没退回进程目录）；统一到这里。
 * @param options - 配置覆盖、会话 cwd 与兜底值。
 * @returns 工作区根；三者都缺时返回 undefined。
 */
export const resolveWorkspace = (options: {
  readonly configured?: string | undefined;
  readonly sessionCwd?: string | undefined;
  readonly fallback?: string | undefined;
}): string | undefined => {
  if (options.configured !== undefined && options.configured !== "") return options.configured;
  if (options.sessionCwd !== undefined && options.sessionCwd !== "") return options.sessionCwd;
  return options.fallback;
};
