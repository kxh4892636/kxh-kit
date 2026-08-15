// 简化的初始对比: 有未提交改动则展示 工作区 vs HEAD, 否则展示最近一次 commit 的 diff。
// 完整的默认对比 (当前分支与远程默认分支的三点对比) 归后续 issue。
import { simpleGit } from "simple-git";

import type { DiffSelection } from "../types/diff.js";

export const resolveInitialSelection = async (repoPath: string): Promise<DiffSelection> => {
  const git = simpleGit(repoPath);
  // 非 git 仓库会在此抛错, 由调用方决定兜底行为
  const status = await git.status();

  if (status.files.length > 0) {
    return { baseCommitish: "HEAD", targetCommitish: "." };
  }

  try {
    await git.revparse(["HEAD^"]);
    return { baseCommitish: "HEAD^", targetCommitish: "HEAD" };
  } catch {
    // 单 commit 仓库没有父提交: 退化为 工作区 vs HEAD (通常为空白 diff)
    return { baseCommitish: "HEAD", targetCommitish: "." };
  }
};
