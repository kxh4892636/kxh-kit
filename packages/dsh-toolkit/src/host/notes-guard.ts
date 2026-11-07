import type { Context } from "@deepseek-ai/cordis";
import { hasMethod, serviceOf } from "./services.js";

/**
 * Plan 下 `notes.json` 的访问收口（策略级）。
 *
 * 两道闸门按「看得见的通道」分工：
 * - `tools.guard`：工具层的**显式引用**。`nano_flow_*` 放行；其余工具只要参数里的路径类
 *   字段指向 Plan 的 `notes.json`（含 shell 命令里的字面路径）就拒绝。
 * - `ctx.fs` 包装：任何经 `ctx.fs` 的内容读写（`read` / `write` / `edit` / `read_image` 等）
 *   按**已解析的 target** 拒绝，相对路径与别名都绕不过。
 *
 * 这不是安全边界：shell 子进程、`jobs`、ripgrep 泛搜与编码过的路径都能绕过；
 * `nano_flow_*` 自己用 `node:fs`，不受包装影响。边界写在 README 与 `.agents/domains/dsh/QUESTIONS.md`。
 */

/** 受保护的文件名（比较时统一小写）。 */
const NOTES_FILE = "notes.json";

/** Plan 的目录段：`plans/<lifecycle>/<name>/notes.json`。 */
const PLAN_SEGMENT = "plans";

/** 参数里可能是路径的字段；`content` / `old_string` 这类正文不扫，避免写文档时误伤。 */
const PATH_ARGUMENT_KEYS: ReadonlySet<string> = new Set(["file_path", "path", "target"]);

/** 取值是整段命令的字段：在里面找 Plan notes.json 的字面路径。 */
const COMMAND_ARGUMENT_KEYS: ReadonlySet<string> = new Set(["command", "script"]);

/** 命令字符串里对 Plan notes.json 的引用；后向边界挡掉 `notes.json.bak` 这类同前缀文件。 */
const PLAN_NOTES_REFERENCE = /(?:^|[/\\])plans[/\\](?:[^/\\\s"']+[/\\])+notes\.json(?![\w.-])/i;

/** `ctx.fs` 上要包装的内容读写方法；`nano_flow_*` 不走这里。 */
const GUARDED_FS_METHODS = [
  "readText",
  "streamText",
  "readBytes",
  "readByteRange",
  "writeText",
  "editText",
] as const;

/** 一个工具调用的最小形状（`tools.guard` 收到的执行描述就是它的超集）。 */
export interface ToolCallLike {
  readonly name: string;
  readonly arguments: unknown;
}

/** 工具注册表里本模块用到的入口。 */
interface ToolGuardRegistry {
  guard(guard: (call: Readonly<ToolCallLike>) => string | undefined): () => void;
}

/**
 * 路径是否是 Plan 的 `notes.json`：最后一段是 `notes.json`，且祖先里有 `plans` 段。
 *
 * 只看段而不认盘符/根，`C:\…` 与 `/…`、正反斜杠、大小写都归一；工作区里其它同名
 * `notes.json`（例如 `docs/notes.json`）不受影响。
 * @param path - 已解析或用户给出的文件路径。
 * @returns 命中即 true。
 */
export const isPlanNotesPath = (path: string): boolean => {
  const segments = path.replaceAll("\\", "/").toLowerCase().split("/");
  if (segments.at(-1) !== NOTES_FILE) return false;
  return segments.slice(0, -1).includes(PLAN_SEGMENT);
};

/**
 * 工具层闸门：非 `nano_flow_*` 工具的参数显式引用 Plan 的 `notes.json` 时返回拒绝原因。
 * @param call - 工具名与已解析的参数。
 * @returns 拒绝原因；放行时 undefined。
 */
export const notesToolGuard = (call: Readonly<ToolCallLike>): string | undefined => {
  if (call.name.startsWith("nano_flow_")) return undefined;
  if (!mentionsPlanNotes(call.arguments)) return undefined;
  return `notes.json 只能经 nano_flow_read / nano_flow_write 读写：${call.name} 的参数引用了 Plan 的 notes.json`;
};

/** `ctx.fs` 层的拒绝：`code` 与宿主的 fs 错误词表同名，上层可按码分支。 */
export class NotesAccessDeniedError extends Error {
  readonly code = "FS_PERMISSION_DENIED";
  readonly path: string;

  constructor(path: string) {
    super(`notes.json 只能经 nano_flow_read / nano_flow_write 读写：${path}`);
    this.name = "NotesAccessDeniedError";
    this.path = path;
  }
}

/**
 * 包装 `ctx.fs` 的内容读写：目标是 Plan 的 `notes.json` 时直接拒绝。
 *
 * 就地替换实例上的方法（与 `skill-mask` 同一手法），不注销 provider；`nano_flow_*` 用
 * `node:fs` 读写，不受影响。返回的 disposer 只在方法仍是本次安装的包装器时还原。
 * @param fs - 宿主文件系统服务；形状不符时原样返回一个空 disposer。
 * @returns 还原全部被包装方法的 disposer。
 */
export const installFsNotesGuard = (fs: unknown): (() => void) => {
  if (typeof fs !== "object" || fs === null) return () => {};
  const target = fs as Record<string, unknown>;
  const previous = new Map<string, unknown>();
  const installed = new Map<string, (...args: unknown[]) => unknown>();
  const owned = new Map<string, boolean>();
  for (const method of GUARDED_FS_METHODS) {
    const original = Reflect.get(target, method);
    if (typeof original !== "function") continue;
    const call = (original as (...args: unknown[]) => unknown).bind(fs);
    // 六个方法都按 Promise 契约声明：拒绝也走 reject，调用方不必区分同步抛错。
    const guarded = async (...args: unknown[]): Promise<unknown> => {
      const path = targetPathOf(fs, args[0]);
      if (path !== undefined && isPlanNotesPath(path)) throw new NotesAccessDeniedError(path);
      return await call(...args);
    };
    previous.set(method, original);
    owned.set(method, Object.hasOwn(target, method));
    installed.set(method, guarded);
    target[method] = guarded;
  }
  return () => {
    for (const [method, guarded] of installed) {
      if (target[method] !== guarded) continue;
      if (owned.get(method) === true) target[method] = previous.get(method);
      else Reflect.deleteProperty(target, method);
    }
  };
};

/**
 * 安装两道闸门。
 * @param ctx - 插件上下文；需能取到 `tools` 与 `fs`。
 * @param logger - 服务缺席或形状不符时的告警出口。
 * @returns 还原两道闸门的 disposer。
 */
export const installNotesGuard = (
  ctx: Context,
  logger: { warn(message: string): void },
): (() => void) => {
  const disposers: Array<() => void> = [];
  const tools = serviceOf<ToolGuardRegistry>(ctx, "tools");
  if (tools === undefined) {
    logger.warn("toolkit: tools service is absent; notes.json 只做 fs 层收口");
  } else if (!hasMethod<ToolGuardRegistry>(tools, "guard")) {
    logger.warn("toolkit: tools service has no guard(); notes.json 只做 fs 层收口");
  } else {
    disposers.push(tools.guard(notesToolGuard));
  }
  disposers.push(installFsNotesGuard(serviceOf<object>(ctx, "fs")));
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
};

/** 参数里是否有路径类字段引用了 Plan 的 `notes.json`。 */
const mentionsPlanNotes = (args: unknown): boolean => {
  if (typeof args !== "object" || args === null) return false;
  for (const [key, value] of Object.entries(args)) {
    if (PATH_ARGUMENT_KEYS.has(key) || COMMAND_ARGUMENT_KEYS.has(key)) {
      if (referencesPlanNotes(key, value)) return true;
    }
  }
  return false;
};

/** 单个字段的判定：命令按字面引用搜，路径按整段匹配（含数组形态的参数）。 */
const referencesPlanNotes = (key: string, value: unknown): boolean => {
  if (Array.isArray(value)) return value.some((item) => referencesPlanNotes(key, item));
  if (typeof value !== "string" || value === "") return false;
  return COMMAND_ARGUMENT_KEYS.has(key) ? PLAN_NOTES_REFERENCE.test(value) : isPlanNotesPath(value);
};

/** target 的绝对路径：优先问后端要 `processPath`，不提供时退回 `displayPath`。 */
const targetPathOf = (fs: unknown, target: unknown): string | undefined => {
  if (typeof target !== "object" || target === null) return undefined;
  const processPath = (fs as { processPath?: unknown }).processPath;
  if (typeof processPath === "function") {
    try {
      const path = (processPath as (value: unknown) => unknown).call(fs, target);
      if (typeof path === "string" && path !== "") return path;
    } catch {
      // 后端没有进程路径（远端执行世界）：退回展示路径。
    }
  }
  const display = (target as { displayPath?: unknown }).displayPath;
  return typeof display === "string" && display !== "" ? display : undefined;
};
