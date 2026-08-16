// 默认对比 (issue 02): 当前分支与远程默认分支的三点对比, 打开仓库即有意义的 diff。
// 降级链: detached HEAD 或无远程默认分支 → 未提交改动 vs HEAD。
import type { DiffSelection } from "../types/diff.js";

import type { DiffParser } from "./diff-parser.js";

export const resolveInitialSelection = async (parser: DiffParser): Promise<DiffSelection> => {
  // 非 git 仓库会在此抛错, 由调用方决定兜底行为
  const currentBranch = await parser.getCurrentBranch();

  // detached HEAD 不再探测远程, 直接降级
  const originDefaultBranch = currentBranch === null ? null : await parser.getOriginDefaultBranch();

  if (currentBranch !== null && originDefaultBranch !== null) {
    return {
      baseCommitish: originDefaultBranch,
      targetCommitish: currentBranch,
      baseMode: "merge-base",
    };
  }

  return { baseCommitish: "HEAD", targetCommitish: "." };
};
