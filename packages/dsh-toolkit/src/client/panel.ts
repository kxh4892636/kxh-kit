import { createElement, useCallback, useEffect, useState, type FC } from "react";
import type { ToolkitToolInfo } from "../contract.js";
import { fetchToolkitState, HostApiError, setToolEnabled } from "./host-api.js";
import { toolkitClientState } from "./state.js";
import {
  bodyTextStyle,
  errorTextStyle,
  knobStyle,
  pageStyle,
  rowLayoutStyle,
  stackStyle,
  titleTextStyle,
  toggleStyle,
} from "./styles.js";

const panelTitleStyle = { fontSize: 16, fontWeight: 600 } as const;

/**
 * 侧边栏 `toolkit` 主面板：列出每个工具与独立开关。
 * 组件不接收 owner props；开关状态通过宿主路由读写，同时发布到客户端 store 供撤回按钮复用。
 */
export const ToolkitPanel: FC = () => {
  const [tools, setTools] = useState<readonly ToolkitToolInfo[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | undefined>(undefined);

  const apply = useCallback((next: readonly ToolkitToolInfo[]): void => {
    setTools(next);
    toolkitClientState.publish(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchToolkitState(controller.signal)
      .then((next) => {
        apply(next);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describe(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apply]);

  const toggle = useCallback(
    (tool: ToolkitToolInfo): void => {
      setPending(tool.id);
      setToolEnabled(tool.id, !tool.enabled)
        .then((next) => {
          apply(next);
          setError(undefined);
        })
        .catch((reason: unknown) => setError(describe(reason)))
        .finally(() => setPending(undefined));
    },
    [apply],
  );

  const rows = tools.map((tool) =>
    renderRow(tool, pending === tool.id, () => {
      toggle(tool);
    }),
  );

  return createElement(
    "div",
    { style: pageStyle },
    createElement(
      "div",
      { style: stackStyle },
      createElement("div", { style: panelTitleStyle }, "toolkit"),
      createElement(
        "div",
        { style: bodyTextStyle },
        "工作区自研的工具集合。每个工具可以单独开关，开关状态保存在宿主侧，刷新与重启后保持。",
      ),
      error === undefined ? null : createElement("div", { style: errorTextStyle }, error),
      loading
        ? createElement("div", { style: bodyTextStyle }, "正在读取工具状态…")
        : createElement("div", { style: stackStyle }, ...rows),
    ),
  );
};

const renderRow = (tool: ToolkitToolInfo, busy: boolean, onToggle: () => void) => {
  return createElement(
    "div",
    { key: tool.id, style: rowLayoutStyle },
    createElement(
      "div",
      { style: stackStyle },
      createElement("div", { style: titleTextStyle }, tool.title),
      createElement("div", { style: bodyTextStyle }, tool.description),
    ),
    createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": tool.enabled,
        "aria-label": tool.title,
        disabled: busy,
        style: toggleStyle(tool.enabled, busy),
        onClick: onToggle,
      },
      createElement("span", { style: knobStyle(tool.enabled) }),
    ),
  );
};

const describe = (reason: unknown): string => {
  if (reason instanceof HostApiError) return `操作失败：${reason.message}`;
  if (reason instanceof Error) return `操作失败：${reason.message}`;
  return "操作失败：无法连接宿主";
};
