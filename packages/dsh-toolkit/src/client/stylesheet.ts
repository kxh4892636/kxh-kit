/**
 * 「撤回」控件的样式：与宿主的「权限选择」（`@deepseek-ai/dsh-client-ui-permission-presets`
 * 的 `PermissionSelect.module.css` `.trigger`）逐条对齐——同样 28px 高、13px/500、
 * `--dsw-alias-label-secondary` 文字色、`--dsw-radius-sm` 圆角、`0 4px 0 8px` 内边距、
 * 4px 图文间距、hover 只换 `--dsw-alias-interactive-bg-hover` 背景、disabled 用
 * `--dsw-alias-label-dimmed`，图标 14×14，且不声明字体族（随 composer 继承）。
 *
 * 注入方式与宿主包一致（带 `data-plugin-css` 的 `<style>`，只注入一次）。
 */

const STYLE_ID = "@kxh4892636/dsh-toolkit/toolkit.css";

const css = `
.dshtk-undo-trigger {
  border-radius: var(--dsw-radius-sm);
  min-width: 0;
  max-width: 220px;
  height: 28px;
  margin-right: -6px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: 0 0;
  border: none;
  outline: none;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  display: inline-flex;
}
.dshtk-undo-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dshtk-undo-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dshtk-undo-trigger:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.dshtk-undo-trigger-icon {
  flex: none;
  display: inline-flex;
}
.dshtk-undo-trigger-icon svg {
  width: 14px;
  height: 14px;
}
.dshtk-undo-trigger-label {
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
}
`;

/** 注入一次工具箱样式；没有 DOM（如静态渲染）时静默跳过。 */
export const ensureToolkitStyles = (): void => {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset["plugin"] = "@kxh4892636/dsh-toolkit";
  tag.dataset["pluginCss"] = STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
};
