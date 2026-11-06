import { createElement, useEffect, useState, type FC } from "react";
import type { NanoFlowNoteStatus, NanoFlowReadyResponse } from "../contract.js";
import { fetchNanoFlowReady } from "./host-api.js";
import { ensureToolkitStyles } from "./stylesheet.js";

ensureToolkitStyles();

/** 面板轮询间隔；宿主也有 focus 刷新。 */
const REFRESH_MS = 3000;

/** `conversation.input.dock` 送来的字段；只读会话 id 与当前会话快照。 */
export interface SessionSnapshotLike {
  readonly projectionValues?: { readonly agentPreset?: string | null };
}

export interface ReadyPanelProps {
  readonly sessionId?: string;
  readonly session?: { readonly sessionId?: string };
  readonly useSession?: <S>(selector: (snapshot: SessionSnapshotLike) => S) => S;
}

const LeadIcon: FC = () => {
  return createElement(
    "svg",
    {
      viewBox: "0 0 14 14",
      width: 14,
      height: 14,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    createElement("rect", { x: 2, y: 2, width: 10, height: 10, rx: 2 }),
    createElement("path", { d: "M4.6 7.1 6.2 8.7 9.5 5.4" }),
  );
};

const Chevron: FC<{ open: boolean }> = ({ open }) => {
  return createElement(
    "svg",
    {
      viewBox: "0 0 14 14",
      width: 14,
      height: 14,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    },
    createElement("path", { d: open ? "M3.5 5.5 7 9l3.5-3.5" : "M3.5 8.5 7 5l3.5 3.5" }),
  );
};

const StatusGlyph: FC<{ status: NanoFlowNoteStatus }> = ({ status }) => {
  const className = `dshtk-ready-glyph-${status}`;
  if (status === "in_progress") {
    return createElement(
      "svg",
      { viewBox: "0 0 14 14", width: 14, height: 14, className, "aria-hidden": "true" },
      createElement("circle", {
        cx: 7,
        cy: 7,
        r: 6.4,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.2,
        strokeLinecap: "round",
        strokeDasharray: "10 3",
      }),
    );
  }
  if (status === "blocked") {
    return createElement(
      "svg",
      { viewBox: "0 0 14 14", width: 14, height: 14, className, "aria-hidden": "true" },
      createElement("circle", {
        cx: 7,
        cy: 7,
        r: 6.4,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.2,
      }),
      createElement("path", {
        d: "M7 4.2v3.6",
        stroke: "currentColor",
        strokeWidth: 1.2,
        strokeLinecap: "round",
      }),
      createElement("circle", { cx: 7, cy: 10.2, r: 0.7, fill: "currentColor" }),
    );
  }
  return createElement(
    "svg",
    { viewBox: "0 0 14 14", width: 14, height: 14, className, "aria-hidden": "true" },
    createElement("circle", {
      cx: 7,
      cy: 7,
      r: 6.4,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      strokeDasharray: "2.4 2.4",
    }),
  );
};

/**
 * 输入框上方的 Nano Flow 列表：按依赖组展示未完成 notes，默认折叠。
 *
 * 只读普通 JSON 路由；浏览器每 3s 与窗口 focus 时刷新。不是 Nano Flow 会话、
 * 没有 active Plan 或全部完成时渲染 null。
 */
export const ReadyPanel: FC<ReadyPanelProps> = (props) => {
  const sessionId = props.sessionId ?? props.session?.sessionId;
  const preset = props.useSession?.((snapshot) => snapshot.projectionValues?.agentPreset);
  const isNanoFlow = preset === undefined || preset === "nano-flow";
  const [state, setState] = useState<NanoFlowReadyResponse | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (!isNanoFlow || sessionId === undefined) {
      setState(undefined);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = (): void => {
      fetchNanoFlowReady(sessionId, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) setState(next);
        })
        .catch(() => {
          if (!controller.signal.aborted) setState(undefined);
        });
    };
    load();
    timer = setInterval(load, REFRESH_MS);
    const onFocus = (): void => {
      load();
    };
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      if (timer !== undefined) clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
    };
  }, [sessionId, isNanoFlow]);

  if (!isNanoFlow || sessionId === undefined) return null;
  if (state === undefined || state.available !== true) return null;
  const groups = state.groups;
  const counts = state.counts;
  if (groups === undefined || counts === undefined || groups.length === 0) return null;
  const unfinished = counts.pending + counts.in_progress + counts.blocked;
  if (unfinished === 0) return null;

  const summaryParts = [`${unfinished} 未完成`];
  if (counts.in_progress > 0) summaryParts.push(`${counts.in_progress} 进行中`);
  if (counts.blocked > 0) summaryParts.push(`${counts.blocked} 阻塞`);
  if (counts.completed > 0) summaryParts.push(`${counts.completed} 已完成`);
  const planRef =
    state.plan === undefined
      ? "Nano Flow"
      : `${state.plan.domain}/${state.plan.lifecycle}/${state.plan.name}`;

  return createElement(
    "section",
    {
      className: "dshtk-ready",
      "data-testid": "nano-flow-ready",
      "aria-label": "Nano Flow",
    },
    createElement(
      "div",
      { className: "dshtk-ready-body" },
      createElement(
        "button",
        {
          type: "button",
          className: "dshtk-ready-header",
          "aria-expanded": !collapsed,
          title: planRef,
          onClick: () => setCollapsed((value) => !value),
        },
        createElement(
          "span",
          { className: "dshtk-ready-lead", "aria-hidden": "true" },
          createElement(LeadIcon, null),
        ),
        createElement("span", { className: "dshtk-ready-title" }, "Nano Flow"),
        createElement("span", { className: "dshtk-ready-progress" }, summaryParts.join(" · ")),
        createElement(
          "span",
          { className: "dshtk-ready-chevron", "aria-hidden": "true" },
          createElement(Chevron, { open: !collapsed }),
        ),
      ),
      collapsed
        ? null
        : createElement(
            "div",
            { className: "dshtk-ready-list" },
            groups.map((group, groupIndex) =>
              createElement(
                "div",
                { className: "dshtk-ready-group", key: `group-${groupIndex}` },
                createElement(
                  "div",
                  { className: "dshtk-ready-group-label" },
                  `第 ${groupIndex + 1} 组`,
                ),
                group.notes.map((note) =>
                  createElement(
                    "div",
                    {
                      className: "dshtk-ready-item",
                      key: note.id,
                      "data-status": note.status,
                      title: note.description,
                    },
                    createElement(
                      "span",
                      { className: "dshtk-ready-glyph", "aria-hidden": "true" },
                      createElement(StatusGlyph, { status: note.status }),
                    ),
                    createElement("span", { className: "dshtk-ready-id" }, note.id),
                    createElement("span", { className: "dshtk-ready-item-title" }, note.title),
                    note.status === "blocked" && note.blocked_reason !== undefined
                      ? createElement(
                          "span",
                          { className: "dshtk-ready-reason" },
                          note.blocked_reason,
                        )
                      : null,
                  ),
                ),
              ),
            ),
          ),
    ),
  );
};
