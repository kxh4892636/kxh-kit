import type { Context } from "@deepseek-ai/cordis";

import { serviceOf } from "../host/services.js";
import { selectedPreset, type RotationEngine, type RotationSession } from "./rotate.js";

/** 命令 handler 的返回；只用到 success/error 两态。 */
export type RotateCommandResult =
  | { readonly kind: "success"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

/** commands 注册表的最小形状（`dsh-commands` 的 `CommandRuntime.register`）。 */
export interface CommandsLike {
  register(definition: {
    readonly name: string;
    readonly description: string;
    readonly handler: (invocation: RotateCommandInvocation) => Promise<RotateCommandResult>;
  }): () => void;
}

/** `CommandInvocation` 里本插件用到的字段。 */
export interface RotateCommandInvocation {
  readonly agent?: { readonly session?: unknown };
  readonly rawInput?: string;
  readonly signal?: AbortSignal;
}

const USAGE = "用法：/rotate（不接受参数）";

/**
 * 注册 `/rotate`：立即轮转到新会话（建新会话 + seed + 退役旧会话）。
 *
 * 宿主没有 commands 服务时静默跳过，其它命令不受影响。
 * @param ctx - 宿主上下文（须能看到 commands 服务）。
 * @param engine - 已创建的轮转引擎。
 * @param presetId - 允许使用该命令的预设 id。
 * @returns 注销命令的 disposer。
 */
export const registerRotateCommand = (
  ctx: Context,
  engine: RotationEngine,
  presetId: string,
): (() => void) => {
  const commands = serviceOf<CommandsLike>(ctx, "commands");
  if (commands === undefined || typeof commands.register !== "function") return () => {};
  return commands.register({
    name: "rotate",
    description: "立即轮转到新会话（仅 Nano Flow 会话）",
    async handler(invocation) {
      if ((invocation.rawInput ?? "").trim() !== "") return { kind: "error", text: USAGE };
      const session = invocation.agent?.session as RotationSession | undefined;
      if (session === undefined || typeof session.id !== "string") {
        return { kind: "error", text: "/rotate 需要一个会话上下文" };
      }
      if (selectedPreset(session) !== presetId) {
        return { kind: "error", text: "/rotate 仅在 Nano Flow 会话可用" };
      }
      const result = await engine.rotate(session, invocation.signal);
      if (!result.accepted) return { kind: "error", text: "轮转没有完成，请重试" };
      return { kind: "success", text: "已轮转到新会话，正在执行只读恢复。" };
    },
  });
};
