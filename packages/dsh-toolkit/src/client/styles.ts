import type { CSSProperties } from "react";

/** 面板与弹窗共用的一组样式；全部使用宿主主题 token，跟随明暗主题。 */
export const pageStyle: CSSProperties = {
  boxSizing: "border-box",
  height: "100%",
  overflow: "auto",
  padding: "24px 28px",
  color: "var(--dsw-alias-label-primary)",
};

export const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const rowLayoutStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  justifyContent: "space-between",
};

export const titleTextStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--dsw-alias-label-primary)",
};

export const bodyTextStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--dsw-alias-label-secondary)",
};

export const errorTextStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--dsw-alias-label-danger, #d33)",
  padding: "8px 10px",
  borderRadius: 8,
  background: "color-mix(in srgb, var(--dsw-alias-label-danger, #d33) 10%, transparent)",
};

export const previewStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 160,
  overflow: "auto",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--dsw-alias-label-primary)",
  background: "color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent)",
};

export const footerStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

/** 开关按钮：单一控件两种状态，避免引入额外依赖。 */
export const toggleStyle = (enabled: boolean, busy: boolean): CSSProperties => ({
  position: "relative",
  flex: "none",
  width: 34,
  height: 20,
  borderRadius: 999,
  border: "none",
  cursor: busy ? "progress" : "pointer",
  padding: 0,
  background: enabled
    ? "var(--dsw-alias-label-primary)"
    : "color-mix(in srgb, var(--dsw-alias-label-secondary) 35%, transparent)",
  transition: "background .15s ease",
  opacity: busy ? 0.6 : 1,
});

/** 开关上的滑块位置。 */
export const knobStyle = (enabled: boolean): CSSProperties => ({
  position: "absolute",
  top: 2,
  left: enabled ? 16 : 2,
  width: 16,
  height: 16,
  borderRadius: 999,
  background: "var(--dsw-alias-bg-layer-1, #fff)",
  transition: "left .15s ease",
});

/** 弹窗底部的主次按钮（宿主 ui-primitives 缺席时的退化样式）。 */
export const fallbackButtonStyle = (primary: boolean): CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 8,
  fontSize: 12,
  cursor: "pointer",
  border: primary
    ? "none"
    : "1px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 35%, transparent)",
  background: primary ? "var(--dsw-alias-label-primary)" : "transparent",
  color: primary ? "var(--dsw-alias-bg-layer-1, #fff)" : "var(--dsw-alias-label-primary)",
});
