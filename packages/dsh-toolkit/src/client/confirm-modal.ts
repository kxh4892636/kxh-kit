import { createElement, type FC, type ReactNode } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { ensureToolkitStyles } from "./stylesheet.js";

/** 确认弹窗的属性：全部由撤回按钮控制，弹窗自身无状态。 */
export interface ConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
  /** 结论性说明，走宿主 `Modal` 的 `description` 位（原生排版）。 */
  readonly message: string;
  /** 被撤销那一轮的用户原文预览。 */
  readonly preview?: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly busy?: boolean;
  readonly error?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * 二次确认弹窗：完全按宿主破坏性确认对话框的布局来——
 * 标题与说明用 `Modal` 的 `title`/`description` 位，正文只放预览与错误，
 * 宽度/滚动/按钮最小宽度复刻 `RiskConfirmation` 的度量（见 stylesheet.ts）。
 * 平台模块表缺 `Modal` 时退化为内联确认块，不阻塞流程。
 */
export const ConfirmModal: FC<ConfirmModalProps> = (props) => {
  ensureToolkitStyles();
  const footer = renderFooter(props);
  const body = renderBody(props);
  if (typeof Modal !== "function") return renderFallback(props, body, footer);
  return createElement(
    Modal,
    {
      open: props.open,
      onClose: props.onCancel,
      title: props.title,
      closeLabel: props.cancelLabel,
      description: props.message,
      className: "dshtk-confirmation",
      contentClassName: "dshtk-confirmation-content",
      footer,
    },
    body,
  );
};

const renderBody = (props: ConfirmModalProps): ReactNode => {
  const children: ReactNode[] = [];
  if (props.preview !== undefined && props.preview !== "") {
    children.push(
      createElement("pre", { key: "preview", className: "dshtk-dialog-preview" }, props.preview),
    );
  }
  if (props.error !== undefined) {
    children.push(
      createElement("p", { key: "error", className: "dshtk-dialog-error" }, props.error),
    );
  }
  if (children.length === 0) return null;
  return createElement("div", { className: "dshtk-dialog-stack" }, ...children);
};

const renderFooter = (props: ConfirmModalProps): ReactNode => {
  return createElement(
    "div",
    { className: "dshtk-dialog-actions" },
    renderButton(props.cancelLabel, "outline", "dshtk-modal-action", props.busy, props.onCancel),
    renderButton(
      props.confirmLabel,
      "primary",
      "dshtk-confirm-action",
      props.busy,
      props.onConfirm,
    ),
  );
};

const renderButton = (
  label: string,
  variant: "outline" | "primary",
  className: string,
  disabled: boolean | undefined,
  onClick: () => void,
): ReactNode => {
  if (typeof Button === "function") {
    return createElement(Button, {
      variant,
      className,
      ...(disabled === undefined ? {} : { disabled }),
      onClick,
      children: label,
    });
  }
  return createElement("button", { type: "button", disabled, onClick }, label);
};

const renderFallback = (
  props: ConfirmModalProps,
  body: ReactNode,
  footer: ReactNode,
): ReactNode => {
  if (!props.open) return null;
  return createElement(
    "div",
    { role: "dialog", "aria-modal": "false", className: "dshtk-dialog-stack" },
    createElement("span", { className: "dshtk-row-name" }, props.title),
    createElement("p", { className: "dshtk-row-hint" }, props.message),
    body,
    footer,
  );
};
