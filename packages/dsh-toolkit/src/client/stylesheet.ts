/**
 * 工具栏控件样式：宿主 composer 的控制栏是 CSS Modules（`.select` 为 28px 高、13px/500、
 * `--dsw-radius-sm`、hover 用 `--dsw-alias-interactive-bg-hover`，控制组 gap 12px）。
 * 这里用同样的一组 token 声明同类控件，并注入一张样式表以拿到 `:hover`/`:disabled`，
 * 注入方式与宿主包一致（带 `data-plugin-css` 的 `<style>`，只注入一次）。
 */

const STYLE_ID = "@kxh4892636/dsh-toolkit/toolkit.css";

const css = `
.dshtk-undo {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  margin-right: -6px;
  padding: 0 6px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .1s, color .1s;
}
.dshtk-undo:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshtk-undo:disabled {
  opacity: .5;
  cursor: default;
}
.dshtk-undo-icon {
  flex: none;
  width: 14px;
  height: 14px;
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
