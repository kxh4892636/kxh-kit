import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  formatNoteLine,
  formatPlanHeader,
  asArguments,
  optionalString,
  optionalStringArray,
  requiredString,
  statusLine,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";
import { graphOf, planStatusOf, readyNotes, searchNotes, todoGroups } from "../dag.js";
import { listPlans, planRefOf, resolvePlan, type PlanRef } from "../plan.js";
import { openDocument } from "../store.js";

const READ_OPS = ["plans", "notes", "get", "ready", "graph", "index", "search", "resume"] as const;

const describeBytes = async (plan: PlanRef, fileName: string): Promise<string> => {
  try {
    const info = await stat(join(plan.directory, fileName));
    return `${info.size} 字节`;
  } catch {
    return "缺失";
  }
};

const formatPlans = async (runtime: ToolRuntime, workspace: string): Promise<string> => {
  const plans = await listPlans(workspace, runtime.domainRoot);
  if (plans.length === 0) {
    return `工作区 ${workspace} 里还没有 Plan（域根 ${runtime.domainRoot}）。用 nano_flow_write 的 init 建一个。`;
  }
  const lines: string[] = [
    `工作区: ${workspace}`,
    `域根: ${runtime.domainRoot}`,
    `Plan（${plans.length}）:`,
  ];
  for (const plan of plans) {
    try {
      const { document } = await openDocument(plan.directory, runtime.limits());
      lines.push(
        `  ${planRefOf(plan)} · ${statusLine(document)} · ${planStatusOf(document.notes)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`  ${planRefOf(plan)} · 读取失败: ${message.split("\n")[0] ?? message}`);
    }
  }
  return lines.join("\n");
};

const executeRead = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: ExtensionToolContext,
): Promise<string> => {
  const op = requiredString(args, "op");
  const planArgument = optionalString(args, "plan");
  const workspace = runtime.workspace(exec);
  if (op === "plans") return formatPlans(runtime, workspace);

  const plan = await resolvePlan(workspace, runtime.domainRoot, planArgument);
  const { document } = await openDocument(plan.directory, runtime.limits());

  switch (op) {
    case "notes": {
      const lines = [formatPlanHeader(plan, document)];
      if (document.notes.length === 0) {
        lines.push("（还没有 note）");
      } else {
        lines.push(...document.notes.map((note) => `  ${formatNoteLine(note)}`));
      }
      return lines.join("\n");
    }
    case "get": {
      const ids = optionalStringArray(args, "ids") ?? [requiredString(args, "note")];
      const blocks: string[] = [];
      for (const id of ids) {
        const note = document.notes.find((candidate) => candidate.id === id);
        if (note === undefined) throw new Error(`没有 note ${id}`);
        const dependencies = note.blocked_by.length === 0 ? "—" : note.blocked_by.join(", ");
        blocks.push(
          [
            `## ${note.id} ${note.title}`,
            `状态: ${note.status} · 依赖: ${dependencies} · 更新: ${note.updated_at || "—"}`,
            `摘要: ${note.description}`,
            ...(note.evidence.length === 0
              ? []
              : ["证据:", ...note.evidence.map((item) => `- ${item}`)]),
            "正文:",
            note.content,
          ].join("\n"),
        );
      }
      return blocks.join("\n\n");
    }
    case "ready": {
      const unfinished = document.notes.filter((note) => note.status !== "completed");
      const groups = todoGroups(document.notes);
      const lines = [formatPlanHeader(plan, document)];
      if (unfinished.length === 0) {
        lines.push("未完成（0）: 全部 note 已完成。");
        return lines.join("\n");
      }
      lines.push(`未完成（${unfinished.length}）:`);
      groups.forEach((group, index) => {
        lines.push(`第 ${index + 1} 组（${group.notes.length}）:`);
        for (const note of group.notes) {
          const dependencies = note.blocked_by.filter((id) => {
            const dependency = document.notes.find((candidate) => candidate.id === id);
            return dependency !== undefined && dependency.status !== "completed";
          });
          const suffix = dependencies.length > 0 ? `（依赖: ${dependencies.join(", ")}）` : "";
          lines.push(`  - ${formatNoteLine(note)}${suffix}`);
        }
      });
      lines.push("下一步: 组内按从上到下执行；前置已完成的 note 可并行用 subagent 分担。");
      return lines.join("\n");
    }
    case "graph": {
      const id = requiredString(args, "note");
      const note = document.notes.find((candidate) => candidate.id === id);
      if (note === undefined) throw new Error(`没有 note ${id}`);
      const graph = graphOf(document.notes, id);
      const describe = (ids: readonly string[]): string =>
        ids.length === 0
          ? "—"
          : ids
              .map((item) => {
                const target = document.notes.find((candidate) => candidate.id === item);
                return target === undefined ? item : `${item} ${target.title}（${target.status}）`;
              })
              .join("；");
      return [
        `${note.id} ${note.title}（${note.status}）`,
        `上游（直接+传递）: ${describe(graph.upstream)}`,
        `下游（直接+传递）: ${describe(graph.downstream)}`,
      ].join("\n");
    }
    case "index": {
      const lines = [formatPlanHeader(plan, document)];
      if (document.index.length === 0) {
        lines.push("（索引为空；用 nano_flow_write 的 set_index 维护关键 note）");
        return lines.join("\n");
      }
      for (const id of document.index) {
        const note = document.notes.find((candidate) => candidate.id === id);
        lines.push(`  ${note === undefined ? `${id}（不存在）` : formatNoteLine(note)}`);
      }
      return lines.join("\n");
    }
    case "search": {
      const query = requiredString(args, "query");
      const hits = searchNotes(document.notes, query);
      const lines = [`命中 ${hits.length} 条（${query}）`];
      lines.push(...hits.map((note) => `  ${formatNoteLine(note)}`));
      return lines.join("\n");
    }
    case "resume": {
      const ready = readyNotes(document.notes);
      const awaiting = document.notes.filter((note) => note.status === "awaiting_verification");
      const blocked = document.notes.filter((note) => note.status === "blocked");
      const storyBytes = await describeBytes(plan, "story.md");
      const specBytes = await describeBytes(plan, "spec.md");
      const lines = [
        `Plan: ${planRefOf(plan)}`,
        `目录: ${plan.directory}`,
        `状态: ${statusLine(document)} · ${planStatusOf(document.notes)}`,
        `story.md: ${storyBytes} · spec.md: ${specBytes}`,
        `关键索引（${document.index.length}）:`,
      ];
      if (document.index.length === 0) {
        lines.push("  （空）");
      } else {
        for (const id of document.index) {
          const note = document.notes.find((candidate) => candidate.id === id);
          lines.push(`  ${note === undefined ? `${id}（不存在）` : formatNoteLine(note)}`);
        }
      }
      lines.push(`可推进（${ready.length}）:`);
      lines.push(
        ...(ready.length === 0 ? ["  （无）"] : ready.map((note) => `  ${formatNoteLine(note)}`)),
      );
      if (awaiting.length > 0) {
        lines.push(`等待验证（${awaiting.length}）:`);
        lines.push(...awaiting.map((note) => `  ${formatNoteLine(note)}`));
      }
      if (blocked.length > 0) {
        lines.push(`阻塞（${blocked.length}）:`);
        lines.push(...blocked.map((note) => `  ${formatNoteLine(note)}`));
      }
      lines.push(
        "下一步: 读 spec.md 与 story.md，只读报告进度与可推进队列；恢复报告后等用户第一条消息放行再执行，需要澄清则进入 ask。",
      );
      return lines.join("\n");
    }
    default:
      throw new Error(`未知的 op: ${op}（可用: ${READ_OPS.join(" | ")}）`);
  }
};

/**
 * 构造 `nano_flow_read`：只读 Plan、notes DAG 与恢复包。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createReadTool = (runtime: ToolRuntime): ToolDefinition => ({
  name: "nano_flow_read",
  label: "Nano Flow Read",
  description:
    "只读 Nano Flow 的 Plan 与 notes DAG。plans 列工作区里的 Plan；notes 列某个 Plan 的 note 摘要；get 取正文；ready 取未完成 notes 的依赖分组列表；graph 查直接与传递依赖；index 看关键索引；search 检索；resume 取恢复包（路径、大小、索引、可推进、等待验证、阻塞）。",
  promptSnippet: "Read Nano Flow plans, notes DAG and resume packages.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: [...READ_OPS],
        description: "plans | notes | get | ready | graph | index | search | resume",
      },
      plan: {
        type: "string",
        description: "<domain>/<lifecycle>/<name>；工作区只有一个 active 的 Plan 时可省略",
      },
      note: { type: "string", description: "note id（get / graph）" },
      ids: {
        type: "array",
        items: { type: "string" },
        description: "get 批量读取的 note id 列表",
      },
      query: { type: "string", description: "search 的检索词" },
    },
    required: ["op"],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    return { content: textBlocks(await executeRead(runtime, asArguments(raw), exec)), details: {} };
  },
});
