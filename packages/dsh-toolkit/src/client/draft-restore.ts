/**
 * 撤回后待回填的草稿：宿主把 fork 出来的会话当成一次普通导航，composer 在导航完成后才挂载，
 * 因此不能沿「打开会话 → 立刻写草稿」的时序假定成功。
 * 这里在模块里挂一小份待办，由**新会话自己的撤回按钮**（与 composer 同时挂载）取走并写进输入框。
 */

interface PendingDraft {
  readonly prompt: string;
  readonly at: number;
}

const pending = new Map<string, PendingDraft>();

/** 登记一份待回填草稿；同一会话以最后一次为准。 */
export const rememberDraft = (sessionId: string, prompt: string): void => {
  if (prompt === "") return;
  pending.set(sessionId, { prompt, at: Date.now() });
};

/** 取走待回填草稿（取到即消费）。 */
export const takeDraft = (sessionId: string): string | undefined => {
  const entry = pending.get(sessionId);
  if (entry === undefined) return undefined;
  pending.delete(sessionId);
  return entry.prompt;
};

/** 读而不消费：兜底路径判重用。 */
export const peekDraft = (sessionId: string): string | undefined => {
  return pending.get(sessionId)?.prompt;
};

/** 放弃某会话的待回填（兜底路径已经写入时调用）。 */
export const dropDraft = (sessionId: string): void => {
  pending.delete(sessionId);
};

/** 清空（插件卸载/测试使用）。 */
export const resetDrafts = (): void => {
  pending.clear();
};
