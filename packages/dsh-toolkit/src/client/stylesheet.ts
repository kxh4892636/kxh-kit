/**
 * toolkit 的样式表：与 DSH 原生样式同一套做法——每个插件注入一张按 `data-plugin-css`
 * 标记的全局样式表，只写 token（`--dsw-*`），不出现任何字面色值。
 *
 * - 面板：复刻宿主设置页的 section/card/row 度量（`ui-settings-models` 的
 *   `.section/.title/.intro/.rows/.rowCard/.rowHead/.rowName/.rowTag/.rowActions`）：
 *   卡片用 `--dsw-alias-settings-card-fill/-stroke` + `--dsw-radius-xl` + 0.5px 描边。
 * - 开关：直接复用宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 `Switch`（它自己读
 *   `--dsw-alias-switch-thumb`），不用自绘控件。
 * - 撤回触发器：复刻权限选择（`ui-permission-presets` 的 `.trigger`）的度量与交互态。
 * - 弹窗：复用宿主 `Modal` + `Button`，这里只补正文/预览/错误的文本层级。
 */

const STYLE_ID = "@kxh4892636/dsh-toolkit/toolkit.css";

const css = `
/* ── 面板：设置页的 section / rowCard 度量 ─────────────────────────────── */
.dshtk-panel {
  box-sizing: border-box;
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  color: var(--dsw-alias-label-primary);
}
.dshtk-section {
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dshtk-title {
  margin: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.dshtk-intro {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  line-height: 22px;
}
.dshtk-notice {
  margin: 0;
  color: var(--dsw-alias-state-warn-label);
  font-size: 12px;
  line-height: 18px;
}
.dshtk-rows {
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
}
.dshtk-row-card {
  border: .5px solid var(--dsw-alias-settings-card-stroke);
  background: var(--dsw-alias-settings-card-fill);
  border-radius: var(--dsw-radius-xl);
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  display: flex;
}
.dshtk-row-head {
  align-items: center;
  gap: 10px;
  display: flex;
}
.dshtk-row-identity {
  align-items: center;
  gap: 6px;
  min-width: 0;
  display: inline-flex;
}
.dshtk-row-name {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.dshtk-row-tag {
  border: .5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-xs);
  color: var(--dsw-alias-label-secondary);
  flex: none;
  padding: 1px 6px;
  font-family: var(--ds-font-family-code);
  font-size: 11px;
  line-height: 16px;
}
.dshtk-row-actions {
  align-items: center;
  gap: 4px;
  margin-left: auto;
  display: inline-flex;
}
.dshtk-row-hint {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* ── 撤回触发器：与权限选择 .trigger 同度量 ────────────────────────────── */
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

/* ── 撤回确认弹窗：复刻宿主 RiskConfirmation 的宽度/滚动/按钮度量 ────────── */
.dshtk-confirmation {
  width: min(440px, 100%);
  max-height: min(calc(100dvh - 48px), 100%);
  overflow: hidden;
}
.dshtk-confirmation-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dshtk-dialog-stack {
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  display: flex;
}
.dshtk-dialog-preview {
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow: auto;
  margin: 0;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
}
.dshtk-dialog-error {
  color: var(--dsw-alias-state-warn-label);
  margin: 0;
  font-size: 12px;
  line-height: 18px;
}
.dshtk-dialog-actions {
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  display: flex;
}
.dshtk-modal-action {
  min-width: 72px;
}
.dshtk-confirm-action {
  min-width: 136px;
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
