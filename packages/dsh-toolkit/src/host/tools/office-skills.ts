import type { Context } from "@deepseek-ai/cordis";
import { TOOL_IDS } from "../../contract.js";
import { installSkillMask, isDshOfficeSkill } from "../skill-mask.js";
import type { ToolkitTool } from "../toolkit-registry.js";

/**
 * 「移除 dsh 自带 office 技能」工具：在技能注册表的读取入口上过滤掉内置 office 技能。
 * 关闭工具即还原读取入口，office 技能立刻回到目录里。
 */
export const createOfficeSkillsTool = (): ToolkitTool => ({
  id: TOOL_IDS.officeSkills,
  title: "移除 dsh 自带 office 技能",
  description:
    "开启后屏蔽宿主内置的 office / office-* 技能（provider dsh-office）：目录里不再列出，skill 也加载不到。",
  defaultEnabled: false,
  apply: (ctx: Context): (() => void) => installSkillMask(ctx, isDshOfficeSkill),
});
