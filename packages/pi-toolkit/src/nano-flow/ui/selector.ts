/**
 * `/nano-flow` 的模式选择器：与 pi `/thinking` 对齐——列表只有「开 / 关」，
 * Enter 只改当前会话，`Ctrl+S`（`app.thinking.save`）同时写 `nanoFlow.always`。
 * @module @kxh4892636/pi-toolkit/nano-flow/ui/selector
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSelectListTheme, keyText } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Spacer, Text } from "@earendil-works/pi-tui";

/** 选择结果：当前会话是否开启，以及是否写入默认值。 */
export interface ModeChoice {
  readonly enabled: boolean;
  readonly persist: boolean;
}

/** 当前状态：会话是否生效、新会话默认值。 */
export interface ModeSnapshot {
  readonly enabled: boolean;
  readonly always: boolean;
}

const ITEM_ON = "on";
const ITEM_OFF = "off";

/** 两项：当前值打勾，默认值加 `· default`。 */
export const modeItems = (snapshot: ModeSnapshot) => {
  const item = (enabled: boolean) => ({
    value: enabled ? ITEM_ON : ITEM_OFF,
    label: `${snapshot.enabled === enabled ? "✓ " : "  "}${enabled ? "开" : "关"}`,
    description: `${enabled ? "在此会话运行 Nano Flow" : "在此会话暂停 Nano Flow"}${
      snapshot.always === enabled ? " · default" : ""
    }`,
  });
  return [item(true), item(false)];
};

const displayKey = (id: Parameters<typeof keyText>[0]): string => {
  const text = keyText(id);
  return text.length === 0 ? "" : text.charAt(0).toUpperCase() + text.slice(1);
};

/** 打开模式选择器；取消时返回 undefined。 */
export const pickNanoFlowMode = async (
  ctx: ExtensionContext,
  snapshot: ModeSnapshot,
): Promise<ModeChoice | undefined> => {
  const items = modeItems(snapshot);

  if (ctx.mode !== "tui") {
    const picked = await ctx.ui.select("Nano Flow", ["开", "关"]);
    if (picked === undefined) return undefined;
    const persist = await ctx.ui.confirm("Nano Flow", "同时设为新会话默认？");
    return { enabled: picked === "开", persist };
  }

  return ctx.ui.custom<ModeChoice | undefined>((tui, theme, keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.bold(theme.fg("accent", "Nano Flow")), 0, 0));
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
