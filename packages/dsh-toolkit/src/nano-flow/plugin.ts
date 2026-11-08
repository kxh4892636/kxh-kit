import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { Context } from "@deepseek-ai/cordis";

import { DEFAULT_NANO_FLOW_SETTINGS, type NanoFlowSettings } from "../contract.js";
import { NANO_FLOW_SERVICE, type ToolkitNanoFlowFacade } from "../host/nano-flow-facade.js";
import { serviceOf } from "../host/services.js";
import {
  assetsSkillsRoot,
  assetsTemplatesRoot,
  locateAssetsRoot,
  readLimitTemplate,
  readPromptText,
  readUserPromptText,
} from "./assets.js";
import { DEFAULT_DOMAIN_ROOT, type Config as NanoFlowConfig } from "./config.js";
import { buildLimitsText } from "./limits.js";
import { recordMount } from "./mount-report.js";
import { hostServices, type HostServices, type PromptContext } from "./services.js";
import { createAssetSkillProvider } from "./skills.js";
import { createCheckTool } from "./tools/check.js";
import { createCreateTool } from "./tools/create.js";
import { createToolRuntime } from "./tools/shared.js";

export { createAssetSkillProvider, ASSET_SKILL_RANK } from "./skills.js";

/** 固定提示词段的排序位：紧跟 harness identity 与 persona，早于任务内容。 */
export const PROMPT_ORDER = 1;

/** 固定提示词段名；同一作用域内唯一。 */
export const PROMPT_SECTION = "nano-flow:system";

/** 每轮用户输入后追加的运行时上下文名。 */
export const USER_CONTEXT_NAME = "nano-flow:input";

/** 每轮用户输入的上下文排序位。 */
export const USER_CONTEXT_ORDER = 1;

interface AgentLike {
  readonly id?: string;
  readonly session?: {
    readonly id?: string;
    readonly header?: { readonly cwd?: string };
  };
  readonly parent?: unknown;
}

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

const workspaceOf = (agent: unknown, config: NanoFlowConfig): string => {
  if (config.workspace !== undefined && config.workspace !== "") return config.workspace;
  const candidate = agent as AgentLike | undefined;
  const cwd = candidate?.session?.header?.cwd;
  return cwd === undefined || cwd === "" ? process.cwd() : cwd;
};

const guideFileOf = (workspace: string, domainRoot: string): string => {
  const root = isAbsolute(domainRoot) ? domainRoot : join(workspace, domainRoot);
  return join(resolve(root), "GUIDE.md");
};

/**
 * 预设内的 Nano Flow 半：注入固定提示词与 GUIDE 快照、注册两个工具、追加每轮用户提示、
 * 动态注入随包 skill。
 *
 * 由根插件在 `config.nanoFlowOnly === true` 时调用（即预设行挂载本模块时），
 * 所以提示词、工具与 skill 都注册在该预设的 standing mount 作用域内。
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
 * 注册提示词段、运行时上下文、两个工具与随包 skill provider；失败时记入诊断并原样抛出。
 * @param target - inject 提供的服务作用域（`tools` / `systemPrompt` 在这里可见）。
 * @param host - 插件自身的作用域上下文（`skills` 在这里可见，disposer 也挂在它上面）。
 * @param config - 插件配置。
 */
const mountNanoFlow = (target: Context, host: Context, config: NanoFlowConfig): void => {
  try {
    const services = hostServices(target);
    const assetsRoot = locateAssetsRoot();
    const fixedPrompt = readPromptText(assetsRoot);
    const userPrompt = readUserPromptText(assetsRoot);
    const limitTemplate = readLimitTemplate(assetsRoot);
    const settings = createSettingsReader(services);
    const domainRoot = config.domainRoot ?? DEFAULT_DOMAIN_ROOT;
    const runtime = createToolRuntime({ services, config, settings, assetsRoot, domainRoot });

    const guideCache = new WeakMap<object, string>();
    const guideOf = (agent: unknown): string => {
      const key = typeof agent === "object" && agent !== null ? agent : undefined;
      if (key !== undefined) {
        const cached = guideCache.get(key);
        if (cached !== undefined) return cached;
      }
      let text = "";
      try {
        text = readFileSync(guideFileOf(workspaceOf(agent, config), domainRoot), "utf8").trim();
      } catch {
        text = "";
      }
      if (key !== undefined) guideCache.set(key, text);
      return text;
    };

    const turnByAgent = new WeakMap<object, number>();
    const promptText = (context: PromptContext): string => {
      const guide = guideOf(context.agent).trim();
      const limits = buildLimitsText(limitTemplate, settings());
      return [fixedPrompt, guide, limits].filter((part) => part.trim() !== "").join("\n\n");
    };
    const userText = (context: PromptContext): string => {
      const agent = context.agent;
      const turn = typeof agent === "object" && agent !== null ? turnByAgent.get(agent) : undefined;
      if (turn === undefined) return userPrompt;
      return `${userPrompt}\n\n<!-- nano-flow turn ${turn} -->`;
    };

    const disposers: Array<() => void> = [
      services.systemPrompt.section({
        name: PROMPT_SECTION,
        order: PROMPT_ORDER,
        text: promptText,
        interpolate: false,
      }),
      services.tools.register(createCreateTool(runtime)),
      services.tools.register(createCheckTool(runtime)),
      host.skills.registerProvider(() => createAssetSkillProvider(assetsSkillsRoot(assetsRoot))),
    ];
    if (typeof services.systemPrompt.context === "function") {
      disposers.push(
        services.systemPrompt.context({
          name: USER_CONTEXT_NAME,
          order: USER_CONTEXT_ORDER,
          text: userText,
          interpolate: false,
        }),
      );
    }
    disposers.push(
      services.on("agent/pre-step", async (...args: unknown[]) => {
        const payload = args[0] as { agent?: unknown; turn?: unknown; step?: unknown } | undefined;
        const next = args[1];
        const result =
          typeof next === "function" ? await (next as () => Promise<unknown>)() : undefined;
        if (
          payload !== undefined &&
          payload.step === 1 &&
          typeof payload.turn === "number" &&
          typeof payload.agent === "object" &&
          payload.agent !== null
        ) {
          turnByAgent.set(payload.agent, payload.turn);
        }
        return result;
      }),
    );
    host.effect(() => {
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "nano-flow runtime");
    recordMount("ready", {
      promptBytes: Buffer.byteLength(fixedPrompt, "utf8"),
      userPromptBytes: Buffer.byteLength(userPrompt, "utf8"),
      section: PROMPT_SECTION,
      context: USER_CONTEXT_NAME,
      skillsRoot: assetsSkillsRoot(assetsRoot),
      templatesRoot: assetsTemplatesRoot(assetsRoot),
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
