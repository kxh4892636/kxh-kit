import { createElement } from "react";

/**
 * 测试替身：`@deepseek-ai/dsh-client-ui-primitives` 只存在于宿主的浏览器模块表里，
 * 单测通过 vite 的 test.alias 指向本文件，让组件树可以在 happy-dom 下渲染。
 */
interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly closeLabel?: string;
  readonly children?: unknown;
  readonly footer?: unknown;
}

export const Modal = (props: ModalProps): unknown => {
  if (!props.open) return null;
  return createElement(
    "div",
    { role: "dialog", "aria-label": props.title },
    createElement("div", null, props.title),
    props.children as never,
    props.footer as never,
  );
};

interface ButtonProps {
  readonly variant?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children?: unknown;
}

export const Button = (props: ButtonProps): unknown => {
  return createElement(
    "button",
    { type: "button", disabled: props.disabled, onClick: props.onClick },
    props.children as never,
  );
};
