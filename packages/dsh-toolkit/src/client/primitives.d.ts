/**
 * 宿主平台模块表里可解析的 UI 基座（`dsh-web-frontend` 的 seed 表含
 * `@deepseek-ai/dsh-client-ui-primitives`）。本文件是全局环境声明，因此不能有
 * 顶层 import/export，否则 `declare module` 会退化为「扩充一个不存在的模块」。
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

  /** 主题化的按钮；`variant` 决定主次，`size` 决定高度。 */
  export const Button: import("react").ComponentType<{
    variant?: "ghost" | "outline" | "primary" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    onClick?: () => void;
    type?: "button" | "submit";
    children?: import("react").ReactNode;
  }>;

  /** 原生开关：`role="switch"`，滑块读 `--dsw-alias-switch-thumb`。 */
  export const Switch: import("react").ComponentType<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
    title?: string;
    className?: string;
  }>;
}
