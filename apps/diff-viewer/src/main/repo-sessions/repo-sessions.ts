// 按仓库 keyed 的多 parser 会话管理 (issue 04): 每个已激活仓库一个会话
// (GitDiffParser + 激活对比 + 评论基线选择 + generated 状态缓存)。
// 取代 03 的单 parser 整体替换语义: 切换聚焦仓库不再丢弃其他仓库的对比状态,
// 多仓库文件树依赖各会话的激活对比同时可取。
import { createHash } from "crypto";
import { resolve } from "path";

import type { DiffSelection, GeneratedStatusResponse } from "../../types/diff.js";
import { GitDiffParser } from "../git-diff.js";
import { resolveInitialSelection } from "../initial-selection.js";

export interface RepoSession {
  // 已 resolve 绝对路径, 同时是会话 key
  repoPath: string;
  parser: GitDiffParser;
  // 供 client 按仓库隔离评论/已读状态 ( sha256(repoPath) )
  repositoryId: string;
  // 该仓库的激活对比: /api/diff 解析成功后更新, 切换仓库不重置
  currentSelection: DiffSelection;
  // 评论会话基线选择 (随 /api/diff 响应的 resolved commitish 更新)
  currentCommentSelection: DiffSelection;
  generatedStatusCache: Map<string, { value: GeneratedStatusResponse; expiresAt: number }>;
}

export type RepoSessionLookup = { ok: true; session: RepoSession } | { ok: false; error: string };

export interface RepoSessionManager {
  // repoPath 省略时返回当前聚焦会话: 无 repo 参数的 /api/* 请求 (fork client 的
  // line-count/blob/generated-status 等) 落到聚焦仓库; 指定路径只查不改聚焦
  resolveForRequest: (repoPath?: string) => RepoSessionLookup;
  // 幂等激活: 已存在会话仅移动聚焦指针 (不重置其激活对比); 新仓库创建会话并解析默认对比
  activate: (repoPath: string) => Promise<RepoSessionLookup>;
}

export interface RepoSessionManagerOptions {
  repoPath: string;
  parser: GitDiffParser;
  initialSelection: DiffSelection;
}

const computeRepositoryId = (repoPath: string): string =>
  createHash("sha256").update(resolve(repoPath)).digest("hex");

const createSession = (
  repoPath: string,
  parser: GitDiffParser,
  selection: DiffSelection,
): RepoSession => ({
  repoPath,
  parser,
  repositoryId: computeRepositoryId(repoPath),
  currentSelection: selection,
  currentCommentSelection: selection,
  generatedStatusCache: new Map(),
});

export const createRepoSessionManager = (
  options: RepoSessionManagerOptions,
): RepoSessionManager => {
  const sessions = new Map<string, RepoSession>();
  const initialPath = resolve(options.repoPath);
  sessions.set(initialPath, createSession(initialPath, options.parser, options.initialSelection));
  let focusedPath = initialPath;

  const resolveForRequest = (repoPath?: string): RepoSessionLookup => {
    const key = repoPath === undefined ? focusedPath : resolve(repoPath);
    const session = sessions.get(key);
    if (!session) {
      return { ok: false, error: `Repository not activated: ${repoPath}` };
    }
    return { ok: true, session };
  };

  const activate = async (repoPath: string): Promise<RepoSessionLookup> => {
    const key = resolve(repoPath);
    const existing = sessions.get(key);
    if (existing) {
      focusedPath = key;
      return { ok: true, session: existing };
    }

    const parser = new GitDiffParser(key);
    let initialSelection: DiffSelection;
    try {
      initialSelection = await resolveInitialSelection(parser);
    } catch {
      return { ok: false, error: `Not a git repository: ${repoPath}` };
    }

    const session = createSession(key, parser, initialSelection);
    sessions.set(key, session);
    focusedPath = key;
    return { ok: true, session };
  };

  return { resolveForRequest, activate };
};
