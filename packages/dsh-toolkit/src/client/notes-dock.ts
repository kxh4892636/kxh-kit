import { createElement, useId, useState, type FC } from "react";
import {
  IconChecklistOutline14,
  IconChevronDownOutline14,
  IconChevronUpOutline14,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";

import { ensureToolkitStyles } from "./stylesheet.js";

/** 面板读取的会话投影键；与宿主 `notes-panel.ts` 一致。 */
export const NOTES_PROJECTION_KEY = "nanoFlowNotes";

/** 只挂本面板的 Agent 预设 id。 */
export const NANO_FLOW_PRESET = "nano-flow";

/** 面板展示的三态（完成的 note 不进来）。 */
export type PanelNoteStatus = "pending" | "in_progress" | "blocked";

/** 面板里的一条 note。 */
export interface PanelNote {
  readonly name: string;
  readonly status: PanelNoteStatus;
  readonly description: string;
}

/** 宿主写进投影的快照。 */
export interface NotesSnapshot {
  readonly planName: string;
  readonly planPath: string;
  readonly notes: readonly PanelNote[];
}

/** `conversation.input.dock` 会话插槽的标准 props（只声明本组件用到的）。 */
export interface NotesDockProps {
  readonly useProjection?: (key: string) => unknown;
}

const STATUS_LABEL: Record<PanelNoteStatus, string> = {
  in_progress: "进行中",
  blocked: "阻塞",
  pending: "待处理",
};

/** 14×14 的「进行中」圆环：业务色渐变 + CSS 旋转（与 Todo 面板同款）。 */
const ProgressGlyph: FC = () => {
  const gradientId = useId();
  return createElement(
    "svg",
    {
      width: 14,
      height: 14,
      viewBox: "0 0 14 14",
      fill: "none",
      "aria-hidden": "true",
      className: "dshtk-notes-glyph-progress",
    },
    createElement(
      "defs",
      null,
      createElement(
        "linearGradient",
        {
          id: gradientId,
          x1: "2.5",
          y1: "12",
          x2: "10.5",
          y2: "3.5",
          gradientUnits: "userSpaceOnUse",
        },
        createElement("stop", { stopColor: "currentColor" }),
        createElement("stop", { offset: "1", stopColor: "currentColor", stopOpacity: "0" }),
      ),
    ),
    createElement("circle", {
      cx: "7",
      cy: "7",
      r: "6.4",
      stroke: `url(#${gradientId})`,
      strokeWidth: "1.2",
    }),
  );
};

/** 14×14 的虚线圆环：待处理（灰）与阻塞（错误色）共用形状，颜色由 class 决定。 */
const RingGlyph: FC<{ readonly blocked: boolean }> = ({ blocked }) =>
  createElement(
    "svg",
    {
      width: 14,
      height: 14,
      viewBox: "0 0 14 14",
      fill: "none",
      "aria-hidden": "true",
      className: blocked ? "dshtk-notes-glyph-blocked" : "dshtk-notes-glyph-pending",
    },
    createElement("circle", {
      cx: "7",
      cy: "7",
      r: "6.4",
      stroke: "currentColor",
      strokeWidth: "1.2",
      strokeDasharray: "2.4 2.4",
    }),
  );

const StatusGlyph: FC<{ readonly status: PanelNoteStatus }> = ({ status }) => {
  if (status === "in_progress") return createElement(ProgressGlyph);
  return createElement(RingGlyph, { blocked: status === "blocked" });
};

const countLabel = (notes: readonly PanelNote[]): string => {
  const counts: Record<PanelNoteStatus, number> = { in_progress: 0, blocked: 0, pending: 0 };
  for (const note of notes) counts[note.status] += 1;
  return (["in_progress", "blocked", "pending"] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${STATUS_LABEL[status]}`)
    .join(" · ");
};

/** 面板本体：默认展开，点标题折叠。 */
const NotesPanelView: FC<{ readonly useProjection: (key: string) => unknown }> = ({
  useProjection,
}) => {
  ensureToolkitStyles();
  const [collapsed, setCollapsed] = useState(false);
  const preset = useProjection("agentPreset");
  const snapshot = useProjection(NOTES_PROJECTION_KEY) as NotesSnapshot | null | undefined;
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
        createElement(
          "span",
          { className: "dshtk-notes-lead", "aria-hidden": "true" },
          createElement(IconChecklistOutline14, {}),
        ),
        createElement("span", { className: "dshtk-notes-title" }, "Note"),
        createElement("span", { className: "dshtk-notes-progress" }, summary),
        createElement(
          "span",
          { className: "dshtk-notes-chevron", "aria-hidden": "true" },
          collapsed
            ? createElement(IconChevronDownOutline14, {})
            : createElement(IconChevronUpOutline14, {}),
        ),
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
                createElement(
                  "span",
                  { className: "dshtk-notes-glyph", "aria-hidden": "true" },
                  createElement(StatusGlyph, { status: note.status }),
                ),
                createElement(
                  Tooltip,
                  { label: note.description, side: "top", delayMs: 200 },
                  createElement("span", { className: "dshtk-notes-content" }, note.name),
                ),
              ),
            ),
          ),
    ),
  );
};

/**
 * 输入框上方的未完成 note 面板：只在 nano-flow 预设会话、且宿主投影有快照时渲染。
 * @param props - 会话插槽标准 props（`useProjection`）。
 * @returns 面板或 `null`。
 */
export const NotesDock: FC<NotesDockProps> = (props) => {
  const useProjection = props.useProjection;
  if (typeof useProjection !== "function") return null;
  return createElement(NotesPanelView, { useProjection });
};
