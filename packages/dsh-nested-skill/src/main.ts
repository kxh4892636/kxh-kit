import z from "@deepseek-ai/schemastery";
import type Schema from "@deepseek-ai/schemastery";
import type { PluginContextLike } from "./contract.js";
import { DEFAULT_EXCLUDED_DIRS, NestedSkillProvider, type NestedSkillOptions } from "./provider.js";
export { NESTED_SKILL_RANK, PROVIDER_NAME } from "./provider.js";

/** 插件配置；全部可选，默认值对运行环境保持中性。 */
export type Config = NestedSkillOptions;

export const Config: Schema<Config> = z.object({
  /** 是否监听扫描中的 `.agents` 根以感知目录变化。 */
  watch: z.boolean().default(true),
  /** chokidar 是否以轮询代替原生文件系统事件。 */
  watchUsePolling: z.boolean().default(false),
  /** chokidar 轮询探测间隔（毫秒）。 */
  watchPollIntervalMs: z.number().default(100),
  /** 变更条目在被观测前需要保持稳定的毫秒数。 */
  watchStabilityThresholdMs: z.number().default(200),
  /** 用户级 `.agents` 根是否参与发现。 */
  includeUserRoots: z.boolean().default(true),
  /** 用户 agent 根；缺省为 `$DSH_AGENTS_HOME` 或 `~/.agents`。 */
  agentsHome: z.string(),
  /** 扫描中剪除的额外目录名清单。 */
  excludedDirs: z.array(z.string()).default(DEFAULT_EXCLUDED_DIRS),
  /** 以 `custom` 来源标签扫描的额外绝对路径根。 */
  extraRoots: z.array(z.string()).default([]),
});

export const name = "nested-skill";
export const inject = ["skills"];

/** 在 `ctx.skills` 注册 nested-skill provider，并在宿主文件变更时使目录失效。 */
export const apply = (ctx: PluginContextLike, config: Config = {}): void => {
  let provider: NestedSkillProvider | undefined;
  ctx.skills.registerProvider((control) => {
    provider = new NestedSkillProvider(ctx, control, config);
    return provider;
  });
  ctx.effect(function* () {
    yield async () => {
      await provider?.dispose();
    };
  }, "nested-skill watcher");
  ctx.on("fs/observed", (target, _observation, actor) => {
    if (mutationToolName(actor) === undefined) return;
    provider?.observeHostMutation(target.displayPath);
  });
};

const mutationToolName = (actor: unknown): "edit" | "write" | undefined => {
  if (typeof actor !== "object" || actor === null || !("name" in actor)) return undefined;
  const value = (actor as { name: unknown }).name;
  return value === "edit" || value === "write" ? value : undefined;
};
