import {
  createElement,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type FC,
} from "react";
import type { UndoAvailability, UndoTurnResponse } from "../contract.js";
import { clientService, hasMethod, type ClientContext } from "./contract.js";
import { ConfirmModal } from "./confirm-modal.js";
import { fetchUndoAvailability, HostApiError, runUndoTurn } from "./host-api.js";
import { toolkitClientState } from "./state.js";
import { ensureToolkitStyles } from "./stylesheet.js";

/** 撤回按钮的 props：slot 标准 props + 注册时注入的客户端上下文。 */
export interface UndoButtonProps {
  readonly sessionId: string;
  readonly ctx: ClientContext;
}

/** 「撤回」的图标：向左回转的箭头，尺寸与工具栏其它控件一致（14px）。 */
const UndoIcon: FC = () => {
  return createElement(
    "svg",
    {
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    createElement("path", { d: "M6.25 4.25 3 7.5l3.25 3.25" }),
    createElement("path", { d: "M3 7.5h6.25a3.25 3.25 0 0 1 0 6.5H7.5" }),
  );
};

/**
 * composer 工具栏的「撤回」按钮：位于模型选择左侧（`conversation.input.right`）。
 * 只负责确认与发起，执行在宿主：回到上一轮结束的状态、取回本轮输入、删除原会话。
 */
export const UndoButton: FC<UndoButtonProps> = (props) => {
  const tools = useSyncExternalStore(
    (listener: () => void) => toolkitClientState.subscribe(listener),
    () => toolkitClientState.getSnapshot(),
  );
  const enabled = tools.tools.find((tool) => tool.id === "undo-turn")?.enabled ?? true;
  const [availability, setAvailability] = useState<UndoAvailability | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchUndoAvailability(props.sessionId, controller.signal)
      .then((next) => setAvailability(next))
      .catch(() => setAvailability(undefined));
    return () => controller.abort();
  }, [enabled, props.sessionId]);

  const confirm = useCallback((): void => {
    setBusy(true);
    setError(undefined);
    runUndoTurn(props.sessionId)
      .then((result) => openUndone(props.ctx, result))
      .then(() => setOpen(false))
      .catch((reason: unknown) => setError(describe(reason)))
      .finally(() => setBusy(false));
  }, [props.ctx, props.sessionId]);

  if (!enabled) return null;
  ensureToolkitStyles();
  const available = availability?.available === true;
  return createElement(
    "div",
    { style: { display: "inline-flex", alignItems: "center" } },
    createElement(
      "button",
      {
        type: "button",
        title: available ? "撤回上一轮" : hintOf(availability),
        "aria-label": "撤回上一轮",
        disabled: !available || busy,
        className: "dshtk-undo-trigger",
        onClick: () => {
          setError(undefined);
          setOpen(true);
        },
      },
      createElement("span", { className: "dshtk-undo-trigger-icon" }, createElement(UndoIcon)),
      createElement("span", { className: "dshtk-undo-trigger-label" }, "撤回"),
    ),
    createElement(ConfirmModal, {
      open,
      title: "撤回这一轮会话？",
      message:
        "会话会回到上一轮结束的状态，本轮的用户输入回到输入框，原会话被删除。已执行的文件改动与命令不会回滚。",
      ...(availability?.prompt === undefined ? {} : { preview: availability.prompt }),
      confirmLabel: busy ? "正在撤回…" : "撤回",
      cancelLabel: "取消",
      busy,
      ...(error === undefined ? {} : { error }),
      onConfirm: confirm,
      onCancel: () => {
        if (busy) return;
        setOpen(false);
        setError(undefined);
      },
    }),
  );
};

/** 打开撤销得到的新会话，并把被撤销那一轮的用户原文放回输入框。 */
const openUndone = async (ctx: ClientContext, result: UndoTurnResponse): Promise<void> => {
  const workspace = clientService<{ openSession(id: string): Promise<unknown> }>(
    ctx,
    "uiWorkspace",
  );
  if (workspace !== undefined && typeof workspace.openSession === "function") {
    await workspace.openSession(result.childSessionId).catch(() => {});
  }
  if (result.prompt === "") return;
  const sessions = clientService<{ binding(id: string): unknown }>(ctx, "sessions");
  const conversation = clientService<{
    input?: { requestDraftInitialization?: (binding: unknown, options: object) => string };
  }>(ctx, "conversation");
  const initialize = conversation?.input?.requestDraftInitialization;
  if (!hasMethod<{ binding(id: string): unknown }>(sessions, "binding")) return;
  if (typeof initialize !== "function") return;
  const binding = await waitForBinding(sessions, result.childSessionId);
  if (binding === undefined) return;
  initialize.call(conversation?.input, binding, {
    prompt: result.prompt,
    whenDraftExists: "replace",
  });
};

/** 打开会话是异步的：短暂轮询等待 binding 出现。 */
const waitForBinding = async (
  sessions: { binding(id: string): unknown },
  sessionId: string,
): Promise<unknown> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const binding = sessions.binding(sessionId);
      if (binding !== undefined) return binding;
    } catch {
      // binding 尚未建立：继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
};

const hintOf = (availability: UndoAvailability | undefined): string => {
  switch (availability?.reason) {
    case "no-previous-turn":
      return "没有可回退的上一轮";
    case "session-not-live":
      return "会话尚未在宿主中打开";
    case "unsupported-host":
      return "当前宿主不支持撤回";
    case "tool-disabled":
      return "「撤回」工具已关闭";
    default:
      return "暂不可用";
  }
};

const describe = (reason: unknown): string => {
  if (reason instanceof HostApiError) return `撤回失败：${reason.message}`;
  if (reason instanceof Error) return `撤回失败：${reason.message}`;
  return "撤回失败：无法连接宿主";
};
