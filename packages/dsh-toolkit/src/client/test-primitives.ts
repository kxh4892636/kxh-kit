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
  readonly description?: string;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly children?: unknown;
  readonly footer?: unknown;
}

export const Modal = (props: ModalProps): unknown => {
  if (!props.open) return null;
  return createElement(
    "div",
    { role: "dialog", "aria-label": props.title },
    createElement("div", null, props.title),
    props.description === undefined ? null : createElement("p", null, props.description),
    props.children as never,
    props.footer as never,
  );
};

interface ButtonProps {
  readonly variant?: string;
  readonly size?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children?: unknown;
  readonly "aria-label"?: string;
  readonly "aria-expanded"?: boolean;
}

export const Button = (props: ButtonProps): unknown => {
  return createElement(
    "button",
    {
      type: "button",
      className: props.className,
      disabled: props.disabled,
      onClick: props.onClick,
      "aria-label": props["aria-label"],
      "aria-expanded": props["aria-expanded"],
    },
    props.children as never,
  );
};

interface InputProps {
  readonly type?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly inputMode?: string;
  readonly "aria-label"?: string;
  readonly onChange?: (event: { target: { value: string } }) => void;
}

export const Input = (props: InputProps): unknown => {
  return createElement("input", {
    type: props.type ?? "text",
    value: props.value,
    placeholder: props.placeholder,
    className: props.className,
    disabled: props.disabled,
    inputMode: props.inputMode,
    "aria-label": props["aria-label"],
    onChange: (event: { target: { value: string } }) => props.onChange?.(event),
  });
};

interface TooltipProps {
  readonly label: string;
  readonly side?: string;
  readonly delayMs?: number;
  readonly focusDelayMs?: number;
  readonly portal?: boolean;
  readonly openOnClick?: boolean;
  readonly children?: unknown;
}

export const Tooltip = (props: TooltipProps): unknown => {
  return createElement("span", { title: props.label }, props.children as never);
};

interface IconProps {
  readonly size?: number;
  readonly className?: string;
}

export const IconChevronDownOutlineRegular = (props: IconProps): unknown => {
  return createElement("svg", { width: props.size ?? 14, height: props.size ?? 14 });
};

/** 面板标题图标替身。 */
export const IconChecklistOutline14 = (props: IconProps): unknown => {
  return createElement("svg", { width: props.size ?? 14, height: props.size ?? 14 });
};

/** 折叠按钮图标替身。 */
export const IconChevronUpOutline14 = (props: IconProps): unknown => {
  return createElement("svg", { width: props.size ?? 14, height: props.size ?? 14 });
};

export const IconChevronDownOutline14 = (props: IconProps): unknown => {
  return createElement("svg", { width: props.size ?? 14, height: props.size ?? 14 });
};

interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly title?: string;
}

/** 替身开关：与宿主 `Switch` 一样输出 role="switch" 的按钮。 */
export const Switch = (props: SwitchProps): unknown => {
  return createElement(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": props.checked,
      "aria-label": props.label,
      title: props.title,
      disabled: props.disabled,
      onClick: () => props.onChange(!props.checked),
    },
    createElement("span", null),
  );
};
