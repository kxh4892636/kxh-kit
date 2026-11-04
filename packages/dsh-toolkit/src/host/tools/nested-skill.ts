import type { Context } from "@deepseek-ai/cordis";
import { TOOL_IDS } from "../../contract.js";
import { NestedSkillProvider, type NestedSkillOptions } from "../../nested-skill/provider.js";
import type { ToolkitTool } from "../toolkit-registry.js";

/**
 * 「嵌套 skill 发现」工具：把任意深度的 SKILL.md 注册成宿主 skill provider。
 * 关闭工具即使 provider 从技能目录里消失（`ctx.skills.registerProvider` 的 disposer）。
 */
export const createNestedSkillTool = (options: NestedSkillOptions): ToolkitTool => ({
  id: TOOL_IDS.nestedSkill,
  title: "嵌套 skill 发现",
  description: "在 .agents 树内任意深度发现 SKILL.md，而不限于内建的一层形态。",
  defaultEnabled: true,
  apply: (ctx: Context): (() => void) => {
    let provider: NestedSkillProvider | undefined;
    const disposeProvider = ctx.skills.registerProvider((control) => {
      provider = new NestedSkillProvider(ctx, control, options);
      return provider;
    });
    const disposeObserved = ctx.on("fs/observed", (target, _observation, actor) => {
      if (mutationToolName(actor) === undefined) return;
      provider?.observeHostMutation(target.displayPath);
    });
    return () => {
      disposeObserved();
      disposeProvider();
      void provider?.dispose().catch(() => {});
    };
  },
});

const mutationToolName = (actor: unknown): "edit" | "write" | undefined => {
  if (typeof actor !== "object" || actor === null || !("name" in actor)) return undefined;
  const value = (actor as { name: unknown }).name;
  return value === "edit" || value === "write" ? value : undefined;
};
