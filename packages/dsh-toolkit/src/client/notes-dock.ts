import {
  Component,
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type FC,
  type ReactNode,
} from "react";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";

import {
  NANO_FLOW_NOTES_REFRESH_MS,
  type NotesSnapshot,
  type PanelNote,
  type PanelNoteStatus,
} from "../contract.js";
import { followRotation, rotationFollowInstalled } from "./rotation-follow.js";
import { fetchNanoFlowNotes } from "./host-api.js";
import { ensureToolkitStyles } from "./stylesheet.js";
import type { ClientContext } from "./contract.js";

export type { NotesSnapshot, PanelNote, PanelNoteStatus } from "../contract.js";

/** 只挂本面板的 Agent 预设 id。 */
export const NANO_FLOW_PRESET = "nano-flow";

/** `conversation.input.dock` 会话插槽的标准 props（只声明本组件用到的）。 */
export interface NotesDockProps {
  /** 当前会话 id；标准 session 插槽会传入。 */
  readonly sessionId?: string;
  /** 预设投影读取函数；标准 session 插槽会传入。 */
  readonly useProjection?: (key: string) => unknown;
  /** 会话快照选择器；`sessionId` 缺席时用它兜底取 id。 */
  readonly useSession?: <S>(selector: (snapshot: NotesSessionSnapshot) => S) => S;
  /** 注册时注入的客户端上下文（轮转跟随要用 `sessions` / `uiWorkspace`）。 */
  readonly ctx?: ClientContext;
}

/** 只声明本组件用到的会话快照字段。 */
export interface NotesSessionSnapshot {
  readonly sessionId: string;
}

/** 状态中文名：行首直接展示，不再使用图标。 */
const STATUS_LABEL: Record<PanelNoteStatus, string> = {
  in_progress: "进行中",
  blocked: "阻塞",
  pending: "待处理",
};

/** 宿主 primitives 的导出在插件 bundle 里可能拿到 undefined；只有可真渲染时才复用。 */
const isRenderable = (value: unknown): boolean =>
  typeof value === "function" ||
  (typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly $$typeof?: unknown }).$$typeof !== "undefined");

/**
 * 悬浮提示的多行文本：描述在最前，有原因与下一步时各占一行。
 *
 * 宿主 `Tooltip` 的气泡是 `white-space: pre-line`，`\n` 会渲染成换行；
 * 原生 `title` 兜底同样按行显示。
 * @param note - 面板条目。
 * @returns 以换行分隔的标签。
 */
const tooltipLabel = (note: PanelNote): string => {
  const lines = [note.description.trim()].filter((line) => line !== "");
  if (note.reason !== undefined) lines.push(`原因：${note.reason}`);
  if (note.nextStep !== undefined) lines.push(`下一步：${note.nextStep}`);
  return lines.join("\n");
};

/**
 * 悬浮提示：宿主 `Tooltip` 的深色气泡（`--dsw-alias-tooltip-bg` + 白字），
 * 锚点由调用方给的整行元素承担；宿主没导出时退回原生 `title`。
 */
const NotesTooltip: FC<{ readonly note: PanelNote; readonly children?: ReactNode }> = isRenderable(
  Tooltip,
)
  ? ({ note, children }) =>
      createElement(
        Tooltip,
        { label: tooltipLabel(note), side: "top", delayMs: 200, portal: true },
        children,
      )
  : ({ note, children }) => createElement("span", { title: tooltipLabel(note) }, children);

/** 渲染错误边界：面板内部异常时降级为不渲染，不拖垮整个插槽。 */
interface BoundaryProps {
  readonly children?: ReactNode;
}

let boundaryClass: ComponentType<BoundaryProps> | undefined;

/**
 * 惰性构造错误边界类（模块顶层直接 `class extends Component` 会在加载期拿到未就绪的 React）。
 * @returns 可复用的错误边界组件类。
 */
const getBoundaryClass = (): ComponentType<BoundaryProps> => {
  if (boundaryClass !== undefined) return boundaryClass;
  boundaryClass = class NotesBoundary extends Component<BoundaryProps, { failed: boolean }> {
    constructor(props: BoundaryProps) {
      super(props);
      this.state = { failed: false };
    }

    static getDerivedStateFromError(): { failed: boolean } {
      return { failed: true };
    }

    override render(): ReactNode {
      return this.state.failed ? null : this.props.children;
    }
  };
  return boundaryClass;
};

const countLabel = (notes: readonly PanelNote[]): string => {
  const counts: Record<PanelNoteStatus, number> = { in_progress: 0, blocked: 0, pending: 0 };
  for (const note of notes) counts[note.status] = (counts[note.status] ?? 0) + 1;
  return (["in_progress", "blocked", "pending"] as const)
    .filter((status) => (counts[status] ?? 0) > 0)
    .map((status) => `${counts[status] ?? 0} ${STATUS_LABEL[status]}`)
    .join(" · ");
};

/** 面板本体：默认折叠，可展开；挂载时轮询宿主快照。 */
const NotesPanelView: FC<{
  readonly sessionId: string;
  readonly useProjection: (key: string) => unknown;
  readonly ctx?: ClientContext;
}> = ({ sessionId, useProjection, ctx }) => {
  ensureToolkitStyles();
  const [collapsed, setCollapsed] = useState(true);
  const [snapshot, setSnapshot] = useState<NotesSnapshot | null | undefined>(undefined);
  const preset = useProjection("agentPreset");
  useEffect(() => {
    if (preset !== NANO_FLOW_PRESET) {
      setSnapshot(undefined);
      return;
    }
    const controller = new AbortController();
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const load = (): void => {
      // 轮转只能自动触发：根级订阅是主路径，没装上时才用这里的 5s 轮询兜底。
      if (ctx !== undefined && !rotationFollowInstalled()) void followRotation(ctx, sessionId);
      fetchNanoFlowNotes(sessionId, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setSnapshot(next);
          // 会话刚打开时宿主可能还没登记，1s 后再试几次。
          if (next === null && retries < 3) {
            retries += 1;
            retryTimer = setTimeout(load, 1_000);
          }
        })
        .catch(() => {
          // 宿主路由不可达或响应损坏时保持上一次快照；面板下次轮询再试。
        });
    };
    load();
    const timer = setInterval(load, NANO_FLOW_NOTES_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [ctx, preset, sessionId]);
  if (preset !== NANO_FLOW_PRESET) return null;
  if (snapshot === null || snapshot === undefined) return null;
  if (snapshot.notes.length === 0) return null;
  const summary = countLabel(snapshot.notes);
  return createElement(
    "section",
    {
      className: "dshtk-notes",
      "data-testid": "nano-flow-notes-panel",
      "aria-label": "Note",
    },
    createElement(
      "div",
      { className: "dshtk-notes-body" },
      createElement(
        "button",
        {
          type: "button",
          className: "dshtk-notes-header",
          "aria-expanded": String(!collapsed),
          onClick: () => {
            setCollapsed((value) => !value);
          },
        },
        createElement("span", { className: "dshtk-notes-title" }, "Note"),
        createElement("span", { className: "dshtk-notes-progress" }, summary),
        createElement("span", { className: "dshtk-notes-toggle" }, collapsed ? "展开" : "收起"),
      ),
      collapsed
        ? null
        : createElement(
            "ul",
            { className: "dshtk-notes-list" },
            snapshot.notes.map((note) =>
              createElement(
                "li",
                {
                  key: note.name,
                  className: "dshtk-notes-item",
                  "data-status": note.status,
                },
                // 悬浮区是整行：状态名与标题都算「对应项」，只挂在标题上会漏掉大部分行宽。
                createElement(
                  NotesTooltip,
                  { note },
                  createElement(
                    "span",
                    { className: "dshtk-notes-row" },
                    createElement(
                      "span",
                      { className: "dshtk-notes-status" },
                      STATUS_LABEL[note.status],
                    ),
                    createElement("span", { className: "dshtk-notes-content" }, note.name),
                  ),
                ),
              ),
            ),
          ),
    ),
  );
};

/** 没有 `useSession` prop 时的兜底：不读取任何会话状态。 */
const noSessionHook = <S>(selector: (snapshot: NotesSessionSnapshot) => S): S =>
  selector({ sessionId: "" });

/**
 * 输入框上方的未完成 note 面板：只在 nano-flow 预设会话里轮询宿主快照。
 * @param props - 会话插槽标准 props（`sessionId` / `useProjection` / `useSession`）。
 * @returns 面板或 `null`。
 */
export const NotesDock: FC<NotesDockProps> = (props) => {
  const useSession = props.useSession ?? noSessionHook;
  const derived = useSession((snapshot) => snapshot.sessionId);
  const sessionId = props.sessionId ?? derived;
  const useProjection = props.useProjection;
  if (typeof useProjection !== "function") return null;
  if (sessionId === "" || sessionId === undefined) return null;
  return createElement(
    getBoundaryClass(),
    null,
    createElement(NotesPanelView, {
      sessionId,
      useProjection,
      ...(props.ctx === undefined ? {} : { ctx: props.ctx }),
    }),
  );
};
