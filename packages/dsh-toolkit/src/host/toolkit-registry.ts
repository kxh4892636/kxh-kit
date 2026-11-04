import type { Context } from "@deepseek-ai/cordis";
import type { ToolkitToolInfo } from "../contract.js";
import type { ToolkitStateStore } from "./toolkit-state.js";

/** 一个工具：目录信息 + 启停实现；`apply` 返回的 disposer 负责彻底卸载。 */
export interface ToolkitTool {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** 状态文件里没有记录时采用的值。 */
  readonly defaultEnabled: boolean;
  apply(ctx: Context): () => void;
}

/** 注册表所需的宿主能力；只依赖 cordis 上下文与日志，便于测试注入。 */
export interface ToolkitRegistryOptions {
  readonly ctx: Context;
  readonly tools: readonly ToolkitTool[];
  readonly store: ToolkitStateStore;
  readonly logger: { warn(message: string): void };
}

/**
 * 工具注册表：把状态文件里的开关施加到工具实现上。
 * 开关变化与初始化都串行执行，避免同一工具被并发 apply/dispose。
 */
export class ToolkitRegistry {
  private readonly tools: readonly ToolkitTool[];
  private readonly store: ToolkitStateStore;
  private readonly options: ToolkitRegistryOptions;
  private readonly applied = new Map<string, () => void>();
  private readonly enabled = new Map<string, boolean>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(options: ToolkitRegistryOptions) {
    this.options = options;
    this.tools = options.tools;
    this.store = options.store;
    for (const tool of this.tools) this.enabled.set(tool.id, tool.defaultEnabled);
  }

  /** 读取持久状态并同步全部工具；返回面板需要的目录。 */
  async initialize(): Promise<readonly ToolkitToolInfo[]> {
    await this.serialize(async () => {
      const doc = await this.store.load();
      for (const tool of this.tools) {
        const recorded = doc.tools[tool.id];
        this.enabled.set(tool.id, recorded ?? tool.defaultEnabled);
      }
      await this.applyAll();
    });
    return this.list();
  }

  /** 面板与路由读取的工具目录，顺序即工具声明顺序。 */
  list(): readonly ToolkitToolInfo[] {
    return this.tools.map((tool) => ({
      id: tool.id,
      title: tool.title,
      description: tool.description,
      enabled: this.enabled.get(tool.id) ?? tool.defaultEnabled,
    }));
  }

  /** 某个工具当前是否生效。 */
  isEnabled(id: string): boolean {
    return this.enabled.get(id) ?? false;
  }

  /**
   * 切换一个工具并落盘。
   * @param id - 工具 id；未知 id 抛错，调用方转成 400。
   * @param enabled - 目标状态。
   * @returns 切换后的完整目录。
   */
  async setEnabled(id: string, enabled: boolean): Promise<readonly ToolkitToolInfo[]> {
    if (!this.tools.some((tool) => tool.id === id)) {
      throw new UnknownToolError(id);
    }
    await this.serialize(async () => {
      if (this.enabled.get(id) === enabled) return;
      await this.store.setTool(id, enabled);
      this.enabled.set(id, enabled);
      await this.syncOne(id);
    });
    return this.list();
  }

  /** 卸载全部工具（插件销毁路径）。 */
  async dispose(): Promise<void> {
    await this.serialize(async () => {
      for (const id of Array.from(this.applied.keys())) this.unapply(id);
    });
  }

  private async applyAll(): Promise<void> {
    for (const tool of this.tools) {
      if (this.enabled.get(tool.id) === true) this.apply(tool);
      else this.unapply(tool.id);
    }
  }

  private async syncOne(id: string): Promise<void> {
    const tool = this.tools.find((candidate) => candidate.id === id);
    if (tool === undefined) return;
    if (this.enabled.get(id) === true) this.apply(tool);
    else this.unapply(id);
  }

  private apply(tool: ToolkitTool): void {
    if (this.applied.has(tool.id)) return;
    try {
      this.applied.set(tool.id, tool.apply(this.options.ctx));
    } catch (error) {
      this.options.logger.warn(`toolkit: tool "${tool.id}" failed to apply: ${describe(error)}`);
    }
  }

  private unapply(id: string): void {
    const dispose = this.applied.get(id);
    if (dispose === undefined) return;
    this.applied.delete(id);
    try {
      dispose();
    } catch (error) {
      this.options.logger.warn(`toolkit: tool "${id}" failed to dispose: ${describe(error)}`);
    }
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.then(operation, operation);
    this.chain = next.catch(() => {});
    return next;
  }
}

/** 未知工具 id：路由层据此返回 400。 */
export class UnknownToolError extends Error {
  readonly toolId: string;

  constructor(toolId: string) {
    super(`unknown toolkit tool "${toolId}"`);
    this.name = "UnknownToolError";
    this.toolId = toolId;
  }
}

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
