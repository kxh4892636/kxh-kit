import { createElement, useCallback, useEffect, useState, type FC } from "react";
import { Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ToolkitToolInfo } from "../contract.js";
import { fetchToolkitState, HostApiError, setToolEnabled } from "./host-api.js";
import { toolkitClientState } from "./state.js";
import { ensureToolkitStyles } from "./stylesheet.js";

/**
 * 侧边栏 `toolkit` 主面板：列出每个工具与独立开关。
 *
 * 结构与样式都按宿主设置页的 section/rowCard 来（见 stylesheet.ts），开关直接用
 * 宿主 `ui-primitives` 的 `Switch`，因此观感与「设置 → 通用」里的开关一致。
 * 组件不接收 owner props；开关状态同时发布到客户端 store 供撤回按钮复用。
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
    (tool: ToolkitToolInfo, enabled: boolean): void => {
      setPending(tool.id);
      setToolEnabled(tool.id, enabled)
        .then((next) => {
          apply(next);
          setError(undefined);
        })
        .catch((reason: unknown) => setError(describe(reason)))
        .finally(() => setPending(undefined));
    },
    [apply],
  );

  ensureToolkitStyles();
  return createElement(
    "div",
    { className: "dshtk-panel" },
    createElement(
      "div",
      { className: "dshtk-section" },
      createElement("h1", { className: "dshtk-title" }, "toolkit"),
      createElement(
        "p",
        { className: "dshtk-intro" },
        "工作区自研的工具集合。每个工具可以单独开关，开关状态保存在宿主侧，刷新与重启后保持。",
      ),
      error === undefined ? null : createElement("p", { className: "dshtk-notice" }, error),
      loading
        ? createElement("p", { className: "dshtk-row-hint" }, "正在读取工具状态…")
        : createElement(
            "ul",
            { className: "dshtk-rows" },
            ...tools.map((tool) =>
              renderRow(tool, pending === tool.id, (enabled) => toggle(tool, enabled)),
            ),
          ),
    ),
  );
};

const renderRow = (tool: ToolkitToolInfo, busy: boolean, onChange: (enabled: boolean) => void) => {
  return createElement(
    "li",
    { key: tool.id, className: "dshtk-row-card" },
    createElement(
      "div",
      { className: "dshtk-row-head" },
      createElement(
        "span",
        { className: "dshtk-row-identity" },
        createElement("span", { className: "dshtk-row-name" }, tool.title),
        createElement("code", { className: "dshtk-row-tag" }, tool.id),
      ),
      createElement(
        "span",
        { className: "dshtk-row-actions" },
        typeof Switch === "function"
          ? createElement(Switch, {
              checked: tool.enabled,
              label: tool.title,
              disabled: busy,
              onChange,
            })
          : createElement("input", {
              type: "checkbox",
              role: "switch",
              "aria-checked": tool.enabled,
              "aria-label": tool.title,
              checked: tool.enabled,
              disabled: busy,
              onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
            }),
      ),
    ),
    createElement("p", { className: "dshtk-row-hint" }, tool.description),
  );
};

const describe = (reason: unknown): string => {
  if (reason instanceof HostApiError) return `操作失败：${reason.message}`;
  if (reason instanceof Error) return `操作失败：${reason.message}`;
  return "操作失败：无法连接宿主";
};
