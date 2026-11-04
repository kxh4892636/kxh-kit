/**
 * 客户端半使用的宿主契约（结构性声明）。
 *
 * 宿主实装只发布 JS bundle，没有 d.ts；这里按实际用到的成员声明，出处写在注释里，
 * 形状漂移会在真机验收时暴露。全部成员都按「可缺省」处理，缺服务时插件降级而非崩溃。
 */

/** `ctx.slots.register` 接受的选项；只用到的字段需要类型。 */
export interface ClientSlotOptions {
  readonly name: string;
  /** list slot 用 id，keyed slot 用 key；两者互斥。 */
  readonly id?: string;
  readonly key?: string;
  readonly order?: number;
  readonly label?: string | (() => string);
  readonly locale?: string;
  readonly inject?: (...args: readonly never[]) => Record<string, unknown>;
}

/** slot 组件签名；`never` 参数让它接受任意自有 props 类型。 */
export type ClientSlotComponent = (props: never) => unknown;

/** `ctx.slots`：注册与「等声明出现再注册」（`dsh-client-ui-renderer/lib/client.js:1368-1394`）。 */
export interface ClientSlots {
  inject(key: string, contribute: () => (() => void) | void): void;
  register(options: ClientSlotOptions, component: ClientSlotComponent): () => void;
}

/** 客户端会话服务：只用 `binding` 把草稿初始化落到具体会话。 */
export interface ClientSessions {
  binding(sessionId: string): unknown;
}

/** 工作区导航：`uiWorkspace.openSession(id)`（`dsh-client-ui-workspace/lib/client.js:1471-1473`）。 */
export interface ClientWorkspace {
  openSession(sessionId: string): Promise<unknown>;
}

/** 草稿初始化选项（`dsh-client-ui-conversation/lib/client.js:15107-15121`）。 */
export interface DraftInitializationOptions {
  readonly prompt?: string;
  readonly whenDraftExists?: "replace" | "append" | "keep";
}

/** `conversation` 服务上初始化草稿的入口。 */
export interface ClientConversation {
  readonly input: {
    requestDraftInitialization(
      binding: unknown,
      options: DraftInitializationOptions,
    ): "applied" | "preserved" | "blocked";
  };
}

/** 客户端根上下文里本插件会用到的部分。 */
export interface ClientContext {
  readonly slots: ClientSlots;
  get(key: string): unknown;
  effect(callback: () => (() => void) | void, label?: string): () => void;
}

/** 会话作用域 slot 的标准 props（`conversation.input.right` 由 composer 送出）。 */
export interface SessionScopeProps {
  readonly sessionId: string;
}

/** 按名字取服务，缺失时返回 undefined。 */
export const clientService = <T>(
  ctx: { get(key: string): unknown },
  key: string,
): T | undefined => {
  try {
    return (ctx.get(key) as T | undefined) ?? undefined;
  } catch {
    return undefined;
  }
};

/** 结构性判断：服务上是否存在给定方法。 */
export const hasMethod = <T>(service: unknown, method: string): service is T => {
  return (
    typeof service === "object" &&
    service !== null &&
    typeof (service as Record<string, unknown>)[method] === "function"
  );
};
