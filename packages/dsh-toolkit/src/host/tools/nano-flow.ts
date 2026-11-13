import type { Context } from "@deepseek-ai/cordis";

import { TOOL_IDS } from "../../contract.js";
import {
  createNanoFlowPreset,
  type PresetDefinitionLike,
} from "../../nano-flow/assembly/preset.js";
import type { ToolkitTool } from "../toolkit-registry.js";
import { describeError } from "../../shared/errors.js";

/** 宿主预设注册表的最小形状。 */
interface AgentPresetRegistryLike {
  register(definition: PresetDefinitionLike): Promise<() => Promise<void>>;
}

/**
 * 「Nano Flow 预设」开关：打开时把预设注册进宿主 roster，关闭时注销。
 *
 * 预设本身不写在 bundle patch 里，所以「是否出现在预设选择器」完全由这个开关决定；
 * 预设内挂的插件行用绝对 URL 指向本包的第二个入口，避免依赖 profile 的包解析。
 * @param options - 预设内插件入口的绝对地址。
 * @returns 工具声明。
 */
export const createNanoFlowTool = (options: { entryUrl: string }): ToolkitTool => ({
  id: TOOL_IDS.nanoFlow,
  title: "Nano Flow 预设",
  description:
    "在会话的预设选择器里增加 Nano Flow：固定提示词、nano_flow_create / nano_flow_check 工具与随包 skill。关闭即从预设列表移除。",
  defaultEnabled: false,
  apply: (ctx: Context): (() => void) => {
    const definition = createNanoFlowPreset(options.entryUrl);
    let disposed = false;
    let unregister: (() => Promise<void>) | undefined;
    const disposeInject = ctx.inject(["agentPresets"], (child: Context) => {
      const registry = (child as unknown as { agentPresets?: AgentPresetRegistryLike })
        .agentPresets;
      if (registry === undefined || typeof registry.register !== "function") return;
      void registry
        .register(definition)
        .then((stop) => {
          if (disposed) {
            void stop().catch(() => {});
            return;
          }
          unregister = stop;
        })
        .catch((error: unknown) => {
          ctx.logger.warn(`toolkit: nano-flow preset registration failed: ${describeError(error)}`);
        });
    });
    return () => {
      disposed = true;
      const injected = disposeInject as unknown as { dispose?: () => Promise<void> } | undefined;
      void injected?.dispose?.().catch(() => {});
      void unregister?.().catch(() => {});
    };
  },
});
