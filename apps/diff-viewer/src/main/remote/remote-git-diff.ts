// 远程仓库的 diff 数据层 (issue 06): 与 GitDiffParser 相同的 DiffParser 端口,
// 但所有 git/POSIX 命令经 CommandExecutor (ssh exec) 在远端执行, 远端假定
// POSIX shell + git 在 PATH。unified diff 文本解析与本地完全共用 (git-text-parse.ts);
// rev/路径参数在 ssh-executor 侧单引号包裹, 本层另以 validateDiffArguments 白名单约束。
import { validateDiffArguments, shortHash, createCommitRangeString } from "../commitish.js";
import { type DiffFile, type DiffResponse, type DiffSelection } from "../../types/diff.js";
import { getMergeBaseTargetRef, normalizeBaseMode } from "../../utils/diffSelection.js";
import { parseGitattributesGeneratedOutput, parseUnifiedDiff } from "../git-text-parse.js";
import { isGeneratedFile } from "../generated-file-check.js";
import type { DiffParser, GeneratedStatus, RevisionOptions } from "../diff-parser.js";

import type { CommandExecutor, ExecResult } from "./executor.js";

const RESOLVED_COMMIT_CACHE_TTL_MS = 5_000;
const GENERATED_HEADER_SCAN_BYTES = 4 * 1024;
const GITATTRIBUTES_CHECK_CHUNK_SIZE = 200;
// 与本地 getBlobContent 一致的 10MB 上限
const BLOB_MAX_BUFFER = 10 * 1024 * 1024;

export class RemoteGitDiffParser implements DiffParser {
  private readonly executor: CommandExecutor;
  private readonly remotePath: string;
  private readonly resolvedCommitCache = new Map<string, { value: string; expiresAt: number }>();

  constructor(executor: CommandExecutor, remotePath: string) {
    this.executor = executor;
    this.remotePath = remotePath;
  }

  // 非零退出即抛错 (带 stderr); 需要判读退出码的调用方用 runGitRaw
  private async runGit(args: readonly string[]): Promise<string> {
    const result = await this.runGitRaw(args);
    if (result.exitCode !== 0) {
      throw new Error(
        `git ${args[0]} failed on remote (exit ${result.exitCode}): ${result.stderr.trim()}`,
      );
    }
    return result.stdout;
  }

  private runGitRaw(args: readonly string[]): Promise<ExecResult<string>> {
    return this.executor.exec("git", args, { cwd: this.remotePath });
  }

  // 远程 POSIX 规则的仓库相对路径归一化: 拒绝空/绝对路径/.. 段;
  // 反斜杠归一为正斜杠 (与本地实现对 client 输入的容忍一致)
  normalizeRepositoryRelativePath(filepath: string): string {
    if (filepath.length === 0) {
      throw new Error("Invalid file path");
    }
    const normalized = filepath.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.split("/").some((segment) => segment === "..")) {
      throw new Error("File path outside repository");
    }
    return normalized;
  }

  private async resolveBaseCommitish(selection: DiffSelection): Promise<string> {
    if (normalizeBaseMode(selection.baseMode) !== "merge-base") {
      return selection.baseCommitish;
    }

    const targetRef = getMergeBaseTargetRef(selection.targetCommitish);
    const mergeBase = await this.runGit(["merge-base", targetRef, selection.baseCommitish]);
    return mergeBase.trim();
  }

  private getGitattributesSourceArgs(ref: string): string[] {
    if (ref === "working" || ref === ".") {
      return [];
    }

    if (ref === "staged") {
      return ["--cached"];
    }

    return ["--source", ref];
  }

  private async getGitattributesGeneratedPaths(
    filepaths: string[],
    ref: string,
  ): Promise<Set<string>> {
    if (filepaths.length === 0) {
      return new Set();
    }

    const generatedPaths = new Set<string>();

    try {
      for (let i = 0; i < filepaths.length; i += GITATTRIBUTES_CHECK_CHUNK_SIZE) {
        const chunk = filepaths.slice(i, i + GITATTRIBUTES_CHECK_CHUNK_SIZE);
        const output = await this.runGit([
          "check-attr",
          "-z",
          ...this.getGitattributesSourceArgs(ref),
          "linguist-generated",
          "--",
          ...chunk,
        ]);

        for (const path of parseGitattributesGeneratedOutput(output)) {
          generatedPaths.add(path);
        }
      }

      return generatedPaths;
    } catch {
      return new Set();
    }
  }

  private async markGitattributesGeneratedFiles(
    files: DiffFile[],
    ref: string,
  ): Promise<DiffFile[]> {
    const candidates = files.filter((file) => !file.isGenerated).map((file) => file.path);
    const generatedPaths = await this.getGitattributesGeneratedPaths(candidates, ref);

    if (generatedPaths.size === 0) {
      return files;
    }

    return files.map((file) =>
      generatedPaths.has(file.path) ? { ...file, isGenerated: true } : file,
    );
  }

  async parseDiff(
    selection: DiffSelection,
    ignoreWhitespace = false,
    contextLines?: number,
  ): Promise<DiffResponse> {
    const { targetCommitish, baseCommitish } = selection;
    const requestedBaseMode =
      normalizeBaseMode(selection.baseMode) === "merge-base" ? "merge-base" : undefined;

    try {
      const validation = validateDiffArguments(targetCommitish, baseCommitish);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const effectiveBaseCommitish = await this.resolveBaseCommitish(selection);
      let resolvedCommit: string;
      let diffArgs: string[];
      let resolvedBaseCommitish = effectiveBaseCommitish;
      let resolvedTargetCommitish = targetCommitish;
      let attributesRef = targetCommitish;

      // Handle target special chars (base is always a regular commit)
      if (targetCommitish === "working") {
        // Show unstaged changes (working vs staged)
        resolvedCommit = "Working Directory (unstaged changes)";
        diffArgs = [];
      } else if (targetCommitish === "staged") {
        // Show staged changes against base commit
        const baseHash = (await this.runGit(["rev-parse", effectiveBaseCommitish])).trim();
        resolvedCommit = `${shortHash(baseHash)} vs Staging Area (staged changes)`;
        resolvedBaseCommitish = shortHash(baseHash);
        diffArgs = ["--cached", effectiveBaseCommitish];
      } else if (targetCommitish === ".") {
        // Show all uncommitted changes against base commit
        const baseHash = (await this.runGit(["rev-parse", effectiveBaseCommitish])).trim();
        resolvedCommit = `${shortHash(baseHash)} vs Working Directory (all uncommitted changes)`;
        resolvedBaseCommitish = shortHash(baseHash);
        diffArgs = [effectiveBaseCommitish];
      } else {
        // Both are regular commits: standard commit-to-commit comparison
        const targetHash = (await this.runGit(["rev-parse", targetCommitish])).trim();
        const baseHash = (await this.runGit(["rev-parse", effectiveBaseCommitish])).trim();
        resolvedCommit = createCommitRangeString(shortHash(baseHash), shortHash(targetHash));
        resolvedBaseCommitish = shortHash(baseHash);
        resolvedTargetCommitish = shortHash(targetHash);
        attributesRef = targetHash;
        diffArgs = [baseHash, targetHash];
      }

      if (ignoreWhitespace) {
        diffArgs.push("-w");
      }

      if (contextLines !== undefined) {
        diffArgs.push(`-U${contextLines}`);
      }

      // Ignore external diff-tools to unify output (上游 difit 同理)
      diffArgs.push("--no-ext-diff", "--color=never");

      // 单次 diff 调用, 大仓库启动延迟与本地实现同理
      const diffRaw = await this.runGit(["diff", ...diffArgs]);
      const files = await this.markGitattributesGeneratedFiles(
        parseUnifiedDiff(diffRaw),
        attributesRef,
      );

      return {
        commit: resolvedCommit,
        files,
        isEmpty: files.length === 0,
        baseCommitish: resolvedBaseCommitish,
        targetCommitish: resolvedTargetCommitish,
        requestedBaseCommitish: baseCommitish,
        requestedTargetCommitish: targetCommitish,
        requestedBaseMode,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse diff for ${targetCommitish} vs ${baseCommitish}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getBlobContent(filepath: string, ref: string): Promise<Buffer> {
    const normalizeError = (error: unknown): Error => {
      if (
        error instanceof Error &&
        (error.message.includes("maxBuffer") || error.message.includes("ENOBUFS"))
      ) {
        return new Error(`Image file ${filepath} is too large to display (over 10MB limit)`);
      }
      return error instanceof Error ? error : new Error("Unknown error");
    };

    try {
      // 工作区文件远端直接 cat (绝对路径以 / 开头, 无 '-' 开头误解析风险)
      if (ref === "working" || ref === ".") {
        const normalized = this.normalizeRepositoryRelativePath(filepath);
        const absolute = `${this.remotePath.replace(/\/+$/, "")}/${normalized}`;
        const result = await this.executor.execBuffer("cat", [absolute], {
          maxBuffer: BLOB_MAX_BUFFER,
        });
        if (result.exitCode !== 0) {
          throw new Error(
            `cat failed on remote (exit ${result.exitCode}): ${result.stderr.trim()}`,
          );
        }
        return result.stdout;
      }

      const normalized = this.normalizeRepositoryRelativePath(filepath);

      if (ref === "staged") {
        const result = await this.executor.execBuffer("git", ["show", `:${normalized}`], {
          cwd: this.remotePath,
          maxBuffer: BLOB_MAX_BUFFER,
        });
        if (result.exitCode !== 0) {
          throw new Error(
            `git show failed on remote (exit ${result.exitCode}): ${result.stderr.trim()}`,
          );
        }
        return result.stdout;
      }

      const blobHash = (await this.runGit(["rev-parse", `${ref}:${normalized}`])).trim();
      const result = await this.executor.execBuffer("git", ["cat-file", "blob", blobHash], {
        cwd: this.remotePath,
        maxBuffer: BLOB_MAX_BUFFER,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `git cat-file failed on remote (exit ${result.exitCode}): ${result.stderr.trim()}`,
        );
      }
      return result.stdout;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Invalid file path" || error.message === "File path outside repository")
      ) {
        throw error;
      }
      const normalizedError = normalizeError(error);
      if (normalizedError.message.includes("too large")) {
        throw normalizedError;
      }
      throw new Error(
        `Failed to get blob content for ${filepath} at ${ref}: ${normalizedError.message}`,
      );
    }
  }

  async getLineCount(filepath: string, ref: string): Promise<number> {
    const buffer = await this.getBlobContent(filepath, ref);
    let count = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x0a) count++;
    }
    if (buffer.length > 0 && buffer[buffer.length - 1] !== 0x0a) {
      count++;
    }
    return count;
  }

  private extractHeaderLines(buffer: Buffer, maxLines = 20): string[] {
    const headerSlice = buffer.subarray(0, GENERATED_HEADER_SCAN_BYTES);
    return headerSlice.toString("utf8").split("\n").slice(0, maxLines);
  }

  async getGeneratedStatus(filepath: string, ref: string): Promise<GeneratedStatus> {
    const pathResult = isGeneratedFile(filepath);
    if (pathResult.isGenerated) {
      return { isGenerated: true, source: "path" };
    }

    const gitattributesResult = await this.getGitattributesGeneratedPaths([filepath], ref);
    if (gitattributesResult.has(filepath)) {
      return { isGenerated: true, source: "path" };
    }

    try {
      const buffer = await this.getBlobContent(filepath, ref);
      const lines = this.extractHeaderLines(buffer);
      const result = isGeneratedFile(filepath, () => lines);
      return { isGenerated: result.isGenerated, source: "content" };
    } catch {
      return { isGenerated: false, source: "path" };
    }
  }

  async resolveCommitish(commitish: string): Promise<string> {
    const now = Date.now();
    const cached = this.resolvedCommitCache.get(commitish);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const hash = await this.runGit(["rev-parse", commitish]);
    const value = hash.substring(0, 7);

    this.resolvedCommitCache.set(commitish, {
      value,
      expiresAt: now + RESOLVED_COMMIT_CACHE_TTL_MS,
    });

    return value;
  }

  // 本地实现用 simple-git status; 远端用 symbolic-ref 直接判 detached (更省一次解析)
  async getCurrentBranch(): Promise<string | null> {
    const result = await this.runGitRaw(["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (result.exitCode !== 0) {
      return null;
    }
    const branch = result.stdout.trim();
    return branch === "" ? null : branch;
  }

  // 判定顺序与本地实现一致: origin/HEAD symref → origin/main → origin/master → 第一个远程分支
  async getOriginDefaultBranch(): Promise<string | null> {
    try {
      const output = await this.runGit([
        "for-each-ref",
        "--format=%(refname:short)%09%(symref:short)",
        "refs/remotes",
      ]);
      const entries = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          const [name, symrefTarget] = line.split("\t");
          return { name, symrefTarget };
        });

      const symrefEntry = entries.find((entry) => entry.symrefTarget);
      if (symrefEntry?.symrefTarget) {
        return symrefEntry.symrefTarget;
      }

      const names = entries.map((entry) => entry.name);
      if (names.includes("origin/main")) {
        return "origin/main";
      }
      if (names.includes("origin/master")) {
        return "origin/master";
      }
      return names[0] ?? null;
    } catch (error) {
      console.error("Failed to resolve origin default branch on remote:", error);
      return null;
    }
  }

  // 默认分支: origin/HEAD symref → 本地 main/master (与本地实现一致)
  private async getDefaultBranch(): Promise<string | null> {
    try {
      const result = await this.runGit(["symbolic-ref", "refs/remotes/origin/HEAD"]);
      const match = result.trim().match(/refs\/remotes\/origin\/(.+)/);
      if (match) {
        return match[1];
      }
    } catch {
      // origin/HEAD 未设置, 继续走本地分支兜底
    }

    try {
      const branchOutput = await this.runGit(["branch", "--format=%(refname:short)"]);
      const branchNames = branchOutput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const defaultName of ["main", "master"]) {
        if (branchNames.includes(defaultName)) {
          return defaultName;
        }
      }
    } catch (error) {
      console.error("Failed to list branches on remote:", error);
    }
    return null;
  }

  async getRevisionOptions(currentBase?: string, currentTarget?: string): Promise<RevisionOptions> {
    const [branchOutput, logOutput, defaultBranch, originDefaultBranch] = await Promise.all([
      this.runGit(["for-each-ref", "--format=%(refname:short)%09%(HEAD)", "refs/heads"]),
      // %B 可含换行, 以 NUL 分隔 哈希/消息 两段保证可解析
      this.runGit(["log", "--max-count=20", "--format=%H%x00%B%x00"]),
      this.getDefaultBranch(),
      this.getOriginDefaultBranch(),
    ]);

    const branches = branchOutput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, headMarker] = line.split("\t");
        return { name, current: headMarker === "*" };
      });

    // Sort branches: default branch first, then current branch, then alphabetically
    branches.sort((a, b) => {
      if (defaultBranch) {
        if (a.name === defaultBranch) return -1;
        if (b.name === defaultBranch) return 1;
      }
      if (a.current && !b.current) return -1;
      if (!a.current && b.current) return 1;
      return a.name.localeCompare(b.name);
    });

    const logFields = logOutput.split("\0");
    const commits: RevisionOptions["commits"] = [];
    for (let i = 0; i + 1 < logFields.length; i += 2) {
      const hash = logFields[i].trim();
      const message = logFields[i + 1].trim();
      if (hash.length === 0) {
        continue;
      }
      commits.push({ hash, shortHash: hash.substring(0, 7), message });
    }

    let resolvedBase: string | undefined;
    let resolvedTarget: string | undefined;

    if (currentBase && !["working", "staged", "."].includes(currentBase)) {
      try {
        resolvedBase = await this.resolveCommitish(currentBase);
      } catch {
        // If resolution fails, leave undefined
      }
    }

    if (currentTarget && !["working", "staged", "."].includes(currentTarget)) {
      try {
        resolvedTarget = await this.resolveCommitish(currentTarget);
      } catch {
        // If resolution fails, leave undefined
      }
    }

    return {
      branches,
      commits,
      originDefaultBranch: originDefaultBranch ?? undefined,
      resolvedBase,
      resolvedTarget,
    };
  }
}
