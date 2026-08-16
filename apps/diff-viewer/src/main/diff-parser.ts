// diff 数据层端口 (issue 06): api-router / repo-sessions / initial-selection 只依赖本接口,
// 不关心背后是本地 simple-git (GitDiffParser) 还是 ssh exec (RemoteGitDiffParser)。
// 方法集合 = 路由层与初始对比解析实际用到的最小表面。
import type { DiffResponse, DiffSelection } from "../types/diff.js";

export interface RevisionOptions {
  branches: Array<{ name: string; current: boolean }>;
  commits: Array<{ hash: string; shortHash: string; message: string }>;
  originDefaultBranch?: string;
  resolvedBase?: string;
  resolvedTarget?: string;
}

export interface GeneratedStatus {
  isGenerated: boolean;
  source: "path" | "content";
}

export interface DiffParser {
  parseDiff(
    selection: DiffSelection,
    ignoreWhitespace?: boolean,
    contextLines?: number,
  ): Promise<DiffResponse>;
  getRevisionOptions(currentBase?: string, currentTarget?: string): Promise<RevisionOptions>;
  // 仓库相对路径归一化; 越界/非法输入抛错, 由路由层映射为 400
  normalizeRepositoryRelativePath(filepath: string): string;
  getGeneratedStatus(filepath: string, ref: string): Promise<GeneratedStatus>;
  getLineCount(filepath: string, ref: string): Promise<number>;
  getBlobContent(filepath: string, ref: string): Promise<Buffer>;
  // 当前分支名; detached HEAD 时返回 null (默认对比降级链判断用)
  getCurrentBranch(): Promise<string | null>;
  // 远程默认分支; 没有任何远程分支时返回 null (调用方走降级)
  getOriginDefaultBranch(): Promise<string | null>;
}
