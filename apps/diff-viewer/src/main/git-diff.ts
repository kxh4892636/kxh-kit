// issue 06: unified diff 文本与 check-attr 输出的纯解析抽到 git-text-parse.ts,
// 供本地 (simple-git 取文本) 与远程 (ssh exec 取文本) 两个 parser 复用;
// 本类只保留 git 命令调用与结果组装。
import { simpleGit, type SimpleGit } from "simple-git";
import { isAbsolute, resolve, sep } from "path";

import { validateDiffArguments, shortHash, createCommitRangeString } from "./commitish.js";
import { type DiffFile, type DiffResponse, type DiffSelection } from "../types/diff.js";
import { getMergeBaseTargetRef, normalizeBaseMode } from "../utils/diffSelection.js";

import { isGeneratedFile } from "./generated-file-check.js";
import { parseGitattributesGeneratedOutput, parseUnifiedDiff } from "./git-text-parse.js";

export class GitDiffParser {
  private git: SimpleGit;
  private repoPath: string;
  private readonly resolvedCommitCache = new Map<string, { value: string; expiresAt: number }>();
  private static readonly RESOLVED_COMMIT_CACHE_TTL_MS = 5_000;
  private static readonly GENERATED_HEADER_SCAN_BYTES = 4 * 1024;
  private static readonly GITATTRIBUTES_CHECK_CHUNK_SIZE = 200;

  constructor(repoPath = process.cwd()) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  // 仓库相对路径归一化的唯一实现; api-router 直接复用并把抛错映射为 400 响应
  normalizeRepositoryRelativePath(filepath: string): string {
    if (filepath.length === 0) {
      throw new Error("Invalid file path");
    }

    const normalizedFilepath = filepath.replace(/\\/g, "/");
    const hasParentTraversal = normalizedFilepath.split("/").some((segment) => segment === "..");
    if (isAbsolute(filepath) || normalizedFilepath.startsWith("/") || hasParentTraversal) {
      throw new Error("File path outside repository");
    }

    const repositoryPath = resolve(this.repoPath);
    const resolvedPath = resolve(repositoryPath, normalizedFilepath);
    if (resolvedPath !== repositoryPath && !resolvedPath.startsWith(`${repositoryPath}${sep}`)) {
      throw new Error("File path outside repository");
    }

    return normalizedFilepath;
  }

  private async resolveBaseCommitish(selection: DiffSelection): Promise<string> {
    if (normalizeBaseMode(selection.baseMode) !== "merge-base") {
      return selection.baseCommitish;
    }

    const targetRef = getMergeBaseTargetRef(selection.targetCommitish);
    const mergeBase = await this.git.raw(["merge-base", targetRef, selection.baseCommitish]);
    return mergeBase.trim();
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
      // Validate arguments
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
        const baseHash = await this.git.revparse([effectiveBaseCommitish]);
        resolvedCommit = `${shortHash(baseHash)} vs Staging Area (staged changes)`;
        resolvedBaseCommitish = shortHash(baseHash);
        diffArgs = ["--cached", effectiveBaseCommitish];
      } else if (targetCommitish === ".") {
        // Show all uncommitted changes against base commit
        const baseHash = await this.git.revparse([effectiveBaseCommitish]);
        resolvedCommit = `${shortHash(baseHash)} vs Working Directory (all uncommitted changes)`;
        resolvedBaseCommitish = shortHash(baseHash);
        diffArgs = [effectiveBaseCommitish];
      } else {
        // Both are regular commits: standard commit-to-commit comparison
        const targetHash = await this.git.revparse([targetCommitish]);
        const baseHash = await this.git.revparse([effectiveBaseCommitish]);
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

      // Ignore external diff-tools to unify output.
      // https://github.com/yoshiko-pg/difit/issues/19
      diffArgs.push("--no-ext-diff", "--color=never");

      // Single git invocation for better startup latency on large repositories.
      const diffRaw = await this.git.diff(diffArgs);
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
      for (let i = 0; i < filepaths.length; i += GitDiffParser.GITATTRIBUTES_CHECK_CHUNK_SIZE) {
        const chunk = filepaths.slice(i, i + GitDiffParser.GITATTRIBUTES_CHECK_CHUNK_SIZE);
        const output = await this.git.raw([
          "check-attr",
          "-z",
          ...this.getGitattributesSourceArgs(ref),
          "linguist-generated",
          "--",
          ...chunk,
        ]);

        if (typeof output !== "string") {
          continue;
        }

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

  async validateCommit(commitish: string): Promise<boolean> {
    try {
      if (commitish === "." || commitish === "working" || commitish === "staged") {
        // For working directory or staging area, just check if we're in a git repo
        await this.git.status();
        return true;
      }
      await this.git.show([commitish, "--name-only"]);
      return true;
    } catch {
      return false;
    }
  }

  async getBlobContent(filepath: string, ref: string): Promise<Buffer> {
    try {
      // For working directory, read directly from filesystem
      if (ref === "working" || ref === ".") {
        const fs = await import("fs");
        if (filepath.length === 0) {
          throw new Error("Invalid file path");
        }

        const repositoryPath = fs.realpathSync(resolve(this.repoPath));
        const repositoryRoot = `${repositoryPath}${sep}`;
        const absolutePath = fs.realpathSync(resolve(repositoryRoot, filepath.replace(/\\/g, "/")));

        if (!absolutePath.startsWith(repositoryRoot)) {
          throw new Error("File path outside repository");
        }

        return fs.readFileSync(absolutePath);
      }

      const normalizedFilepath = this.normalizeRepositoryRelativePath(filepath);

      // For git refs, we need to use child_process to execute git cat-file
      // to properly handle binary data
      const { execFileSync } = await import("child_process");

      // Handle staged files
      if (ref === "staged") {
        // For staged files, use git show :filepath
        // Using execFileSync to prevent command injection
        const buffer = execFileSync("git", ["show", `:${normalizedFilepath}`], {
          maxBuffer: 10 * 1024 * 1024, // 10MB limit
          // fork 适配: 上游作为 CLI 以仓库为 cwd, Electron 主进程必须显式指定
          cwd: this.repoPath,
        });
        return buffer;
      }

      // First, get the blob hash for the file at the given ref
      // Using execFileSync to prevent command injection
      const blobHash = execFileSync("git", ["rev-parse", `${ref}:${normalizedFilepath}`], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        cwd: this.repoPath,
      }).trim();

      // Then use git cat-file to get the raw binary content
      // Increase maxBuffer to handle large files (default is 1024*1024 = 1MB)
      const buffer = execFileSync("git", ["cat-file", "blob", blobHash], {
        maxBuffer: 10 * 1024 * 1024, // 10MB limit
        cwd: this.repoPath,
      });

      return buffer;
    } catch (error) {
      // Check if it's a buffer size error
      if (
        error instanceof Error &&
        (error.message.includes("ENOBUFS") || error.message.includes("maxBuffer"))
      ) {
        throw new Error(`Image file ${filepath} is too large to display (over 10MB limit)`);
      }

      if (
        error instanceof Error &&
        (error.message === "Invalid file path" || error.message === "File path outside repository")
      ) {
        throw error;
      }

      throw new Error(
        `Failed to get blob content for ${filepath} at ${ref}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async getLineCount(filepath: string, ref: string): Promise<number> {
    const buffer = await this.getBlobContent(filepath, ref);
    let count = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x0a) count++; // newline byte
    }
    // If file doesn't end with newline, the last line still counts
    if (buffer.length > 0 && buffer[buffer.length - 1] !== 0x0a) {
      count++;
    }
    return count;
  }

  private extractHeaderLines(buffer: Buffer, maxLines = 20): string[] {
    const headerSlice = buffer.subarray(0, GitDiffParser.GENERATED_HEADER_SCAN_BYTES);
    return headerSlice.toString("utf8").split("\n").slice(0, maxLines);
  }

  async getGeneratedStatus(
    filepath: string,
    ref: string,
  ): Promise<{ isGenerated: boolean; source: "path" | "content" }> {
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

    const hash = await this.git.revparse([commitish]);
    const value = hash.substring(0, 7);

    this.resolvedCommitCache.set(commitish, {
      value,
      expiresAt: now + GitDiffParser.RESOLVED_COMMIT_CACHE_TTL_MS,
    });

    return value;
  }

  clearResolvedCommitCache(): void {
    this.resolvedCommitCache.clear();
  }

  async getDefaultBranch(): Promise<string | null> {
    try {
      // Try to get the default branch from origin/HEAD
      const result = await this.git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
      // Result will be like "refs/remotes/origin/main\n"
      const match = result.trim().match(/refs\/remotes\/origin\/(.+)/);
      if (match) {
        return match[1];
      }
    } catch {
      // If origin/HEAD is not set, fall back to common default branches
      const commonDefaults = ["main", "master"];
      const branchResult = await this.git.branchLocal();
      const branchNames = Object.keys(branchResult.branches);

      for (const defaultName of commonDefaults) {
        if (branchNames.includes(defaultName)) {
          return defaultName;
        }
      }
    }
    return null;
  }

  // 当前本地分支名; detached HEAD 时返回 null, 供默认对比降级链判断
  async getCurrentBranch(): Promise<string | null> {
    const status = await this.git.status();
    return status.detached ? null : status.current;
  }

  // 远程默认分支判定顺序: origin/HEAD symref → origin/main → origin/master → 第一个远程分支;
  // 没有任何远程分支时返回 null (调用方走降级)。
  // 注意不能用 show-ref --quiet 的退出码探测: simple-git 对空输出的非零退出不抛错。
  async getOriginDefaultBranch(): Promise<string | null> {
    try {
      const output = await this.git.raw([
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

      // refs/remotes 下唯一带 symref 目标的就是 origin/HEAD 这类远程默认分支标记
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
      console.error("Failed to resolve origin default branch:", error);
      return null;
    }
  }

  async getRevisionOptions(
    currentBase?: string,
    currentTarget?: string,
  ): Promise<{
    branches: Array<{ name: string; current: boolean }>;
    commits: Array<{ hash: string; shortHash: string; message: string }>;
    originDefaultBranch?: string;
    resolvedBase?: string;
    resolvedTarget?: string;
  }> {
    const [branchResult, logResult, defaultBranch, originDefaultBranch] = await Promise.all([
      this.git.branchLocal(),
      this.git.log({ maxCount: 20 }),
      this.getDefaultBranch(),
      this.getOriginDefaultBranch(),
    ]);

    const branches = Object.entries(branchResult.branches).map(([name, data]) => ({
      name,
      current: data.current,
    }));

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

    const commits = logResult.all.map((commit) => ({
      hash: commit.hash,
      shortHash: commit.hash.substring(0, 7),
      message: commit.message,
    }));

    // Resolve HEAD and HEAD^ to actual commit hashes if they're being used
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
