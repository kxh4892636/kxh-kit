import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import chokidar, { type ChokidarOptions, type FSWatcher } from "chokidar";
import type { Context } from "@deepseek-ai/cordis";
import { resolveAgentsHome } from "@deepseek-ai/dsh-home-paths";
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
} from "@deepseek-ai/dsh-skill";
import { defaultHostFs, type HostFs } from "./boundary.js";
import { parseSkillText } from "./parse.js";

/** 嵌套 skill 的来源标签；与内建 filesystem provider 的来源名一致。 */
export type NestedSkillSource = "project-agents" | "custom" | "user-agents";

/**
 * 同来源一层形态的 rank 加一：同来源内嵌套候选输给内建一层形态，跨来源仍按上游来源序
 * （project-agents 200 / custom 300 / user-agents 500）。
 */
export const NESTED_SKILL_RANKS: Readonly<Record<NestedSkillSource, number>> = {
  "project-agents": 201,
  custom: 301,
  "user-agents": 501,
};

/** 取某个来源的嵌套候选 rank。 */
export const nestedRank = (source: NestedSkillSource): number => NESTED_SKILL_RANKS[source];
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
  source: NestedSkillSource;
}

interface DiscoveredFile {
  path: string;
  directory: string;
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

/** 创建递归 watcher 的工厂；测试可注入以模拟启动失败。 */
export type WatchFactory = (path: string, options: ChokidarOptions) => FSWatcher;

const defaultWatchFactory: WatchFactory = (path, options) => chokidar.watch(path, options);

/**
 * 在 `.agents` 树内任意深度发现嵌套 SKILL.md 的 skill provider。内建
 * filesystem provider 保留一层形态（`.agents/skills/<name>/SKILL.md`），
 * 本 provider 补充所有更深层的命中。
 */
export class NestedSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME;
  private readonly options: ResolvedOptions;
  private readonly adapter: HostFs;
  private readonly watchManager: NestedWatchManager;
  private disposal: Promise<void> | undefined;

  constructor(
    ctx: Context,
    control: SkillProviderControl,
    options: NestedSkillOptions = {},
    adapter?: HostFs,
    watchFactory: WatchFactory = defaultWatchFactory,
  ) {
    this.options = resolveOptions(options);
    this.adapter = adapter ?? defaultHostFs(ctx);
    const invalidate = (): void => control.invalidate();
    this.watchManager = new NestedWatchManager(ctx.logger, invalidate, this.options, watchFactory);
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
   * @returns 按路径排序的候选，使同 provider 同名师冲突确定性解决；监听启动失败时
   *   以 `complete: false` 标注本次目录不权威，交给注册表保留上一份结果。
   */
  async list(options: SkillLookupOptions): Promise<SkillCandidate[] | SkillProviderObservation> {
    const roots = await this.roots(options.cwd);
    let complete = true;
    try {
      await this.watchManager.observeRoots(roots);
    } catch (error) {
      // 关闭中的失败属于正常拆除，其余失败只让本次目录失去权威性。
      if (this.disposal !== undefined) throw error;
      complete = false;
    }
    const candidates: SkillCandidate[] = [];
    for (const root of roots) {
      for (const candidate of await this.discover(root)) candidates.push(candidate);
    }
    candidates.sort((left, right) => (left.path ?? "").localeCompare(right.path ?? ""));
    return complete ? candidates : { candidates, complete };
  }

  /**
   * 加载完整的嵌套 skill 正文。
   * @param candidate - 本 provider 返回的胜出候选。
   * @param options - 查找选项；signal 取消文件系统读取。
   * @returns 完整 skill；文件消失或变为无效时为 undefined。
   */
  async get(
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined> {
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
      roots.push({ path: resolveAgentsHome(this.options.agentsHome), source: "user-agents" });
    }
    for (const extra of this.options.extraRoots) {
      roots.push({ path: resolve(extra), source: "custom" });
    }
    return roots;
  }

  private async discover(root: SkillRoot): Promise<SkillCandidate[]> {
    const candidates: SkillCandidate[] = [];
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
        rank: nestedRank(root.source),
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
      results.push({ path: entry.path, directory: current.path });
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
  private readonly readiness = new Map<string, () => void>();
  private readonly roots = new Set<string>();
  private readonly logger: { warn(message: string): void };
  private readonly invalidate: () => void;
  private readonly options: ResolvedOptions;
  private readonly createWatcher: WatchFactory;
  private invalidationQueued = false;
  private closing = false;

  constructor(
    logger: { warn(message: string): void },
    invalidate: () => void,
    options: ResolvedOptions,
    createWatcher: WatchFactory,
  ) {
    this.logger = logger;
    this.invalidate = invalidate;
    this.options = options;
    this.createWatcher = createWatcher;
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
    const watcher = this.createWatcher(path, {
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
    await this.awaitReady(path, watcher);
  }

  /**
   * 等待首次扫描完成；启动期错误让等待失败，关闭中的等待直接结束。
   * @param path - watcher 对应的扫描根。
   * @param watcher - 已登记的 watcher。
   * @returns 首次扫描完成后兑现的 promise。
   */
  private awaitReady(path: string, watcher: FSWatcher): Promise<void> {
    return new Promise((settled, failed) => {
      const finish = (error?: Error): void => {
        this.readiness.delete(path);
        watcher.off("ready", ready);
        watcher.off("error", broken);
        if (error === undefined) settled();
        else failed(error);
      };
      const ready = (): void => {
        finish();
      };
      const broken = (error: unknown): void => {
        finish(error instanceof Error ? error : new Error(String(error)));
      };
      this.readiness.set(path, () => {
        finish();
      });
      watcher.once("ready", ready);
      watcher.on("error", broken);
    });
  }

  private async closeWatch(path: string): Promise<void> {
    this.readiness.get(path)?.();
    this.readiness.delete(path);
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
