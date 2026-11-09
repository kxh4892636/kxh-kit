import { createElement, type FC } from "react";

/** 侧边栏图标收到的 owner props：边长与是否选中（`sidebar.panellist` 的契约）。 */
interface PanelIconProps {
  readonly size?: number;
  readonly active?: boolean;
}

/**
 * toolkit 入口图标：一个工具箱轮廓。
 *
 * 与宿主图标同一套画法：`viewBox 0 0 16 16`、`fill=none`、`stroke=currentColor`、
 * **`stroke-width=1`**（宿主全部图标都是 1）、圆头圆角，因此视觉粗细与「插件」「自动化任务」
 * 一致；尺寸由 owner props 的 `size` 决定（收起态 18、展开态 16）。
 */
export const ToolkitPanelIcon: FC<PanelIconProps> = (props) => {
  const size = props.size ?? 16;
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    createElement("rect", { x: 2.5, y: 5.5, width: 11, height: 8, rx: 1.5 }),
    createElement("path", { d: "M6 5.5V4.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75V5.5" }),
    createElement("path", { d: "M2.5 8.5h11" }),
  );
};
