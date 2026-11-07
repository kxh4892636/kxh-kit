import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import { Type } from "typebox";
import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { formatIssues, runCheck } from "../check-runner.js";
import {
  emptyDocument,
  nextNoteId,
  nowIso,
  parseDocument,
  type NoteNode,
  type PlanDocument,
} from "../dag.js";
import { isPlanLifecycle, planRefOf, resolvePlan, type PlanRef } from "../plan.js";
import {
  commitDocument,
  documentLockKey,
  loadDocument,
  NOTES_FILE,
  withDocumentLock,
} from "../store.js";
import {
  asArguments,
  optionalString,
  optionalStringArray,
  requiredString,
  requiredStringArray,
  statusLine,
  textBlocks,
  checkScriptPath,
  type ToolRuntime,
} from "./shared.js";

const WRITE_OPS = [
  "init",
  "create",
  "update",
  "link",
  "status",
  "complete",
  "set_index",
  "merge",
  "delete",
  "move",
  "repair",
] as const;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const PLAN_NAME = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const HAN = /\p{Script=Han}/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isValidDate = (value: string): boolean => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return (
    [
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("-") === value
  );
};

const domainsDirectoryOf = (runtime: ToolRuntime, workspace: string): string => {
  return isAbsolute(runtime.domainRoot) ? runtime.domainRoot : join(workspace, runtime.domainRoot);
};

const writeIfMissing = async (file: string, content: string): Promise<void> => {
  if (existsSync(file)) return;
  await writeFile(file, content, "utf8");
};

const ensureDomain = async (
  runtime: ToolRuntime,
  workspace: string,
  domain: string,
): Promise<string[]> => {
  if (!KEBAB.test(domain)) throw new Error(`domain 必须是 kebab-case: ${domain}`);
  const domainsDirectory = domainsDirectoryOf(runtime, workspace);
  const domainDirectory = join(domainsDirectory, domain);
  await mkdir(domainDirectory, { recursive: true });
  const created: string[] = [];
  const contextFile = join(domainDirectory, "CONTEXT.md");
  if (!existsSync(contextFile)) {
    await writeFile(contextFile, `# ${domain}\n\n${domain} 域的职责与术语，待补。\n`, "utf8");
    created.push(contextFile);
  }
  const questionsFile = join(domainDirectory, "QUESTIONS.md");
  if (!existsSync(questionsFile)) {
    await writeFile(questionsFile, `# ${domain} 常见问题\n\n暂无已验证的重复问题。\n`, "utf8");
    created.push(questionsFile);
  }
  if (!isAbsolute(runtime.domainRoot)) {
    const mapFile = join(workspace, "CONTEXT-MAP.md");
    const link = `./${runtime.domainRoot}/${domain}/CONTEXT.md`;
    try {
      const current = await readFile(mapFile, "utf8");
      if (!current.includes(`](${link})`)) {
        await writeFile(
          mapFile,
          `${current.trimEnd()}\n- [${domain}](${link}) - ${domain} 域。\n`,
          "utf8",
        );
        created.push(mapFile);
      }
    } catch {
      await writeFile(
        mapFile,
        `# Context Map\n\n## Contexts\n\n- [${domain}](${link}) - ${domain} 域。\n\n## Relationships\n`,
        "utf8",
      );
      created.push(mapFile);
    }
  }
  return created;
};

const findNote = (document: PlanDocument, id: string): NoteNode => {
  const note = document.notes.find((candidate) => candidate.id === id);
  if (note === undefined) throw new Error(`没有 note ${id}`);
  return note;
};

const replaceNote = (document: PlanDocument, next: NoteNode): PlanDocument => {
  return {
    ...document,
    notes: document.notes.map((note) => (note.id === next.id ? next : note)),
  };
};

const initPlan = async (
  runtime: ToolRuntime,
  workspace: string,
  args: Record<string, unknown>,
): Promise<string> => {
  const domain = requiredString(args, "domain");
  const name = requiredString(args, "name");
  const lifecycle = optionalString(args, "lifecycle") ?? "active";
  if (!isPlanLifecycle(lifecycle)) {
    throw new Error(`lifecycle 必须是 active | reference | archived`);
  }
  const match = PLAN_NAME.exec(name);
  if (match === null || !isValidDate(match[1] ?? "") || !HAN.test(match[2] ?? "")) {
    throw new Error(`name 必须是 YYYY-MM-DD-中文工作名: ${name}`);
  }
  const domainsDirectory = domainsDirectoryOf(runtime, workspace);
  const planDirectory = join(domainsDirectory, domain, "plans", lifecycle, name);
  if (existsSync(planDirectory)) throw new Error(`Plan 已存在: ${domain}/${lifecycle}/${name}`);
  const created = await ensureDomain(runtime, workspace, domain);
  return withDocumentLock(documentLockKey(planDirectory), async () => {
    await mkdir(planDirectory, { recursive: true });
    const title = name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
    await writeIfMissing(join(planDirectory, "story.md"), `# ${title}\n`);
    await writeIfMissing(join(planDirectory, "spec.md"), `# ${title}\n`);
    await commitDocument(planDirectory, emptyDocument(), runtime.limits());
    return [
      `已建 Plan: ${domain}/${lifecycle}/${name}`,
      `目录: ${planDirectory}`,
      ...(created.length === 0 ? [] : [`顺带创建: ${created.join("、")}`]),
      "下一步: 写 story.md 与 spec.md，再用 create 建 note。",
    ].join("\n");
  });
};

const movePlan = async (
  runtime: ToolRuntime,
  workspace: string,
  args: Record<string, unknown>,
): Promise<string> => {
  const plan = await resolvePlan(workspace, runtime.domainRoot, optionalString(args, "plan"));
  const lifecycle = requiredString(args, "lifecycle");
  if (!isPlanLifecycle(lifecycle)) {
    throw new Error(`lifecycle 必须是 active | reference | archived`);
  }
  if (lifecycle === plan.lifecycle) return `Plan 已在 ${lifecycle}: ${planRefOf(plan)}`;
  const target = join(
    domainsDirectoryOf(runtime, workspace),
    plan.domain,
    "plans",
    lifecycle,
    plan.name,
  );
  if (existsSync(target)) throw new Error(`目标已存在: ${target}`);
  await mkdir(dirname(target), { recursive: true });
  await rename(plan.directory, target);
  return `已迁移: ${planRefOf(plan)} → ${plan.domain}/${lifecycle}/${plan.name}`;
};

const completeNote = async (
  runtime: ToolRuntime,
  workspace: string,
  plan: PlanRef,
  document: PlanDocument,
  args: Record<string, unknown>,
): Promise<string> => {
  const id = requiredString(args, "note");
  const evidence = requiredStringArray(args, "evidence");
  const note = findNote(document, id);
  if (note.status === "completed") return `note ${id} 已经是 completed。`;
  if (runtime.role === "worker" && runtime.released?.(id) !== true) {
    throw new Error(
      `note ${id} 尚未被放行：worker 只能把 note 置 waiting(needs=review) 并用 orchestrator_report 上报，等编排方下发 pass 后才能 complete。`,
    );
  }
  if (note.status !== "waiting" || note.needs !== "review") {
    throw new Error(
      `note ${id} 当前是 ${note.status}${
        note.needs === undefined ? "" : `/${note.needs}`
      }，不能直接 complete；先 status=waiting 且 needs=review，验证通过后再 complete`,
    );
  }
  const result = await runCheck({
    script: checkScriptPath(),
    workspace,
    domainsPath: runtime.domainRoot,
    limits: runtime.limits(),
    planRef: planRefOf(plan),
  });
  if (!result.ok) {
    throw new Error(`Plan 校验未通过，不能标记完成：\n${formatIssues(result.errors)}`);
  }
  const next: NoteNode = {
    id: note.id,
    title: note.title,
    description: note.description,
    status: "completed",
    blocked_by: note.blocked_by,
    evidence: [...note.evidence, ...evidence],
    updated_at: nowIso(),
    content: note.content,
  };
  const committed = await commitDocument(
    plan.directory,
    replaceNote(document, next),
    runtime.limits(),
  );
  // 口径 A：`complete` 即触发组的现场回收（与 worker settle 路径同一份实现）。
  // note 已经落库，回收失败不能让整次调用变成异常：结论折成返回值里的一行。
  const recycle =
    runtime.onNoteCompleted === undefined
      ? undefined
      : await runtime.onNoteCompleted({ plan, workspace, note: id }).then(
          (line) => line,
          (error: unknown) => `✗ 回收触发失败：${messageOf(error)}`,
        );
  const remaining = committed.notes.filter((item) => item.status !== "completed").length;
  return [
    `已完成 note ${id} ${note.title}`,
    ...(recycle === undefined ? [] : [recycle]),
    statusLine(committed),
    remaining === 0
      ? "全部 note 已完成；确认参考价值后 move 到 reference。"
      : "回 orchestrator_read 的 ready 看下一条。",
  ].join("\n");
};

const mergeNotes = async (
  runtime: ToolRuntime,
  plan: PlanRef,
  document: PlanDocument,
  args: Record<string, unknown>,
): Promise<string> => {
  const into = findNote(document, requiredString(args, "into"));
  const from = findNote(document, requiredString(args, "from"));
  if (into.id === from.id) throw new Error("merge 的 into 与 from 不能是同一条");
  const merged: NoteNode = {
    ...into,
    content: `${into.content}\n\n---\n\n${from.content}`,
    evidence: [...into.evidence, ...from.evidence],
    updated_at: nowIso(),
  };
  const notes = document.notes
    .filter((note) => note.id !== from.id)
    .map((note) => {
      if (note.id === into.id) return merged;
      if (!note.blocked_by.includes(from.id)) return note;
      const blockedBy = [...new Set(note.blocked_by.map((id) => (id === from.id ? into.id : id)))];
      return { ...note, blocked_by: blockedBy, updated_at: nowIso() };
    });
  const index = [...new Set(document.index.filter((id) => id !== from.id))];
  const committed = await commitDocument(
    plan.directory,
    { version: 1, index, notes },
    runtime.limits(),
  );
  return `已合并 ${from.id} → ${into.id}；${statusLine(committed)}`;
};

/** `repair` 的一条 note 修正；值由模型判断，脚本不做截断或删除。 */
interface NoteRepair {
  readonly note: string;
  readonly title?: string;
  readonly description?: string;
  readonly content?: string;
}

const parseNoteRepairs = (value: unknown): NoteRepair[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("notes 必须是数组");
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`notes[${index}] 必须是对象`);
    }
    const record = item as Record<string, unknown>;
    const note = record["note"];
    if (typeof note !== "string" || note === "") throw new Error(`notes[${index}].note 必填`);
    const fields: { -readonly [K in keyof NoteRepair]?: NoteRepair[K] } = { note };
    for (const key of ["title", "description", "content"] as const) {
      const candidate = record[key];
      if (candidate === undefined) continue;
      if (typeof candidate !== "string") throw new Error(`notes[${index}].${key} 必须是字符串`);
      fields[key] = candidate;
    }
    if (
      fields.title === undefined &&
      fields.description === undefined &&
      fields.content === undefined
    ) {
      throw new Error(`notes[${index}] 至少需要 title / description / content 之一`);
    }
    return fields as NoteRepair;
  });
};

/**
 * 用模型给出的值修复一个无法通过校验的文档。
 * 脚本不自动截断摘要、不自动删除索引项，只应用显式传入的替换并重新校验。
 */
const repairPlan = async (
  runtime: ToolRuntime,
  plan: PlanRef,
  args: Record<string, unknown>,
): Promise<string> => {
  const repairs = parseNoteRepairs(args["notes"]);
  const index = optionalStringArray(args, "index");
  if (repairs.length === 0 && index === undefined) {
    throw new Error("repair 至少需要 notes 或 index");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(plan.directory, NOTES_FILE), "utf8"));
  } catch (error) {
    throw new Error(`读取 ${NOTES_FILE} 失败（仅合法 JSON 才能修复）: ${messageOf(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${NOTES_FILE} 根必须是对象`);
  }
  const root = raw as Record<string, unknown>;
  const notes = root["notes"];
  if (!Array.isArray(notes)) throw new Error(`${NOTES_FILE} 的 notes 必须是数组`);
  for (const repair of repairs) {
    const target = notes.find(
      (note) =>
        typeof note === "object" && note !== null && (note as { id?: unknown }).id === repair.note,
    );
    if (target === undefined) throw new Error(`没有 note ${repair.note}`);
    Object.assign(target as Record<string, unknown>, {
      ...(repair.title === undefined ? {} : { title: repair.title }),
      ...(repair.description === undefined ? {} : { description: repair.description }),
      ...(repair.content === undefined ? {} : { content: repair.content }),
    });
  }
  if (index !== undefined) root["index"] = index;
  const document = parseDocument(root, runtime.limits());
  const committed = await commitDocument(plan.directory, document, runtime.limits());
  return `已修复：${repairs.map((item) => item.note).join(", ") || "无 note"}${
    index === undefined ? "" : `；索引 ${index.length} 项`
  }
${statusLine(committed)}`;
};

/** worker 不能做的 plan 级动作；拒绝原因直接给模型。 */
const WORKER_REFUSALS: Readonly<Record<string, string>> = {
  init: "init 属于 plan 级动作：worker 只能在本 plan 内工作，新建 Plan 由编排方执行。",
  move: "move 属于 plan 级动作：归档由编排方在用户决定后执行。",
};

/** 解析目标 Plan：worker 锁定自己的 plan，忽略 `plan` 参数。 */
const planFor = async (
  runtime: ToolRuntime,
  workspace: string,
  args: Record<string, unknown>,
): Promise<PlanRef> => {
  const ref = runtime.lockedPlan ?? optionalString(args, "plan");
  const plan = await resolvePlan(workspace, runtime.domainRoot, ref);
  // 编排方靠它记住“当前 Plan”：轮转种子指名要恢复的那一个。
  runtime.onPlan?.(plan);
  return plan;
};

const executeWrite = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: ExtensionToolContext,
): Promise<string> => {
  const op = requiredString(args, "op");
  const workspace = runtime.workspace(exec);

  const refusal = runtime.role === "worker" ? WORKER_REFUSALS[op] : undefined;
  if (refusal !== undefined) throw new Error(refusal);

  if (op === "init") return initPlan(runtime, workspace, args);
  if (op === "move") return movePlan(runtime, workspace, args);

  const plan = await planFor(runtime, workspace, args);
  // 同一个 notes.json 的读-改-写必须整体串行：多个 worker 并行推进同一 Plan 的不同组时，
  // 两个 op 若各自「读→改→写」，后写的会盖掉先写的。锁是进程内的（见 store.ts）。
  return withDocumentLock(documentLockKey(plan.directory), () =>
    writePlan(runtime, workspace, plan, op, args),
  );
};

/** 单个 Plan 上的写操作；调用时已持有该 Plan 的写回锁。 */
const writePlan = async (
  runtime: ToolRuntime,
  workspace: string,
  plan: PlanRef,
  op: string,
  args: Record<string, unknown>,
): Promise<string> => {
  if (op === "repair") return repairPlan(runtime, plan, args);
  const document = await loadDocument(plan.directory, runtime.limits());

  switch (op) {
    case "create": {
      const note: NoteNode = {
        id: nextNoteId(document.notes),
        title: requiredString(args, "title"),
        description: requiredString(args, "description"),
        status: "pending",
        blocked_by: optionalStringArray(args, "blocked_by") ?? [],
        evidence: [],
        updated_at: nowIso(),
        content: requiredString(args, "content"),
      };
      const committed = await commitDocument(
        plan.directory,
        { ...document, notes: [...document.notes, note] },
        runtime.limits(),
      );
      const hint =
        document.notes.length === 0
          ? "这是首条 note：保持拷问与定案记录的角色；之后按依赖顺序 create 后续 note。"
          : "用 status 置 in_progress 开工，依赖用 blocked_by 表达。";
      return `已创建 note ${note.id} ${note.title}；${statusLine(committed)}\n下一步: ${hint}`;
    }
    case "update": {
      const id = requiredString(args, "note");
      const note = findNote(document, id);
      const title = optionalString(args, "title");
      const description = optionalString(args, "description");
      const content = optionalString(args, "content");
      if (title === undefined && description === undefined && content === undefined) {
        throw new Error("update 至少需要 title / description / content 之一");
      }
      const next: NoteNode = {
        ...note,
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        ...(content === undefined ? {} : { content }),
        updated_at: nowIso(),
      };
      await commitDocument(plan.directory, replaceNote(document, next), runtime.limits());
      return `已更新 note ${id}。`;
    }
    case "link": {
      const id = requiredString(args, "note");
      const note = findNote(document, id);
      const blockedBy = optionalStringArray(args, "blocked_by");
      if (blockedBy === undefined) throw new Error("blocked_by 必填；清空依赖传 []");
      await commitDocument(
        plan.directory,
        replaceNote(document, { ...note, blocked_by: blockedBy, updated_at: nowIso() }),
        runtime.limits(),
      );
      return `已设置 note ${id} 的依赖: ${blockedBy.join(", ")}`;
    }
    case "status": {
      const id = requiredString(args, "note");
      const status = requiredString(args, "status");
      if (status === "completed") throw new Error("completed 只能由 complete 动作设置");
      if (status === "awaiting_verification") {
        throw new Error("awaiting_verification 已改名为 waiting；请用 status=waiting 并给 needs");
      }
      if (!["pending", "in_progress", "waiting", "blocked"].includes(status)) {
        throw new Error("status 必须是 pending | in_progress | waiting | blocked");
      }
      const note = findNote(document, id);
      if (status === "waiting" && note.status === "pending") {
        throw new Error("pending 的 note 不能直接进 waiting；先 status=in_progress");
      }
      const needs = optionalString(args, "needs");
      if (status === "waiting" && needs !== "answer" && needs !== "review") {
        throw new Error("status=waiting 必须给 needs=answer（等人回答）或 needs=review（等验收）");
      }
      const reason = optionalString(args, "reason");
      if (status === "blocked" && (reason === undefined || reason.trim() === "")) {
        throw new Error("status=blocked 必须给 reason（障碍与解除条件）");
      }
      const base: NoteNode = {
        id: note.id,
        title: note.title,
        description: note.description,
        status: status as "pending" | "in_progress" | "waiting" | "blocked",
        blocked_by: note.blocked_by,
        evidence: note.evidence,
        updated_at: nowIso(),
        content: note.content,
      };
      const next: NoteNode =
        status === "blocked"
          ? { ...base, blocked_reason: reason ?? "" }
          : status === "waiting" && (needs === "answer" || needs === "review")
            ? { ...base, needs }
            : base;
      await commitDocument(plan.directory, replaceNote(document, next), runtime.limits());
      return `note ${id} 状态 → ${status}${next.needs === undefined ? "" : `/${next.needs}`}`;
    }
    case "complete":
      return completeNote(runtime, workspace, plan, document, args);
    case "set_index": {
      const ids = optionalStringArray(args, "ids") ?? [];
      await commitDocument(
        plan.directory,
        { ...document, index: [...new Set(ids)] },
        runtime.limits(),
      );
      return `已设置关键索引（${ids.length} 项）: ${ids.join(", ") || "空"}`;
    }
    case "merge":
      return mergeNotes(runtime, plan, document, args);
    case "delete": {
      const id = requiredString(args, "note");
      const target = findNote(document, id);
      const dependents = document.notes.filter((note) => note.blocked_by.includes(id));
      if (dependents.length > 0) {
        throw new Error(
          `note ${id} 仍被依赖（${dependents.map((note) => note.id).join(", ")}）；先用 link 改指或 merge`,
        );
      }
      const notes = document.notes.filter((note) => note.id !== id);
      const index = document.index.filter((item) => item !== id);
      const committed = await commitDocument(
        plan.directory,
        { version: 1, index, notes },
        runtime.limits(),
      );
      return `已删除 note ${id} ${target.title}；${statusLine(committed)}`;
    }
    default:
      throw new Error(`未知的 op: ${op}（可用: ${WRITE_OPS.join(" | ")}）`);
  }
};

/**
 * 构造 `orchestrator_write`：Plan 创建、note CRUD、状态流转与索引维护。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createWriteTool = (runtime: ToolRuntime): ToolDefinition => ({
  name: "orchestrator_write",
  label: "Orchestrator Write",
  description:
    "写 Orchestrator 的 Plan 与 notes DAG。init 建 Plan；create / update 维护 note；link 改依赖；status 设 pending / in_progress / waiting（需 needs: answer | review）/ blocked；complete 只接受 waiting 且 needs=review 的 note，写 evidence 并通过 Plan 校验后置 completed；组内 note 因此全 completed 时，complete 立刻做 --ff-only 合并并回收现场（失败时返回值里带 `✗ 未合并：…；现场保留 <path>`）；set_index 维护关键索引；merge / delete 合并删除；move 迁移生命周期；repair 用模型给出的 title/description/content 与 index 修复无法通过校验的文档（脚本不自作主张截断或删除）。completed 只能由 complete 设置。",
  promptSnippet: "Create and maintain Orchestrator plans and their notes DAG.",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      op: {
        type: "string",
        enum: [...WRITE_OPS],
        description:
          "init | create | update | link | status | complete | set_index | merge | delete | move | repair",
      },
      plan: {
        type: "string",
        description: "<domain>/<lifecycle>/<name>；工作区只有一个 active 的 Plan 时可省略",
      },
      domain: { type: "string", description: "init 的领域名（kebab-case）" },
      name: { type: "string", description: "init 的 Plan 目录名 YYYY-MM-DD-中文工作名" },
      lifecycle: {
        type: "string",
        enum: ["active", "reference", "archived"],
        description: "init / move 的目标生命周期",
      },
      note: {
        type: "string",
        description: "note id（update / link / status / complete / delete）",
      },
      title: { type: "string", description: "note 标题或 init 省略" },
      description: {
        type: "string",
        description: "一句话摘要（create 必填；字数上限见 orchestrator_check 的 limits）",
      },
      content: { type: "string", description: "note 正文（create 必填）" },
      blocked_by: {
        type: "array",
        items: { type: "string" },
        description: "直接依赖的 note id 列表",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "waiting", "blocked"],
        description: "status 动作的目标状态",
      },
      reason: { type: "string", description: "status=blocked 时的障碍与解除条件" },
      needs: {
        type: "string",
        enum: ["answer", "review"],
        description: "status=waiting 时必填：answer 等人回答，review 等人验收",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "complete 的完成凭据（命令、输出、文件、commit）",
      },
      ids: {
        type: "array",
        items: { type: "string" },
        description: "set_index 的关键 note id 列表",
      },
      into: { type: "string", description: "merge 保留的 note id" },
      from: { type: "string", description: "merge 被并入并删除的 note id" },
      notes: {
        type: "array",
        description: "repair 的模型修正：按 note id 替换 title/description/content",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            note: { type: "string", description: "note id" },
            title: { type: "string" },
            description: { type: "string", description: "模型重写后的一句话摘要" },
            content: { type: "string", description: "模型重写后的正文" },
          },
          required: ["note"],
        },
      },
    },
    required: ["op"],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, exec) {
    return {
      content: textBlocks(await executeWrite(runtime, asArguments(raw), exec)),
      details: {},
    };
  },
});
