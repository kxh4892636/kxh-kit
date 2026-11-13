/**
 * `nano_flow_dream`：dream 会话的输入扫描与游标推进。
 *
 * 工具只是壳：扫规则与游标口径都在随包 `scripts/dream-scan.mjs`（同一份实现也能
 * 直接当 CLI 跑）。这样 dream.md 不用写死 profile 里的脚本路径，也不用把中文
 * 路径拼进 shell 字符串。
 * @module @kxh4892636/dsh-toolkit/nano-flow/tools/dream
 */

import {
  applyMarks,
  defaultStatePath,
  formatReport,
  scanDreamInput,
} from "../scripts/dream-scan.mjs";
import type { ToolDefinitionLike } from "../services.js";
import {
  asArguments,
  optionalString,
  requiredString,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";

const ACTIONS = ["scan", "mark"] as const;

/** 从参数里读 marks；结构不对时抛错，不静默丢项。 */
const readMarks = (
  args: Record<string, unknown>,
): { planPath: string; sessionId: string; seq: number }[] => {
  const value = args["marks"];
  if (!Array.isArray(value)) throw new Error("mark 需要 marks 数组");
  return value.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("marks 的每一项必须是对象");
    const record = item as Record<string, unknown>;
    const planPath = record["planPath"];
    const sessionId = record["sessionId"];
    const seq = record["seq"];
    if (typeof planPath !== "string" || planPath.trim() === "")
      throw new Error("marks[].planPath 必填");
    if (typeof sessionId !== "string" || sessionId.trim() === "")
      throw new Error("marks[].sessionId 必填");
    if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 0)
      throw new Error("marks[].seq 必须是非负数字");
    return { planPath, sessionId, seq };
  });
};

const executeDream = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: { signal: AbortSignal; agent?: unknown },
): Promise<string> => {
  const action = requiredString(args, "action");
  if (!(ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`action 必须是 ${ACTIONS.join(" | ")}`);
  }
  const workspace = await runtime.workspace(exec);
  const statePath = optionalString(args, "statePath");
  if (action === "scan") {
    const report = scanDreamInput({
      rootDir: workspace,
      domainsPath: runtime.domainRoot,
      ...(statePath === undefined ? {} : { statePath }),
    });
    return formatReport(report);
  }
  const stateFile = statePath ?? defaultStatePath();
  if (stateFile === undefined)
    throw new Error("找不到游标路径：宿主没有设置 DSH_HOME，传 statePath");
  const marks = readMarks(args);
  if (marks.length === 0) throw new Error("mark 至少传一条 marks");
  const state = applyMarks(stateFile, marks);
  const lines = [`已推进游标：${stateFile}`];
  for (const mark of marks) {
    const planPath = mark.planPath.split("\\").join("/");
    lines.push(
      `- ${planPath}#${mark.sessionId} → ${state.plans[planPath]?.sessions?.[mark.sessionId]?.lastSeq}`,
    );
  }
  return lines.join("\n");
};

/**
 * 构造 `nano_flow_dream`：scan 给 dream 输入清单，mark 在提交成功后推进游标。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createDreamTool = (runtime: ToolRuntime): ToolDefinitionLike => ({
  name: "nano_flow_dream",
  description:
    "dream 会话专用：action=scan 按「Plan + 会话」游标扫 log.jsonl，列出游标之后的新 turn（不要自己扫日志）；action=mark 在 nano_flow_check 与 git commit 成功后推进游标，只前进不后退。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: [...ACTIONS], description: "scan 或 mark" },
      marks: {
        type: "array",
        description: "mark 时要推进的游标；scan 忽略",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            planPath: { type: "string", description: "相对工作区的 Plan 目录" },
            sessionId: { type: "string", description: "会话 id" },
            seq: { type: "number", description: "该会话已处理到的 seq 上界" },
          },
          required: ["planPath", "sessionId", "seq"],
        },
      },
      statePath: {
        type: "string",
        description: "可选：游标文件路径，缺省用 $DSH_HOME/toolkit/nano-flow-dream.json",
      },
    },
    required: ["action"],
  },
  output: { schema: { type: "string" }, render: (_args, value) => textBlocks(value) },
  async execute(raw, exec) {
    return executeDream(runtime, asArguments(raw), exec);
  },
});
