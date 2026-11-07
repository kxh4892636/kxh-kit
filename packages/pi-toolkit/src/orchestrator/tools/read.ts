import { readFile, stat } from "node:fs/promises";
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
import { loadDocument, NOTES_FILE } from "../store.js";

const READ_OPS = [
  "plans",
  "notes",
  "get",
  "ready",
  "graph",
  "index",
  "search",
  "resume",
  "inspect",
] as const;

const describeBytes = async (plan: PlanRef, fileName: string): Promise<string> => {
  try {
    const info = await stat(join(plan.directory, fileName));
    return `${info.size} 字节`;
  } catch {
    return "缺失";
  }
};

const formatPlans = async (
  runtime: ToolRuntime,
  workspace: string,
  lockedPlan?: string,
): Promise<string> => {
  const all = await listPlans(workspace, runtime.domainRoot);
  // worker 只看得到自己的 plan：跨 plan 的信息只经编排方转达。
  const plans =
    lockedPlan === undefined
      ? all
      : all.filter(
          (plan) => plan.directory === lockedPlan || lockedPlan.startsWith(plan.directory),
        );
  if (lockedPlan !== undefined && plans.length === 0) {
    return `本 worker 只作用于自己的 Plan（${lockedPlan}），当前没有可列的其它 Plan。`;
  }
  if (plans.length === 0) {
    return `工作区 ${workspace} 里还没有 Plan（域根 ${runtime.domainRoot}）。用 orchestrator_write 的 init 建一个。`;
  }
  const lines: string[] = [
    `工作区: ${workspace}`,
    `域根: ${runtime.domainRoot}`,
    `Plan（${plans.length}）:`,
  ];
  for (const plan of plans) {
    try {
      const document = await loadDocument(plan.directory, runtime.limits());
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

/**
 * 原始文档视图：文档无法通过校验时，给模型看 id/title/description/content，
 * 由模型决定如何重写，再交给 orchestrator_write 的 repair。
 */
const asText = (value: unknown): string => (typeof value === "string" ? value : "");

const inspectRaw = async (plan: PlanRef): Promise<string> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(plan.directory, NOTES_FILE), "utf8"));
  } catch (error) {
    throw new Error(
      `读取 ${NOTES_FILE} 失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${NOTES_FILE} 根必须是对象`);
  }
  const root = raw as Record<string, unknown>;
  const notes = Array.isArray(root["notes"]) ? root["notes"] : [];
  const index = Array.isArray(root["index"]) ? root["index"] : [];
  const lines = [
    `Plan: ${planRefOf(plan)}（原始视图，未通过校验）`,
    `index: ${index.length === 0 ? "（空）" : index.join(", ")}`,
    "用 orchestrator_write 的 repair 提交模型判断后的 title/description/content 与 index。",
  ];
  for (const note of notes) {
    if (typeof note !== "object" || note === null) continue;
    const record = note as Record<string, unknown>;
    lines.push(
      "",
      `## ${asText(record["id"])} ${asText(record["title"])}`,
      `状态: ${asText(record["status"])} · 依赖: ${
        Array.isArray(record["blocked_by"]) ? record["blocked_by"].join(", ") : "—"
      }`,
      `摘要: ${asText(record["description"])}`,
      "正文:",
      asText(record["content"]),
    );
  }
  return lines.join("\n");
};

const executeRead = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: ExtensionToolContext,
): Promise<string> => {
  const op = requiredString(args, "op");
  const planArgument = runtime.lockedPlan ?? optionalString(args, "plan");
  const workspace = runtime.workspace(exec);
  if (op === "plans") return formatPlans(runtime, workspace, runtime.lockedPlan);

  const plan = await resolvePlan(workspace, runtime.domainRoot, planArgument);
  runtime.onPlan?.(plan);
  if (op === "inspect") return inspectRaw(plan);
  const document = await loadDocument(plan.directory, runtime.limits());

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
      lines.push(
        "下一步: 无 blocked_by 依赖的 note 可分组并行（一组一个 worker，用 orchestrator_dispatch 的 notes 给出）；组内按依赖顺序串行。",
      );
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
        lines.push("（索引为空；用 orchestrator_write 的 set_index 维护关键 note）");
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
      const waiting = document.notes.filter((note) => note.status === "waiting");
      const awaitingAnswer = waiting.filter((note) => note.needs === "answer");
      const awaitingReview = waiting.filter((note) => note.needs !== "answer");
      const blocked = document.notes.filter((note) => note.status === "blocked");
      const storyBytes = await describeBytes(plan, "story.md");
      const specBytes = await describeBytes(plan, "spec.md");
      const planRef = planRefOf(plan);
      // 崩溃凭据只在本 plan 命中时读；移除也只移除本 plan 的条目。
      const interrupted = runtime.interrupted?.read();
      const crashed =
        interrupted !== undefined && interrupted.plans.includes(planRef) ? interrupted : undefined;
      const lines = [
        `Plan: ${planRef}`,
        `目录: ${plan.directory}`,
        `状态: ${statusLine(document)} · ${planStatusOf(document.notes)}`,
        ...(crashed === undefined ? [] : [`上次崩溃: ${crashed.at} · ${crashed.reason}`]),
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
      if (awaitingAnswer.length > 0) {
        lines.push(`等待回答（${awaitingAnswer.length}）:`);
        lines.push(...awaitingAnswer.map((note) => `  ${formatNoteLine(note)}`));
      }
      if (awaitingReview.length > 0) {
        lines.push(`等待验证（${awaitingReview.length}）:`);
        lines.push(...awaitingReview.map((note) => `  ${formatNoteLine(note)}`));
      }
      if (blocked.length > 0) {
        lines.push(`阻塞（${blocked.length}）:`);
        lines.push(...blocked.map((note) => `  ${formatNoteLine(note)}`));
      }
      lines.push(
        "下一步: 读 spec.md 与 story.md，只读报告进度与可推进队列；恢复报告后等用户第一条消息放行再执行，需要澄清则进入 ask。",
      );
      if (crashed !== undefined) {
        runtime.interrupted?.forget(planRef);
        lines.push("崩溃凭据: 已移除本 Plan 条目（其它 Plan 的条目保留）。");
      }
      return lines.join("\n");
    }
    default:
      throw new Error(`未知的 op: ${op}（可用: ${READ_OPS.join(" | ")}）`);
  }
};

/**
 * 构造 `orchestrator_read`：只读 Plan、notes DAG 与恢复包。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createReadTool = (runtime: ToolRuntime): ToolDefinition => ({
  name: "orchestrator_read",
  label: "Orchestrator Read",
  description:
    "只读 Orchestrator 的 Plan 与 notes DAG。plans 列工作区里的 Plan；notes 列某个 Plan 的 note 摘要；get 取正文；ready 取未完成 notes 的依赖分组列表；graph 查直接与传递依赖；index 看关键索引；search 检索；resume 取恢复包（路径、大小、索引、可推进、等待验证、阻塞；命中崩溃凭据时一并展示并移除该条）；inspect 在文档无法通过校验时给出原始视图，供 orchestrator_write 的 repair 使用。",
  promptSnippet: "Read Orchestrator plans, notes DAG and resume packages.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: [...READ_OPS],
        description: "plans | notes | get | ready | graph | index | search | resume | inspect",
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
