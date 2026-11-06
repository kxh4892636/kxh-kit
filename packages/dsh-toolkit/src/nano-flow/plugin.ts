import type { Context } from "@deepseek-ai/cordis";

import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { assetsSkillsRoot, locateAssetsRoot, readPromptText } from "./assets.js";
import { DEFAULT_DOMAIN_ROOT, type Config as NanoFlowConfig } from "./config.js";
import { attachRotation, type RotationSession } from "./rotate.js";
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
 * 预设内的 Nano Flow 半：注入固定提示词、注册三个工具、动态注入随包 skill，并开启会话轮转。
 *
 * 由根插件在 `config.nanoFlowOnly === true` 时调用（即预设行挂载本模块时），
 * 所以提示词、工具与 skill 都注册在该预设的 standing mount 作用域内。
 * @param ctx - 预设作用域上下文（根插件注入提供）。
 * @param config - 插件配置。
 */
export const applyNanoFlow = (ctx: Context, config: NanoFlowConfig): void => {
  ctx.inject(["tools", "systemPrompt"], (child: Context) => {
    const services = hostServices(child);
    const assetsRoot = locateAssetsRoot();
    const prompt = readPromptText(assetsRoot);
    const settings = createSettingsReader(services);
    const domainRoot = config.domainRoot ?? DEFAULT_DOMAIN_ROOT;
    const ownSession =
      (child as unknown as { agent?: { session?: RotationSession } }).agent?.session ??
      (ctx as unknown as { agent?: { session?: RotationSession } }).agent?.session;
    const runtime = createToolRuntime({
      services,
      config,
      settings,
      assetsRoot,
      domainRoot,
    });
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
      ctx.skills.registerProvider(() => createAssetSkillProvider(assetsSkillsRoot(assetsRoot))),
      attachRotation({ services, config, domainRoot, settings, session: ownSession }),
    ];
    child.effect(() => {
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "nano-flow runtime");
  });
};
