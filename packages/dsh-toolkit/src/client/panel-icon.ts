import { createElement, type FC } from "react";

/** 侧边栏图标收到的 owner props：边长与是否选中（`sidebar.panellist` 的契约）。 */
export interface PanelIconProps {
  readonly size?: number;
  readonly active?: boolean;
}

/**
 * toolkit 入口图标：一个工具箱轮廓，用 `currentColor` 跟随侧边栏选中态。
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
      "stroke-width": 1.4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    createElement("rect", { x: 2, y: 5.5, width: 12, height: 8, rx: 1.5 }),
    createElement("path", { d: "M6 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" }),
    createElement("path", { d: "M2 8.75h12" }),
  );
};
