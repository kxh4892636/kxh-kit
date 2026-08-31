/**
 * 本包挂载的 DeepSeek Harness 插件面结构契约。运行时对象来自 harness 本身；
 * 这些类型使本包无需注册表不可用的 peer 导入，同时保持形状兼容
 * （`ctx.skills`、`ctx.fs`、`ctx.on('fs/observed')`）。
 */

export interface SkillInvocationPolicyLike {
  modelInvocable: boolean;
  userInvocable: boolean;
}

export interface SkillCandidateLike {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: SkillInvocationPolicyLike;
  source: string;
  provider: string;
  rank: number;
  locator: unknown;
  resourceBase?: SkillResourceBaseLike;
  path?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface SkillDefinitionLike {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: SkillInvocationPolicyLike;
  source: string;
  provider: string;
  resourceBase?: SkillResourceBaseLike;
  path?: string;
  metadata?: Readonly<Record<string, unknown>>;
  content: string;
}

export type SkillResourceBaseLike =
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "opaque"; readonly description: string };

export interface SkillLookupOptionsLike {
  cwd?: string;
  signal?: AbortSignal;
}

export interface SkillProviderLike {
  readonly name: string;
  list(
    options: SkillLookupOptionsLike,
  ): Promise<
    readonly SkillCandidateLike[] | { candidates: readonly SkillCandidateLike[]; complete: boolean }
  >;
  get(
    candidate: SkillCandidateLike,
    options: SkillLookupOptionsLike,
  ): Promise<SkillDefinitionLike | undefined>;
}

export interface SkillProviderControlLike {
  signal: AbortSignal;
  invalidate(): void;
}

/** `ctx.get('fs')` 提供的文件系统服务子集。 */
export interface FileSystemLike {
  resolve(path: string): Promise<FsTargetLike | undefined>;
  listDir(target: FsTargetLike, signal?: AbortSignal): Promise<FsEntryLike[]>;
  stat(target: FsTargetLike, signal?: AbortSignal): Promise<FsInfoLike | undefined>;
  readText(target: FsTargetLike, signal?: AbortSignal): Promise<string | undefined>;
}

export interface FsTargetLike {
  targetKey: string;
  displayPath: string;
}

export interface FsEntryLike {
  name: string;
  type: "file" | "directory" | "other";
  target: FsTargetLike;
}

export interface FsInfoLike {
  type: "file" | "directory" | "other";
  version?: unknown;
}

/** 本插件用到的 harness `Context` 面。 */
export interface PluginContextLike {
  readonly logger: { warn(message: string): void };
  get(key: "fs"): unknown;
  on(
    event: "fs/observed",
    handler: (target: { displayPath: string }, observation: unknown, actor: unknown) => void,
  ): void;
  effect(...args: unknown[]): unknown;
  readonly skills: {
    registerProvider(create: (control: SkillProviderControlLike) => SkillProviderLike): () => void;
  };
}
