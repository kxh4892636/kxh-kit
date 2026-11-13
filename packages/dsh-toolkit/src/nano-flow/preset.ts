/**
 * Nano Flow 的 Agent 预设定义。
 *
 * 预设不再写死在 bundle patch 里：它由 toolkit 面板的 `nano-flow` 开关控制，
 * 打开时由根插件调用 `ctx.agentPresets.register()` 注册，关闭时注销。
 * 这样「预设选择器里是否出现 Nano Flow」就完全等同该开关的状态。
 */

/** 预设里一行子插件；字段与宿主的 EntryOptions 同形。 */
interface PresetRow {
  readonly id: string;
  readonly name: string;
  /** 子插件配置或 group 的子行数组。 */
  readonly config?: unknown;
  readonly disabled?: boolean;
  /** 该行是 cordis group。 */
  readonly group?: boolean;
  /** group 的隔离域。 */
  readonly isolate?: Readonly<Record<string, boolean>>;
}

/** 注册给宿主预设注册表的定义。 */
export interface PresetDefinitionLike {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly order: number;
  readonly plugins: readonly PresetRow[];
}

/**
 * 预设内插件行的模块地址：与本插件同一入口（`dist/index.mjs`）。
 * 用绝对 URL，避免依赖 profile 的包解析。
 * @param moduleUrl - 调用方模块的 `import.meta.url`。
 * @returns 预设行的模块 URL。
 */
export const nanoFlowEntryUrl = (moduleUrl: string): string =>
  new URL("./index.mjs", moduleUrl).href;

/** 预设 id；同时用于会话的 `agentPreset` 记录。 */
export const NANO_FLOW_PRESET_ID = "nano-flow";

/**
 * 构造预设定义。
 * @param entryUrl - 预设内插件行的模块地址；用绝对 URL，避免依赖 profile 的包解析。
 * @returns 可直接交给 `agentPresets.register()` 的定义。
 */
export const createNanoFlowPreset = (entryUrl: string): PresetDefinitionLike => ({
  id: NANO_FLOW_PRESET_ID,
  name: "Nano Flow",
  description: "以 spec + note 为唯一权威状态的交付流程；工具经 PTC 模式（run_code）呈现。",
  order: 2,
  plugins: [
    {
      id: "persona",
      name: "@deepseek-ai/dsh-persona",
      config: {
        prefix: "本会话运行 Nano Flow：以 spec 与 note 为唯一权威状态，按固定提示词推进。",
      },
    },
    {
      id: "agent-instructions",
      name: "@deepseek-ai/dsh-agent-instructions",
      config: { maxBytes: 65536 },
    },
    { id: "time-context", name: "@deepseek-ai/dsh-time-context" },
    // PTC 模式：模型只看到 run_code + 生成的 SDK，工具调用写在一个 TypeScript 程序里。
    // 直接挂执行器（旧选型器已弃用）；需要宿主已挂 codeRuntime（web-app bundle 的 code-runtime 行）。
    { id: "tool-executor-ptc", name: "@deepseek-ai/dsh-tool-executor-ptc" },
    {
      id: "tool-bash",
      name: "@deepseek-ai/dsh-tool-bash",
      disabled: process.platform === "win32",
    },
    {
      id: "tool-pwsh",
      name: "@deepseek-ai/dsh-tool-pwsh",
      disabled: process.platform !== "win32",
    },
    { id: "tool-fs", name: "@deepseek-ai/dsh-tool-fs", config: { applyPatch: false } },
    {
      id: "tool-fs-search",
      name: "@deepseek-ai/dsh-tool-fs-search",
      config: { sampleOverCapGlobResults: false },
    },
    { id: "tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
    { id: "skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
    { id: "tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
    { id: "tool-schedule", name: "@deepseek-ai/dsh-tool-schedule" },
    { id: "nano-flow", name: entryUrl, config: { nanoFlowOnly: true } },
    {
      id: "delegation",
      name: "cordis:group",
      group: true,
      isolate: { workflowEngine: true },
      config: [
        { id: "tool-subagent-control", name: "@deepseek-ai/dsh-tool-subagent-control" },
        {
          id: "tool-subagent",
          name: "@deepseek-ai/dsh-tool-subagent",
          config: {
            provider: "spawn",
            toolName: "subagent",
            modelSelection: true,
            modelDiscovery: true,
          },
        },
        {
          id: "tool-subagent-fork",
          name: "@deepseek-ai/dsh-tool-subagent",
          config: { provider: "fork", toolName: "subagent_fork" },
        },
      ],
    },
    { id: "tool-ask-user", name: "@deepseek-ai/dsh-tool-ask-user" },
    {
      id: "tool-web",
      name: "@deepseek-ai/dsh-tool-web",
      config: { fetch: true, searchTimeoutMs: 60000 },
    },
    { id: "present", name: "@deepseek-ai/dsh-tool-present" },
  ],
});
