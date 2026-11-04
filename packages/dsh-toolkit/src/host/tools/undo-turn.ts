import { TOOL_IDS } from "../../contract.js";
import type { ToolkitTool } from "../toolkit-registry.js";

/**
 * 「撤回」工具：宿主半没有常驻状态，执行入口是 `POST api/toolkit/undo-turn`，
 * 路由按 `undo-turn` 的开关决定是否放行。这里只声明目录项，让面板与按钮共用同一开关。
 */
export const createUndoTurnTool = (): ToolkitTool => ({
  id: TOOL_IDS.undoTurn,
  title: "撤回",
  description: "在会话工具栏加一个「撤回」按钮：确认后回到上一轮结束的状态并取回本轮输入。",
  defaultEnabled: false,
  apply: () => () => {},
});
