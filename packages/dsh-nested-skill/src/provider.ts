import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type {
  PluginContextLike,
  SkillCandidateLike,
  SkillDefinitionLike,
  SkillLookupOptionsLike,
  SkillProviderControlLike,
  SkillProviderLike,
} from "./contract.js";
import { defaultHostFs, type HostFs } from "./boundary.js";
import { parseSkillText } from "./parse.js";

/** 嵌套候选在同名师冲突中输给内建一层 provider（rank 200）。 */
export const NESTED_SKILL_RANK = 250;
/** 出现在 skill 目录中的 provider 标签。 */
export const PROVIDER_NAME = "nested-agents";

/** 扫描时剪除的默认目录名清单。 */
export const DEFAULT_EXCLUDED_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "out",
  ".turbo",
];

/** provider、watcher 与 schema 共用的插件有效配置。 */
export interface NestedSkillOptions {
  watch?: boolean;
  watchUsePolling?: boolean;
  watchPollIntervalMs?: number;
  watchStabilityThresholdMs?: number;
  includeUserRoots?: boolean;
  agentsHome?: string;
  excludedDirs?: string[];
  extraRoots?: string[];
}

interface ResolvedOptions {
  watch: boolean;
  watchUsePolling: boolean;
  watchPollIntervalMs: number;
  watchStabilityThresholdMs: number;
  includeUserRoots: boolean;
  agentsHome: string | undefined;
  excluded: ReadonlySet<string>;
  extraRoots: string[];
}

interface SkillRoot {
  path: string;
  source: string;
}

interface DiscoveredFile {
  path: string;
  directory: string;
  segments: string[];
}

const resolveOptions = (options: NestedSkillOptions): ResolvedOptions => {
  return {
    watch: options.watch ?? true,
    watchUsePolling: options.watchUsePolling ?? false,
    watchPollIntervalMs: options.watchPollIntervalMs ?? 100,
    watchStabilityThresholdMs: options.watchStabilityThresholdMs ?? 200,
    includeUserRoots: options.includeUserRoots ?? true,
    agentsHome: options.agentsHome,
    excluded: new Set(options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS),
    extraRoots: options.extraRoots ?? [],
  };
};

/**
 * 在 `.agents` 树内任意深度发现嵌套 SKILL.md 的 skill provider。内建
 * filesystem provider 保留一层形态（`.agents/skills/<name>/SKILL.md`），
 * 本 provider 补充所有更深层的命中。
 */
export class NestedSkillProvider implements SkillProviderLike {
  readonly name = PROVIDER_NAME;
  private readonly options: ResolvedOptions;
  private readonly adapter: HostFs;
  private readonly watchManager: NestedWatchManager;
  private disposal: Promise<void> | undefined;

  constructor(
    ctx: PluginContextLike,
    control: SkillProviderControlLike,
    options: NestedSkillOptions = {},
    adapter?: HostFs,
  ) {
    this.options = resolveOptions(options);
    this.adapter = adapter ?? defaultHostFs(ctx);
    const invalidate = (): void => control.invalidate();
    this.watchManager = new NestedWatchManager(ctx.logger, invalidate, this.options);
    control.signal.addEventListener(
      "abort",
      () => {
        void this.dispose();
      },
      { once: true },
    );
  }

  /**
   * 为工作区发现嵌套 skill。
   * @param options - 查找选项；`cwd` 选择项目的 `.agents` 根。
   * @returns 按路径排序的候选，使同 provider 同名师冲突确定性解决。
   */
  async list(options: SkillLookupOptionsLike): Promise<SkillCandidateLike[]> {
    const roots = await this.roots(options.cwd);
    try {
      await this.watchManager.observeRoots(roots);
    } catch {
      // 监听启动失败只退化为一次当前扫描，不阻断发现。
    }
    const candidates: SkillCandidateLike[] = [];
    for (const root of roots) {
      for (const candidate of await this.discover(root)) candidates.push(candidate);
    }
    return candidates.sort((left, right) => (left.path ?? "").localeCompare(right.path ?? ""));
  }

  /**
   * 加载完整的嵌套 skill 正文。
   * @param candidate - 本 provider 返回的胜出候选。
   * @param options - 查找选项；signal 取消文件系统读取。
   * @returns 完整 skill；文件消失或变为无效时为 undefined。
   */
  async get(
    candidate: SkillCandidateLike,
    options: SkillLookupOptionsLike,
  ): Promise<SkillDefinitionLike | undefined> {
    const locator = candidate.locator as { path: string; directory: string };
    const raw = await this.adapter.readText(locator.path);
    options.signal?.throwIfAborted();
    if (raw === undefined) return undefined;
    const parsed = parseSkillText(raw);
    if (parsed === undefined) return undefined;
    return {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
      invocation: parsed.invocation,
      source: candidate.source,
      provider: this.name,
      resourceBase: { kind: "directory", path: locator.directory },
      path: locator.path,
      ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      content: parsed.content,
    };
  }

  /** 扫描根内出现第一方文件系统变更时使目录失效。 */
  observeHostMutation(path: string): void {
    this.watchManager.observeHostMutation(path);
  }

  /** 关闭 watcher 并吞掉迟到的通知。 */
  dispose(): Promise<void> {
    this.disposal ??= this.watchManager.dispose();
    return this.disposal;
  }

  private async roots(cwd: string | undefined): Promise<SkillRoot[]> {
    const roots: SkillRoot[] = [];
    if (cwd !== undefined) {
      const projectRoot = await findProjectRoot(resolve(cwd), this.adapter);
      roots.push({ path: join(projectRoot, ".agents"), source: "project-agents" });
    }
    if (this.options.includeUserRoots) {
      const agentsHome =
        this.options.agentsHome ?? process.env["DSH_AGENTS_HOME"] ?? join(homedir(), ".agents");
      roots.push({ path: agentsHome, source: "user-agents" });
    }
    for (const extra of this.options.extraRoots) {
      roots.push({ path: resolve(extra), source: "custom" });
    }
    return roots;
  }

  private async discover(root: SkillRoot): Promise<SkillCandidateLike[]> {
    const candidates: SkillCandidateLike[] = [];
    for (const file of await walkSkillFiles(root.path, this.adapter, this.options.excluded)) {
      const raw = await this.adapter.readText(file.path);
      if (raw === undefined) continue;
      const parsed = parseSkillText(raw);
      if (parsed === undefined) continue;
      candidates.push({
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse !== undefined ? { whenToUse: parsed.whenToUse } : {}),
        invocation: parsed.invocation,
        provider: this.name,
        source: root.source,
        rank: NESTED_SKILL_RANK,
        locator: { path: file.path, directory: file.directory },
        resourceBase: { kind: "directory", path: file.directory },
        path: file.path,
        ...(parsed.metadata !== undefined ? { metadata: parsed.metadata } : {}),
      });
    }
    return candidates;
  }
}

/** 在 `.agents` 树中任意深度遍历嵌套 SKILL.md，剪除隐藏目录与排除清单。 */
export const walkSkillFiles = async (
  root: string,
  fs: HostFs,
  excluded: ReadonlySet<string>,
): Promise<DiscoveredFile[]> => {
  const results: DiscoveredFile[] = [];
  const stack: { path: string; segments: string[] }[] = [{ path: root, segments: [] }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const entry of await fs.listDir(current.path)) {
      const segments = [...current.segments, entry.name];
      if (entry.kind === "directory") {
        if (isSkippedDirectory(entry.name, excluded)) continue;
        stack.push({ path: entry.path, segments });
        continue;
      }
      if (entry.name !== "SKILL.md") continue;
      if (isShippedOneLayerForm(segments)) continue;
      results.push({ path: entry.path, directory: current.path, segments });
    }
  }
  return results;
};

export const isShippedOneLayerForm = (segments: string[]): boolean => {
  return segments.length === 3 && segments[0] === "skills";
};

export const isSkippedDirectory = (name: string, excluded: ReadonlySet<string>): boolean => {
  return name.startsWith(".") || excluded.has(name);
};

/** 从 cwd 上溯到携带 `.git`（目录或 worktree 文件）的项目根。 */
export const findProjectRoot = async (cwd: string, fs: HostFs): Promise<string> => {
  let current = cwd;
  while (true) {
    if (await fs.exists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
};

/** 持有当前根集的有界递归 watcher 与失效逻辑。 */
class NestedWatchManager {
  private readonly watches = new Map<string, FSWatcher>();
  private readonly roots = new Set<string>();
  private readonly logger: { warn(message: string): void };
  private readonly invalidate: () => void;
  private readonly options: ResolvedOptions;
  private invalidationQueued = false;
  private closing = false;

  constructor(
    logger: { warn(message: string): void },
    invalidate: () => void,
    options: ResolvedOptions,
  ) {
    this.logger = logger;
    this.invalidate = invalidate;
    this.options = options;
  }

  async observeRoots(roots: readonly SkillRoot[]): Promise<void> {
    if (this.closing) return;
    const wanted = new Set(roots.map((root) => resolve(root.path)));
    const removed = [...this.roots].filter((path) => !wanted.has(path));
    const added = [...wanted].filter((path) => !this.roots.has(path));
    this.roots.clear();
    for (const path of wanted) this.roots.add(path);
    for (const path of removed) await this.closeWatch(path);
    for (const path of added) await this.openWatch(path);
  }

  observeHostMutation(path: string): void {
    if (this.closing) return;
    const normalized = resolve(path);
    for (const root of this.roots) {
      if (isWithin(root, normalized)) {
        this.queueInvalidation();
        return;
      }
    }
  }

  async dispose(): Promise<void> {
    this.closing = true;
    const closing: Promise<void>[] = [];
    for (const path of this.watches.keys()) closing.push(this.closeWatch(path));
    await Promise.allSettled(closing);
    this.roots.clear();
  }

  private async openWatch(path: string): Promise<void> {
    if (!this.options.watch || this.watches.has(path)) return;
    const watcher = chokidar.watch(path, {
      ignoreInitial: true,
      persistent: true,
      followSymlinks: true,
      usePolling: this.options.watchUsePolling,
      interval: this.options.watchPollIntervalMs,
      awaitWriteFinish: {
        stabilityThreshold: this.options.watchStabilityThresholdMs,
        pollInterval: this.options.watchPollIntervalMs,
      },
    });
    this.watches.set(path, watcher);
    for (const event of ["add", "addDir", "change", "unlink", "unlinkDir"] as const) {
      watcher.on(event, () => {
        this.queueInvalidation();
      });
    }
    watcher.on("error", (error) => {
      this.logger.warn(`nested-skill: watcher for ${path} failed: ${String(error)}`);
      this.queueInvalidation();
    });
  }

  private async closeWatch(path: string): Promise<void> {
    const watcher = this.watches.get(path);
    if (watcher === undefined) return;
    this.watches.delete(path);
    await watcher.close();
  }

  private queueInvalidation(): void {
    if (this.closing || this.invalidationQueued) return;
    this.invalidationQueued = true;
    queueMicrotask(() => {
      this.invalidationQueued = false;
      if (this.closing) return;
      this.invalidate();
    });
  }
}

const isWithin = (root: string, path: string): boolean => {
  const child = relative(root, path);
  if (child === "") return true;
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) return false;
  return true;
};
