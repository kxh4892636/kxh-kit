/**
 * 宿主平台模块表里可解析的 UI 基座（`dsh-web-frontend` 的 seed 表含
 * `@deepseek-ai/dsh-client-ui-primitives`）。本文件是全局环境声明，因此不能有
 * 顶层 import/export，否则 `declare module` 会退化为「扩充一个不存在的模块」。
 *
 * 只声明本插件实际用到的成员；宿主有的一律用宿主组件，不自己画。
 */
declare module "@deepseek-ai/dsh-client-ui-primitives" {
  /** 自带 portal、焦点与背景处理的模态框。 */
  export const Modal: import("react").ComponentType<{
    open: boolean;
    onClose: () => void;
    title?: string;
    closeLabel?: string;
    description?: string;
    children?: import("react").ReactNode;
    footer?: import("react").ReactNode;
    className?: string;
    contentClassName?: string;
  }>;

  /** 主题化按钮；`variant` 决定主次，`size` 决定高度。 */
  export const Button: import("react").ComponentType<{
    variant?: "ghost" | "outline" | "primary" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit";
    className?: string;
    children?: import("react").ReactNode;
    "aria-label"?: string;
    "aria-expanded"?: boolean;
  }>;

  /** 主题化输入框；透传原生 input 属性。 */
  export const Input: import("react").ComponentType<{
    type?: string;
    value?: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    "aria-label"?: string;
    inputMode?: "none" | "text" | "decimal" | "numeric" | "search" | "email" | "tel" | "url";
    onChange?: (event: { target: { value: string } }) => void;
  }>;

  /** 主题化开关：`role="switch"`，滑块读 `--dsw-alias-switch-thumb`。 */
  export const Switch: import("react").ComponentType<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    title?: string;
    className?: string;
  }>;

  /** 主题化提示气泡。 */
  export const Tooltip: import("react").ComponentType<{
    label: string;
    side?: "top" | "right" | "bottom" | "left";
    delayMs?: number;
    focusDelayMs?: number;
    portal?: boolean;
    openOnClick?: boolean;
    children?: import("react").ReactNode;
  }>;

  /** 描边图标：向下箭头。 */
  export const IconChevronDownOutlineRegular: import("react").ComponentType<{
    size?: number;
    className?: string;
  }>;
}
