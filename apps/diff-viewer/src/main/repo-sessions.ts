// 按仓库 keyed 的多 parser 会话管理 (issue 04): 每个已激活仓库一个会话
// (GitDiffParser + 激活对比 + 评论基线选择 + generated 状态缓存)。
// 取代 03 的单 parser 整体替换语义: 切换聚焦仓库不再丢弃其他仓库的对比状态,
// 多仓库文件树依赖各会话的激活对比同时可取。
// issue 06: 会话 key 空间扩展到 ssh://user@host[:port]/path 远程仓库键 ——
// 远程键不经本地路径 resolve, 经 createRemoteParser 工厂创建 RemoteGitDiffParser;
// repositoryId = sha256(规范会话键), 评论落盘 (05) 的仓库维度因此天然覆盖远程。
import { createHash } from "crypto";
import { resolve } from "path";

import type { DiffSelection, GeneratedStatusResponse } from "../types/diff.js";

import type { DiffParser } from "./diff-parser.js";
import { GitDiffParser } from "./git-diff.js";
import { resolveInitialSelection } from "./initial-selection.js";
import {
  buildRemoteRepoKey,
  isRemoteRepoKey,
  parseRemoteRepoKey,
  type SshTarget,
} from "./remote/ssh-target.js";

export interface RepoSessionRemote {
  target: SshTarget;
  remotePath: string;
}

export interface RepoSession {
  // 会话 key: 本地为已 resolve 绝对路径, 远程为规范 ssh:// 键
  repoPath: string;
  parser: DiffParser;
  // 供 client 按仓库隔离评论/已读状态 ( sha256(会话 key) )
  repositoryId: string;
  // 该仓库的激活对比: /api/diff 解析成功后更新, 切换仓库不重置
  currentSelection: DiffSelection;
  // 评论会话基线选择 (随 /api/diff 响应的 resolved commitish 更新)
  currentCommentSelection: DiffSelection;
  generatedStatusCache: Map<string, { value: GeneratedStatusResponse; expiresAt: number }>;
  // 远程会话的定位信息 (本地会话为 undefined); 编辑器按钮的 vscode-remote URL 依赖它
  remote?: RepoSessionRemote;
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
  parser: DiffParser;
  initialSelection: DiffSelection;
  // 远程会话工厂 (issue 06): 入参为规范 ssh:// 键; 未提供时远程键激活失败
  createRemoteParser?: (key: string) => DiffParser;
}

// 会话键规范化: 本地路径 resolve; 远程键重组 (校验 + 去尾斜杠)
export const normalizeRepoSessionKey = (key: string): string => {
  if (isRemoteRepoKey(key)) {
    const { target, remotePath } = parseRemoteRepoKey(key);
    return buildRemoteRepoKey(target, remotePath);
  }
  return resolve(key);
};

const computeRepositoryId = (sessionKey: string): string =>
  createHash("sha256").update(sessionKey).digest("hex");

const createSession = (
  repoPath: string,
  parser: DiffParser,
  selection: DiffSelection,
  remote?: RepoSessionRemote,
): RepoSession => ({
  repoPath,
  parser,
  repositoryId: computeRepositoryId(repoPath),
  currentSelection: selection,
  currentCommentSelection: selection,
  generatedStatusCache: new Map(),
  ...(remote === undefined ? {} : { remote }),
});

export const createRepoSessionManager = (
  options: RepoSessionManagerOptions,
): RepoSessionManager => {
  const sessions = new Map<string, RepoSession>();
  const initialPath = normalizeRepoSessionKey(options.repoPath);
  sessions.set(initialPath, createSession(initialPath, options.parser, options.initialSelection));
  let focusedPath = initialPath;

  const resolveForRequest = (repoPath?: string): RepoSessionLookup => {
    let key: string;
    try {
      key = repoPath === undefined ? focusedPath : normalizeRepoSessionKey(repoPath);
    } catch {
      return { ok: false, error: `Invalid repository key: ${repoPath}` };
    }
    const session = sessions.get(key);
    if (!session) {
      return { ok: false, error: `Repository not activated: ${repoPath}` };
    }
    return { ok: true, session };
  };

  const activate = async (repoPath: string): Promise<RepoSessionLookup> => {
    let key: string;
    try {
      key = normalizeRepoSessionKey(repoPath);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Invalid key" };
    }
    const existing = sessions.get(key);
    if (existing) {
      focusedPath = key;
      return { ok: true, session: existing };
    }

    if (isRemoteRepoKey(key)) {
      if (!options.createRemoteParser) {
        return { ok: false, error: `Remote repositories are not available: ${key}` };
      }

      let parser: DiffParser;
      try {
        parser = options.createRemoteParser(key);
      } catch (error) {
        console.error(`Failed to create remote parser for ${key}:`, error);
        return { ok: false, error: error instanceof Error ? error.message : "Invalid remote key" };
      }

      let initialSelection: DiffSelection;
      try {
        initialSelection = await resolveInitialSelection(parser);
      } catch (error) {
        // 远端非 git 仓库与连接/认证失败都走这里; 原始错误信息对用户定位更关键
        console.error(`Failed to open remote repository ${key}:`, error);
        return {
          ok: false,
          error: `Failed to open remote repository: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }

      const session = createSession(key, parser, initialSelection, parseRemoteRepoKey(key));
      sessions.set(key, session);
      focusedPath = key;
      return { ok: true, session };
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
