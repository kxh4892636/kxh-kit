import { createElement, useCallback, useEffect, useState, type FC } from "react";
import {
  Button,
  IconChevronDownOutlineRegular,
  Input,
  Switch,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { TOOL_IDS, type NanoFlowSettings, type ToolkitToolInfo } from "../contract.js";
import {
  fetchNanoFlowSettings,
  fetchToolkitState,
  HostApiError,
  saveNanoFlowSettings,
  setToolEnabled,
} from "./host-api.js";
import { toolkitClientState } from "./state.js";
import { ensureToolkitStyles } from "./stylesheet.js";

/** 1 KB = 1024 字节；界面按 KB 输入，存储仍是字节。 */
const KB = 1024;

/** 设置区字段：与 `NanoFlowSettings` 一一对应；`unit` 是界面单位，`scale` 是换算到存储值的倍数。 */
const SETTING_FIELDS: readonly {
  readonly key: keyof NanoFlowSettings;
  readonly label: string;
  readonly unit: string;
  readonly scale: number;
  /** 保存时取整（KB、字、行）；比例保留小数。 */
  readonly integer: boolean;
}[] = [
  { key: "storyMaxBytes", label: "story.md", unit: "KB", scale: KB, integer: true },
  { key: "specMaxBytes", label: "spec.md", unit: "KB", scale: KB, integer: true },
  { key: "noteMaxBytes", label: "单条 note", unit: "KB", scale: KB, integer: true },
  { key: "noteDescriptionMaxChars", label: "note 摘要", unit: "字", scale: 1, integer: true },
  { key: "indexMaxRows", label: "关键索引", unit: "行", scale: 1, integer: true },
  { key: "contextMaxBytes", label: "CONTEXT.md", unit: "KB", scale: KB, integer: true },
  { key: "questionsMaxBytes", label: "QUESTIONS.md", unit: "KB", scale: KB, integer: true },
  { key: "adrMaxBytes", label: "单个 ADR", unit: "KB", scale: KB, integer: true },
  { key: "adrMaxCount", label: "ADR 数量", unit: "个", scale: 1, integer: true },
  { key: "rotateAt", label: "轮转阈值", unit: "比例", scale: 1, integer: false },
];

/** 存储值 → 界面文本；KB 带千分位并保留两位小数。 */
const toDisplay = (value: number, scale: number): string => {
  if (scale === 1) return String(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value / scale);
};

/** 标题右侧的单位说明。 */
const unitTitle = (unit: string): string => {
  if (unit === "KB") return "大小/KB";
  if (unit === "字") return "字数";
  if (unit === "行") return "行数";
  return unit;
};

/** 界面文本 → 存储值：去掉千分位后解析；整数类字段按 scale 换算并取整。 */
const parseFieldValue = (
  raw: string,
  field: (typeof SETTING_FIELDS)[number],
): number | undefined => {
  const cleaned = raw.replaceAll(",", "").replaceAll(" ", "");
  if (cleaned === "") return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;
  const scaled = value * field.scale;
  return field.integer ? Math.round(scaled) : scaled;
};

type Draft = Readonly<Record<string, string>>;

const toDraft = (settings: NanoFlowSettings): Draft => {
  const draft: Record<string, string> = {};
  for (const field of SETTING_FIELDS) {
    draft[field.key] = toDisplay(settings[field.key], field.scale);
  }
  return draft;
};

const describe = (reason: unknown): string => {
  const message =
    reason instanceof HostApiError || reason instanceof Error ? reason.message : String(reason);
  return `操作失败：${message}`;
};

/**
 * 侧边栏 `toolkit` 主面板：工具开关 + Nano Flow 上限设置。
 *
 * 结构与样式都按宿主设置页的 section/rowCard 来（见 stylesheet.ts），开关直接用
 * 宿主 `ui-primitives` 的 `Switch`。设置保存到宿主，nano-flow 插件下一次调用即生效。
 */
export const ToolkitPanel: FC = () => {
  const [tools, setTools] = useState<readonly ToolkitToolInfo[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<NanoFlowSettings | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>({});
  const [settingsError, setSettingsError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const apply = useCallback((next: readonly ToolkitToolInfo[]): void => {
    setTools(next);
    toolkitClientState.publish(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchToolkitState(controller.signal)
      .then((next) => {
        apply(next);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describe(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    fetchNanoFlowSettings(controller.signal)
      .then((next) => {
        setSettings(next);
        setDraft(toDraft(next));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setSettingsError(describe(reason));
      });
    return () => controller.abort();
  }, [apply]);

  const toggle = useCallback(
    (tool: ToolkitToolInfo, enabled: boolean): void => {
      if (tool.id === TOOL_IDS.nanoFlow && !enabled) setSettingsOpen(false);
      setPending(tool.id);
      setToolEnabled(tool.id, enabled)
        .then((next) => {
          apply(next);
          setError(undefined);
        })
        .catch((reason: unknown) => setError(describe(reason)))
        .finally(() => setPending(undefined));
    },
    [apply],
  );

  const updateField = useCallback((key: keyof NanoFlowSettings, value: string): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const save = useCallback((): void => {
    const patch: Record<string, number> = {};
    for (const field of SETTING_FIELDS) {
      const value = parseFieldValue(draft[field.key] ?? "", field);
      if (value === undefined) {
        setSettingsError(`${field.label} 必须是数字`);
        return;
      }
      patch[field.key] = value;
    }
    setSaving(true);
    saveNanoFlowSettings(patch as Partial<NanoFlowSettings>)
      .then((next) => {
        setSettings(next);
        setDraft(toDraft(next));
        setSettingsError(undefined);
      })
      .catch((reason: unknown) => setSettingsError(describe(reason)))
      .finally(() => setSaving(false));
  }, [draft]);

  ensureToolkitStyles();
  return createElement(
    "div",
    { className: "dshtk-panel" },
    createElement(
      "div",
      { className: "dshtk-section" },
      createElement("h1", { className: "dshtk-title" }, "toolkit"),
      createElement(
        "p",
        { className: "dshtk-intro" },
        "工作区自研的工具集合。每个工具可以单独开关，开关状态保存在宿主侧，刷新与重启后保持。",
      ),
      error === undefined ? null : createElement("p", { className: "dshtk-notice" }, error),
      loading
        ? createElement("p", { className: "dshtk-row-hint" }, "正在读取工具状态…")
        : createElement(
            "ul",
            { className: "dshtk-rows" },
            ...tools.map((tool) =>
              renderRow(
                tool,
                pending === tool.id,
                (enabled) => toggle(tool, enabled),
                tool.id === TOOL_IDS.nanoFlow
                  ? {
                      open: settingsOpen,
                      onToggle: () => setSettingsOpen((current) => !current),
                      draft,
                      saving,
                      error: settingsError,
                      onChange: updateField,
                      onSave: save,
                      ready: settings !== undefined,
                    }
                  : undefined,
              ),
            ),
          ),
    ),
  );
};

const renderSettings = (
  draft: Draft,
  saving: boolean,
  error: string | undefined,
  onChange: (key: keyof NanoFlowSettings, value: string) => void,
  onSave: () => void,
) => {
  return createElement(
    "div",
    { className: "dshtk-settings" },
    error === undefined ? null : createElement("p", { className: "dshtk-notice" }, error),
    createElement(
      "div",
      { className: "dshtk-field-grid" },
      ...SETTING_FIELDS.map((field) =>
        createElement(
          "label",
          { key: field.key, className: "dshtk-field" },
          createElement(
            "span",
            { className: "dshtk-field-label" },
            `${field.label}（${unitTitle(field.unit)}）`,
          ),
          createElement(Input, {
            className: "dshtk-input",
            type: "text",
            inputMode: "decimal" as const,
            value: draft[field.key] ?? "",
            "aria-label": `${field.label} ${field.unit}`,
            onChange: (event: { target: { value: string } }) =>
              onChange(field.key, event.target.value),
          }),
        ),
      ),
    ),
    createElement(
      "div",
      { className: "dshtk-actions" },
      createElement(
        Button,
        { variant: "primary", type: "button", disabled: saving, onClick: onSave },
        saving ? "保存中…" : "保存",
      ),
    ),
  );
};

interface SettingsProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly draft: Draft;
  readonly saving: boolean;
  readonly error: string | undefined;
  readonly onChange: (key: keyof NanoFlowSettings, value: string) => void;
  readonly onSave: () => void;
  readonly ready: boolean;
}

const renderRow = (
  tool: ToolkitToolInfo,
  busy: boolean,
  onChange: (enabled: boolean) => void,
  settings?: SettingsProps,
) => {
  const showSettings = settings !== undefined && tool.enabled;
  return createElement(
    "li",
    { key: tool.id, className: "dshtk-row-card" },
    createElement(
      "div",
      { className: "dshtk-row-head" },
      createElement(
        "span",
        { className: "dshtk-row-identity" },
        createElement("span", { className: "dshtk-row-name" }, tool.title),
        createElement("code", { className: "dshtk-row-tag" }, tool.id),
      ),
      createElement(
        "span",
        { className: "dshtk-row-actions" },
        showSettings
          ? createElement(
              Tooltip,
              { label: "Nano Flow 设置", side: "top" as const, portal: true },
              createElement(
                Button,
                {
                  variant: "ghost" as const,
                  size: "sm" as const,
                  "aria-label": "Nano Flow 设置",
                  "aria-expanded": settings.open,
                  onClick: settings.onToggle,
                },
                createElement(IconChevronDownOutlineRegular, { size: 14 }),
              ),
            )
          : null,
        createElement(Switch, {
          checked: tool.enabled,
          label: tool.title,
          disabled: busy,
          onChange,
        }),
      ),
    ),
    createElement("p", { className: "dshtk-row-hint" }, tool.description),
    showSettings && settings.open
      ? createElement(
          "div",
          { className: "dshtk-settings-popover", role: "group", "aria-label": "Nano Flow 上限" },
          settings.ready
            ? renderSettings(
                settings.draft,
                settings.saving,
                settings.error,
                settings.onChange,
                settings.onSave,
              )
            : createElement("p", { className: "dshtk-row-hint" }, "正在读取设置…"),
        )
      : null,
  );
};
