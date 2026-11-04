import { createElement, type CSSProperties, type FC, type ReactNode } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import {
  bodyTextStyle,
  errorTextStyle,
  fallbackButtonStyle,
  footerStyle,
  previewStyle,
  stackStyle,
  titleTextStyle,
} from "./styles.js";

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

const fallbackStyle: CSSProperties = {
  marginTop: 8,
  padding: 12,
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  border: "1px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 30%, transparent)",
};

/**
 * 二次确认弹窗：优先使用宿主 `Modal`（自带 portal、焦点与背景处理），
 * 平台模块表缺该成员时退化为内联的确认块，不阻塞流程。
 */
export const ConfirmModal: FC<ConfirmModalProps> = (props) => {
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
    { style: stackStyle },
    createElement("div", { style: bodyTextStyle }, props.message),
    props.preview === undefined || props.preview === ""
      ? null
      : createElement("div", { style: previewStyle }, props.preview),
    props.error === undefined ? null : createElement("div", { style: errorTextStyle }, props.error),
  );
};

const renderFooter = (props: ConfirmModalProps): ReactNode => {
  return createElement(
    "div",
    { style: footerStyle },
    renderButton(props.cancelLabel, false, props.busy, props.onCancel),
    renderButton(props.confirmLabel, true, props.busy, props.onConfirm),
  );
};

const renderButton = (
  label: string,
  primary: boolean,
  disabled: boolean | undefined,
  onClick: () => void,
): ReactNode => {
  if (typeof Button === "function") {
    return createElement(Button, {
      variant: primary ? "primary" : "outline",
      ...(disabled === undefined ? {} : { disabled }),
      onClick,
      children: label,
    });
  }
  return createElement(
    "button",
    { type: "button", disabled, onClick, style: fallbackButtonStyle(primary) },
    label,
  );
};

const renderFallback = (
  props: ConfirmModalProps,
  body: ReactNode,
  footer: ReactNode,
): ReactNode => {
  if (!props.open) return null;
  return createElement(
    "div",
    { role: "dialog", "aria-modal": "false", style: fallbackStyle },
    createElement("div", { style: titleTextStyle }, props.title),
    body,
    footer,
  );
};
