/**
 * dream 的注入文本：`prompts/dream.md` 全文 + 本次运行的 Plan 清单。
 *
 * 清单只给路径与大小，不给内容 —— 读多少、读哪个会话段由模型按 dream.md 的规则自己决定。
 * @module @kxh489736/pi-toolkit/nano-flow/dream/prompt
 */

import { relative } from "node:path";

import { PLAN_LOG_FILE } from "../log.ts";
import { planRefOf } from "../plan.ts";
import type { DreamScope } from "./scope.ts";

/** dream 运行的会话记录条目：`{ at, domains, plans }`。 */
export const DREAM_ENTRY = "nano-flow-dream";

/** 字节数转成可读大小。 */
const kb = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;

/**
 * 拼接一次 dream 运行的完整指令。
 * @param scope - 本次范围。
 * @param options - 工作区根与 dream.md 原文。
 * @returns 作为 user 消息发送的文本。
 */
export const buildDreamMessage = (
  scope: DreamScope,
  options: { readonly workspace: string; readonly prompt: string },
): string => {
  const lines: string[] = [
    options.prompt.trim(),
    "",
    "## 本次运行",
    "",
    `- 工作区：${options.workspace}`,
  ];
  for (const item of scope.domains) {
    lines.push(`- 域 \`${item.domain}\`：${item.plans.length} 个 Plan`);
    for (const entry of item.plans) {
      const ref = planRefOf(entry.plan);
      const relativeDir = relative(options.workspace, entry.plan.directory).replaceAll("\\", "/");
      const trace =
        entry.logBytes === 0
          ? `无轨迹（尚无 ${PLAN_LOG_FILE}）`
          : `${relativeDir}/${PLAN_LOG_FILE}（${kb(entry.logBytes)}）`;
      lines.push(
        `  - \`${ref}\`｜${relativeDir}/spec.md｜${relativeDir}/notes_index.md｜轨迹：${trace}`,
      );
    }
  }
  const withoutTrace = scope.domains.reduce(
    (sum, item) => sum + item.plans.filter((entry) => entry.logBytes === 0).length,
    0,
  );
  lines.push("", `- 无轨迹的 Plan：${withoutTrace} 个（只读 spec 与 note，不要臆造内容）`);
  return lines.join("\n");
};
