import type { Context } from "@deepseek-ai/cordis";

/**
 * 宿主服务的最小结构化契约。
 *
 * 本包不把 `@deepseek-ai/dsh-tools` / `dsh-system-prompt` 声明为依赖：插件只用到
 * 「注册工具」「注册提示词段」「注册运行时上下文」三个方法，写成结构化类型可以避免为
 * 三个调用引入 peer 包，也避免宿主升级时的类型漂移。
 */

/** 模型可见的文本块；工具输出统一渲染成一段文本。 */
export interface ToolTextBlock {
  readonly type: "text";
  readonly text: string;
}

/** 工具执行上下文里本插件用到的字段。 */
export interface ToolExecContext {
  /** 调用方取消信号。 */
  readonly signal: AbortSignal;
  /** 调用该工具的 agent；用于解析会话工作目录。 */
  readonly agent?: unknown;
}

/** 一个注册进宿主工具注册表的定义（结构对齐 ToolDefinition）。 */
export interface ToolDefinitionLike {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: {
    readonly schema: Record<string, unknown>;
    render(args: unknown, value: unknown): readonly ToolTextBlock[];
  };
  execute(args: unknown, exec: ToolExecContext): Promise<unknown>;
}

/** 工具注册表。 */
interface ToolRegistry {
  register(definition: ToolDefinitionLike): () => void;
}

/** 提示词组装时传给文本回调的最小上下文。 */
export interface PromptContext {
  /** 当前 agent；用于解析会话工作目录。 */
  readonly agent?: unknown;
}

/** 一个系统提示词段；`interpolate: false` 保证正文按字面量注入。 */
interface PromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((context: PromptContext) => string);
  readonly interpolate?: boolean;
}

/** 一条运行时上下文；会作为带来源的 user 角色快照进入模型历史。 */
export interface PromptContextEntry {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((context: PromptContext) => string);
  readonly required?: boolean;
  readonly interpolate?: boolean;
}

/** 系统提示词注册表。 */
interface PromptRegistry {
  section(section: PromptSection): () => void;
  context?(entry: PromptContextEntry): () => void;
}

/** 会话工作目录服务；宿主未提供时工具回落到进程工作目录。 */
export interface WorkingDirectoryService {
  ensure(agent: unknown, signal?: AbortSignal): Promise<string>;
}

/** 插件用到的宿主能力集合。 */
export interface HostServices {
  readonly tools: ToolRegistry;
  readonly systemPrompt: PromptRegistry;
  readonly logger: { warn(message: string): void };
  /** 读取一个可选服务；缺失时返回 undefined，不抛错。 */
  get(name: string): unknown;
  /** 监听宿主事件；返回注销函数。 */
  on(event: string, handler: (...args: unknown[]) => unknown): () => void;
}

/**
 * 把 cordis 上下文收窄成本插件用到的宿主能力。
 * @param ctx - 插件作用域上下文。
 * @returns 结构化后的宿主能力。
 */
export const hostServices = (ctx: Context): HostServices => ctx as unknown as HostServices;
