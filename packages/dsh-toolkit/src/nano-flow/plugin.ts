import type { Context } from "@deepseek-ai/cordis";

import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { serviceOf } from "../host/services.js";
import { assetsSkillsRoot, locateAssetsRoot, readPromptText } from "./assets.js";
import { DEFAULT_DOMAIN_ROOT, type Config as NanoFlowConfig } from "./config.js";
import { recordMount } from "./mount-report.js";
import { hostServices, type HostServices } from "./services.js";
import { createAssetSkillProvider } from "./skills.js";
import { createCheckTool } from "./tools/check.js";
import { createReadTool } from "./tools/read.js";
import { createToolRuntime } from "./tools/shared.js";
import { createWriteTool } from "./tools/write.js";

export { createAssetSkillProvider, ASSET_SKILL_RANK } from "./skills.js";

/** 提示词段的排序位：紧跟在 persona / plan 策略之后，早于各工具段落。 */
export const PROMPT_ORDER = 550;

/** 提示词段名；同一作用域内唯一。 */
export const PROMPT_SECTION = "nano-flow:workflow";

/**
 * 读取当前上限：来自根插件提供的 `toolkitNanoFlow` 服务（面板设置），
 * 服务缺席或读取失败时回落到默认值，绝不让一次读失败打断工具调用。
 * @param services - 宿主能力。
 * @returns 每次调用都重新读取的设置访问器。
 */
export const createSettingsReader = (services: HostServices): (() => NanoFlowSettings) => {
  return () => {
    const facade = services.get(NANO_FLOW_SERVICE) as ToolkitNanoFlowFacade | undefined;
    if (facade === undefined || typeof facade.settings !== "function") {
      return DEFAULT_NANO_FLOW_SETTINGS;
    }
    try {
      return facade.settings();
    } catch {
      return DEFAULT_NANO_FLOW_SETTINGS;
    }
  };
};

/**
 * 预设内的 Nano Flow 半：注入固定提示词、注册三个工具、动态注入随包 skill。
 *
 * 由根插件在 `config.nanoFlowOnly === true` 时调用（即预设行挂载本模块时），
 * 所以提示词、工具与 skill 都注册在该预设的 standing mount 作用域内。会话轮转不在这里：
 * 预设行读不到 `ctx.agent`（cordis 的 inject 守卫），轮转由根插件按会话日志判定后包装。
 *
 * 挂载失败在模型侧看起来等同「没挂上」（固定提示词与三个工具一起消失），所以每一步都落到
 * `$DSH_HOME/toolkit/nano-flow-mount.json`：文件不存在=apply 没跑，只有 apply=tools /
 * systemPrompt 一直没就位，ready=注册完成。
 * @param ctx - 预设作用域上下文（根插件注入提供）。
 * @param config - 插件配置。
 */
export const applyNanoFlow = (ctx: Context, config: NanoFlowConfig): void => {
  recordMount("apply", {
    nanoFlowOnly: (config as { nanoFlowOnly?: boolean }).nanoFlowOnly === true,
    services: serviceSnapshot(ctx),
  });
  ctx.inject(["tools", "systemPrompt"], (child: Context) => {
    mountNanoFlow(child, ctx, config);
  });
};

/**
 * 注册提示词段、三个工具与随包 skill provider；失败时记入诊断并原样抛出。
 * @param target - inject 提供的服务作用域（`tools` / `systemPrompt` 在这里可见）。
 * @param host - 插件自身的作用域上下文（`skills` 在这里可见，disposer 也挂在它上面）。
 * @param config - 插件配置。
 */
const mountNanoFlow = (target: Context, host: Context, config: NanoFlowConfig): void => {
  try {
    const services = hostServices(target);
    const assetsRoot = locateAssetsRoot();
    const prompt = readPromptText(assetsRoot);
    const settings = createSettingsReader(services);
    const domainRoot = config.domainRoot ?? DEFAULT_DOMAIN_ROOT;
    const runtime = createToolRuntime({ services, config, settings, assetsRoot, domainRoot });
    const disposers: Array<() => void> = [
      services.systemPrompt.section({
        name: PROMPT_SECTION,
        order: PROMPT_ORDER,
        text: prompt,
        interpolate: false,
      }),
      services.tools.register(createReadTool(runtime)),
      services.tools.register(createWriteTool(runtime)),
      services.tools.register(createCheckTool(runtime)),
      host.skills.registerProvider(() => createAssetSkillProvider(assetsSkillsRoot(assetsRoot))),
    ];
    host.effect(() => {
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "nano-flow runtime");
    recordMount("ready", {
      promptBytes: Buffer.byteLength(prompt, "utf8"),
      section: PROMPT_SECTION,
      skillsRoot: assetsSkillsRoot(assetsRoot),
      services: serviceSnapshot(target),
    });
  } catch (error) {
    recordMount("error", {
      message: describe(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
    });
    throw error;
  }
};

/** 诊断用：本半依赖的服务当前是否可见（`ctx.get` 不受 inject 守卫约束）。 */
const serviceSnapshot = (ctx: Context): Record<string, boolean> => {
  const names = [
    "agent",
    "tools",
    "systemPrompt",
    "skills",
    "tokenMeter",
    "sessionController",
    "workspaceRegistry",
    "agentPresets",
  ];
  return Object.fromEntries(names.map((name) => [name, serviceOf(ctx, name) !== undefined]));
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
