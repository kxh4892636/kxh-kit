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

/**
 * 当前会话的导航选择 store：`dsh-client-ui-workspace/lib/client.js` 的
 * `selection`（持久化键 `dsh.sessions.current`）。归档会把当前会话清空，
 * 轮转跟随靠它感知「视图已离开旧会话」。
 */
export interface ClientSelectionStore {
  getSnapshot(): { readonly sessionId?: string };
  /** 选择变化通知；宿主版本缺该方法时退化为轮询。 */
  subscribe?(listener: () => void): () => void;
}

/**
 * 工作区导航：`uiWorkspace.openSession(id)`（`dsh-client-ui-workspace/lib/client.js:1471-1473`）。
 *
 * 宿主实装是同步换主视图引用（返回 void），不能对返回值 `.catch()`；返回类型用 `unknown`
 * 让调用方按“可能是同步也可能是 Promise”处理。
 */
export interface ClientWorkspace {
  openSession(sessionId: string): unknown;
  /** 导航选择 store；宿主版本没有时缺省（轮转跟随退化为会话面板轮询）。 */
  readonly selection?: ClientSelectionStore;
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
  /** 客户端事件订阅（与宿主同一套 cordis 事件）；宿主半不可用时缺省。 */
  on?(event: string, handler: (...args: readonly unknown[]) => void): () => void;
  /** 依赖注入：服务就绪后回调子上下文（与 `ui-agent-preset` 等客户端插件同一套 cordis API）。 */
  inject?(dependencies: readonly string[], callback: (scope: ClientContext) => void): unknown;
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
