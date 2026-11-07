/**
 * `/orchestrator` 的模式选择器：与 `/thinking` 对齐——列表只有「开 / 关」两项，
 * Enter 只改当前会话，`Ctrl+S`（`app.thinking.save`）同时设为新会话默认。
 * @module @kxh4892636/pi-toolkit/orchestrator/selector
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSelectListTheme, keyText } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Spacer, Text } from "@earendil-works/pi-tui";

/** `/orchestrator` 的结果：是否开启，以及是否写入全局默认。 */
export interface ModeChoice {
  readonly enabled: boolean;
  readonly persist: boolean;
}

/** 当前状态，用于打勾与标记默认项。 */
export interface ModeSnapshot {
  /** 当前会话是否生效。 */
  readonly enabled: boolean;
  /** 新会话的默认值（`orchestrator.always`）。 */
  readonly always: boolean;
}

const ITEM_ON = "on";
const ITEM_OFF = "off";

/** 选择器的两项；当前值前打勾，默认值加 `· default`。 */
export const modeItems = (snapshot: ModeSnapshot) => {
  const item = (enabled: boolean) => ({
    value: enabled ? ITEM_ON : ITEM_OFF,
    label: `${snapshot.enabled === enabled ? "✓ " : "  "}${enabled ? "开" : "关"}`,
    description: `${enabled ? "在此会话运行 Orchestrator" : "在此会话暂停 Orchestrator"}${
      snapshot.always === enabled ? " · default" : ""
    }`,
  });
  return [item(true), item(false)];
};

/** 渲染快捷键提示：与 thinking 一样把首字母大写。 */
const displayKey = (id: Parameters<typeof keyText>[0]): string => {
  const text = keyText(id);
  return text.length === 0 ? "" : text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * 打开模式选择器。
 * @param ctx - 命令上下文。
 * @param snapshot - 当前会话状态与新会话默认值。
 * @returns 选择结果；取消时为 undefined。
 */
export const pickMode = async (
  ctx: ExtensionContext,
  snapshot: ModeSnapshot,
): Promise<ModeChoice | undefined> => {
  const items = modeItems(snapshot);

  if (ctx.mode !== "tui") {
    const picked = await ctx.ui.select("Orchestrator", ["开", "关"]);
    if (picked === undefined) return undefined;
    const enabled = picked === "开";
    const persist = await ctx.ui.confirm("Orchestrator", "同时设为新会话默认？");
    return { enabled, persist };
  }

  return ctx.ui.custom<ModeChoice | undefined>((tui, theme, keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.bold(theme.fg("accent", "Orchestrator")), 0, 0));
    container.addChild(new Spacer(1));

    const selectList = new SelectList(items, items.length, getSelectListTheme());
    const currentIndex = items.findIndex(
      (item) => item.value === (snapshot.enabled ? ITEM_ON : ITEM_OFF),
    );
    if (currentIndex !== -1) selectList.setSelectedIndex(currentIndex);

    const finish = (persist: boolean): void => {
      const selected = selectList.getSelectedItem();
      if (selected === null) {
        done(undefined);
        return;
      }
      done({ enabled: selected.value === ITEM_ON, persist });
    };
    selectList.onSelect = () => finish(false);
    selectList.onCancel = () => done(undefined);
    container.addChild(selectList);

    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          `  ${displayKey("tui.select.confirm")} to select · ${displayKey("app.thinking.save")} to set as default · ${displayKey("tui.select.cancel")} to cancel`,
        ),
        0,
        0,
      ),
    );
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

    return {
      capturesViewportInput: selectList.capturesViewportInput,
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
      },
      handleInput(data: string): void {
        if (keybindings.matches(data, "app.thinking.save")) {
          finish(true);
          return;
        }
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};
