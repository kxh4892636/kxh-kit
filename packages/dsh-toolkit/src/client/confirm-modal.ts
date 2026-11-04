import { createElement, type FC, type ReactNode } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { ensureToolkitStyles } from "./stylesheet.js";

/** 确认弹窗的属性：全部由撤回按钮控制，弹窗自身无状态。 */
export interface ConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
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
 * 二次确认弹窗：外壳用宿主 `Modal`（自带 portal、焦点与背景处理）、动作用宿主 `Button`，
 * 正文层级用本插件样式表里的 `dshtk-dialog-*` 类（见 stylesheet.ts）。
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
      footer,
    },
    body,
  );
};

const renderBody = (props: ConfirmModalProps): ReactNode => {
  return createElement(
    "div",
    { className: "dshtk-dialog-body" },
    createElement("p", { className: "dshtk-dialog-message" }, props.message),
    props.preview === undefined || props.preview === ""
      ? null
      : createElement("pre", { className: "dshtk-dialog-preview" }, props.preview),
    props.error === undefined
      ? null
      : createElement("p", { className: "dshtk-dialog-error" }, props.error),
  );
};

const renderFooter = (props: ConfirmModalProps): ReactNode => {
  return createElement(
    "div",
    { className: "dshtk-row-actions" },
    renderButton(props.cancelLabel, "outline", props.busy, props.onCancel),
    renderButton(props.confirmLabel, "primary", props.busy, props.onConfirm),
  );
};

const renderButton = (
  label: string,
  variant: "outline" | "primary",
  disabled: boolean | undefined,
  onClick: () => void,
): ReactNode => {
  if (typeof Button === "function") {
    return createElement(Button, {
      variant,
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
    { role: "dialog", "aria-modal": "false", className: "dshtk-dialog-body" },
    createElement("span", { className: "dshtk-row-name" }, props.title),
    body,
    footer,
  );
};
