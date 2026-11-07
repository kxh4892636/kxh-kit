/**
 * `/nano-flow` 的模式选择面板：与 `/thinking` 相同的 SelectList 交互，
 * 四个动作分别对应「一直开 / 一直关 / 当前会话开 / 当前会话关」。
 * @module @kxh4892636/pi-toolkit/nano-flow/selector
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getSelectListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

/** 用户在 `/nano-flow` 里选中的动作。 */
export type ModeChoice = "always-on" | "always-off" | "session-on" | "session-off";

/** 当前状态，用于在选项前打勾。 */
export interface ModeSnapshot {
  readonly enabled: boolean;
  /** 会话级覆盖；undefined 表示沿用全局默认。 */
  readonly sessionOverride: boolean | undefined;
  readonly always: boolean;
}

const CHOICES: ReadonlyArray<{
  readonly value: ModeChoice;
  readonly label: string;
  readonly description: string;
  readonly matches: (snapshot: ModeSnapshot) => boolean;
}> = [
  {
    value: "always-on",
    label: "一直开",
    description: "新会话默认运行 Nano Flow",
    matches: (snapshot) => snapshot.sessionOverride === undefined && snapshot.always,
  },
  {
    value: "always-off",
    label: "一直关",
    description: "新会话默认不运行 Nano Flow",
    matches: (snapshot) => snapshot.sessionOverride === undefined && !snapshot.always,
  },
  {
    value: "session-on",
    label: "当前会话开",
    description: "只在本会话运行；新会话不受影响",
    matches: (snapshot) => snapshot.sessionOverride === true,
  },
  {
    value: "session-off",
    label: "当前会话关",
    description: "本会话暂停；新会话不受影响",
    matches: (snapshot) => snapshot.sessionOverride === false,
  },
];

/** 选择器的选项，当前状态前加勾。 */
export const modeChoices = (snapshot: ModeSnapshot): SelectItem[] => {
  return CHOICES.map((choice) => ({
    value: choice.value,
    label: `${choice.matches(snapshot) ? "✓ " : "  "}${choice.label}`,
    description: choice.description,
  }));
};

/**
 * 打开模式选择器。
 * @param ctx - 命令上下文。
 * @param snapshot - 当前模式状态。
 * @returns 选中的动作；取消时为 undefined。
 */
export const pickMode = async (
  ctx: ExtensionContext,
  snapshot: ModeSnapshot,
): Promise<ModeChoice | undefined> => {
  const items = modeChoices(snapshot);
  if (ctx.mode !== "tui") {
    const labels = items.map((item) => item.label);
    const picked = await ctx.ui.select("Nano Flow", labels);
    if (picked === undefined) return undefined;
    return items[labels.indexOf(picked)]?.value as ModeChoice | undefined;
  }
  return ctx.ui.custom<ModeChoice | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const border = (text: string): string => theme.fg("accent", text);
    container.addChild(new DynamicBorder(border));
    container.addChild(new Text(theme.bold(theme.fg("accent", "Nano Flow")), 1, 1));
    container.addChild(
      new Text(theme.fg("muted", `当前：${snapshot.enabled ? "开" : "关"}`), 1, 0),
    );

    const selectList = new SelectList(items, items.length, getSelectListTheme());
    selectList.onSelect = (item) => done(item.value as ModeChoice);
    selectList.onCancel = () => done(undefined);
    container.addChild(selectList);
    container.addChild(new Text(theme.fg("dim", "↑↓ 选择 · Enter 确认 · Esc 取消"), 1, 1));
    container.addChild(new DynamicBorder(border));

    return {
      capturesViewportInput: selectList.capturesViewportInput,
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
      },
      handleInput(data: string): void {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });
};
