import fs from "node:fs";
import path from "node:path";

import {
  DOMAINS_DIR,
  CONTEXT_MAP_FILE,
  DEFAULT_LIMITS,
  KEBAB,
  PLAN_NAME,
  HAN,
  SPEC_STATUSES,
  addIssue,
  addFixed,
  describe,
  readEntries,
  exists,
  isValidDate,
  sortByName,
  LIFECYCLES,
} from "./lib/base.mjs";
import { readDocument } from "./lib/checks.mjs";
import { propagateRenames, setFrontmatterScalar, writeFixed } from "./lib/fix.mjs";
import {
  renderTracked,
  renderNotesIndex,
  findTrackedRange,
  writeGenerated,
  renderContextMap,
  renderQuestionsIndex,
  renderAdrIndex,
  renderWorkflowsIndex,
} from "./lib/render.mjs";

/** 名字规则与 YAML 头解析只有 `lib/` 一处实现；这里转出给扩展侧的 TypeScript 用。 */
export {
  HAN,
  KEBAB,
  LIFECYCLES,
  NUMBERED_NAME,
  PLAN_NAME,
  isValidDate,
  nameProblem,
  parseFrontmatter,
} from "./lib/base.mjs";

const scanNumberedDocuments = (ctx, directory, kind, options) => {
  if (!exists(directory)) {
    if (options.required === true) {
      addIssue(ctx.errors, ctx.rootDir, directory, "missing", `缺少 ${kind} 目录`);
    }
    return [];
  }
  const documents = [];
  const names = new Set();
  for (const entry of readEntries(directory, ctx)) {
    if (entry.name === "index.md") continue;
    if (entry.name === "INDEX.md") {
      addIssue(ctx.errors, ctx.rootDir, directory, "index", "索引文件名必须是小写 index.md");
      continue;
    }
    if (entry.isDirectory()) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(directory, entry.name),
        "layout",
        "这里只允许文件",
      );
      continue;
    }
    if (!entry.name.endsWith(".md")) {
      addIssue(ctx.errors, ctx.rootDir, path.join(directory, entry.name), "layout", "只允许 .md");
      continue;
    }
    const file = path.join(directory, entry.name);
    const base = entry.name.slice(0, -3);
    const document = readDocument(ctx, file, kind, { required: true, expectedName: base });
    if (document === null) continue;
    if (document.data.name !== base) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "name",
        `name 必须与文件名一致：期望 ${base}，实际 ${document.data.name}`,
      );
    }
    if (names.has(document.data.name)) {
      addIssue(ctx.errors, ctx.rootDir, file, "name", `name 重复 ${document.data.name}`);
    }
    names.add(document.data.name);
    documents.push({
      name: document.data.name,
      description: document.data.description,
      status: document.data.status,
      data: document.data,
      body: document.body,
      content: document.content,
      file,
      fileName: entry.name,
    });
  }
  documents.sort(sortByName);
  if (options.continuous === true) {
    for (const [index, document] of documents.entries()) {
      const expected = String(index + 1).padStart(3, "0");
      if (!document.name.startsWith(`${expected}-`)) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          document.file,
          "number",
          `编号必须从 001 连续，期望 ${expected}`,
        );
      }
    }
  }
  return documents;
};

const scanWorkflows = (ctx, directory) => {
  if (!exists(directory)) return [];
  const documents = [];
  const names = new Set();
  for (const entry of readEntries(directory, ctx)) {
    if (entry.name === "index.md") continue;
    if (entry.name === "INDEX.md") {
      addIssue(ctx.errors, ctx.rootDir, directory, "index", "索引文件名必须是小写 index.md");
      continue;
    }
    if (!entry.isDirectory()) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(directory, entry.name),
        "layout",
        "workflow 必须是目录",
      );
      continue;
    }
    const base = entry.name;
    const file = path.join(directory, base, `${base}.md`);
    const document = readDocument(ctx, file, "workflow", { required: true, expectedName: base });
    if (document === null) continue;
    if (document.data.name !== base) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "name",
        `name 必须与目录/文件名一致：期望 ${base}，实际 ${document.data.name}`,
      );
    }
    if (names.has(document.data.name)) {
      addIssue(ctx.errors, ctx.rootDir, file, "name", `name 重复 ${document.data.name}`);
    }
    names.add(document.data.name);
    documents.push({
      name: document.data.name,
      description: document.data.description,
      data: document.data,
      body: document.body,
      content: document.content,
      file,
      fileName: path.join(base, `${base}.md`).replaceAll("\\", "/"),
    });
  }
  documents.sort(sortByName);
  for (const [index, document] of documents.entries()) {
    const expected = String(index + 1).padStart(3, "0");
    if (!document.name.startsWith(`${expected}-`)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        document.file,
        "number",
        `编号必须从 001 连续，期望 ${expected}`,
      );
    }
  }
  return documents;
};

const scanPlan = (ctx, planDirectory, planName) => {
  const specFile = path.join(planDirectory, "spec.md");
  const spec = readDocument(ctx, specFile, "spec", { required: true });
  const names = new Set();
  const notes = [];
  for (const entry of readEntries(planDirectory, ctx)) {
    if (entry.isDirectory()) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(planDirectory, entry.name),
        "layout",
        "Plan 内不允许嵌套目录",
      );
      continue;
    }
    if (entry.name === "spec.md" || entry.name === "notes_index.md") continue;
    if (entry.name === "story.md") {
      addIssue(
        ctx.warnings,
        ctx.rootDir,
        path.join(planDirectory, entry.name),
        "legacy",
        "story.md 已并入 spec.md，可删除",
      );
      continue;
    }
    if (entry.name.startsWith("spec-")) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(planDirectory, entry.name),
        "name",
        "spec 不拆分；把细节移到 note 或领域文档，并在 spec.md 留下指针",
      );
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    if (!/^\d{3}-.+\.md$/u.test(entry.name)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(planDirectory, entry.name),
        "name",
        "note 文件名必须是 NNN-中文标题.md",
      );
      continue;
    }
    const file = path.join(planDirectory, entry.name);
    const document = readDocument(ctx, file, "note", {
      required: true,
      expectedName: entry.name.slice(0, -3),
    });
    if (document === null) continue;
    if (document.data.name !== entry.name.slice(0, -3)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "name",
        `name 必须与文件名一致：期望 ${entry.name.slice(0, -3)}，实际 ${document.data.name}`,
      );
    }
    if (names.has(document.data.name)) {
      addIssue(ctx.errors, ctx.rootDir, file, "name", `name 重复 ${document.data.name}`);
    }
    names.add(document.data.name);
    notes.push({
      name: document.data.name,
      description: document.data.description,
      status: document.data.status,
      reason: document.data.reason,
      nextStep: document.data.next_step,
      related: Array.isArray(document.data.related_noted) ? document.data.related_noted : [],
      data: document.data,
      body: document.body,
      content: document.content,
      file,
      fileName: entry.name,
      renamedFrom: document.renamedFrom,
    });
  }
  notes.sort(sortByName);
  const renames = new Map();
  for (const note of notes) {
    if (note.renamedFrom !== "") renames.set(note.renamedFrom, note.name);
  }
  if (renames.size > 0) propagateRenames(ctx, notes, renames);
  for (const note of notes) {
    for (const related of note.related) {
      if (related === note.name) {
        addIssue(ctx.errors, ctx.rootDir, note.file, "related", "related_noted 不能引用自身");
      } else if (!notes.some((candidate) => candidate.name === related)) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          note.file,
          "related",
          `related_noted 引用了不存在的 note ${related}`,
        );
      }
    }
  }
  if (spec !== null) {
    let specStatus = spec.data.status;
    const expected = notes.every((note) => note.status === "pending")
      ? "pending"
      : notes.every((note) => note.status === "completed")
        ? "completed"
        : "in_progress";
    if (specStatus !== expected) {
      // 只在原值是合法枚举时改；缺键或拼错仍报，避免猜。
      const rewritten = SPEC_STATUSES.includes(specStatus)
        ? setFrontmatterScalar(spec.content, "status", expected)
        : null;
      if (
        rewritten !== null &&
        writeFixed(ctx, specFile, rewritten, "status", `spec 状态按 note 派生改为 ${expected}`)
      ) {
        spec.content = rewritten;
        specStatus = expected;
        spec.data.status = expected;
      } else {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          specFile,
          "status",
          `spec 状态应为 ${expected}，实际为 ${specStatus}`,
        );
      }
    }
    const range = findTrackedRange(spec.content, ctx, specFile);
    const tracked = renderTracked(notes);
    if (range.kind === "missing") {
      const next = `${spec.content.replace(/\s+$/u, "")}\n\n## 追踪 Note\n\n${tracked}\n`;
      writeGenerated(ctx, specFile, next);
    } else if (range.kind === "found") {
      const next = `${spec.content.slice(0, range.start)}## 追踪 Note\n\n${tracked}\n`;
      writeGenerated(ctx, specFile, next);
    }
  }
  if (exists(planDirectory)) {
    writeGenerated(ctx, path.join(planDirectory, "notes_index.md"), `${renderNotesIndex(notes)}\n`);
  }
  return { name: planName, notes, spec };
};

const scanPlans = (ctx, domainPath) => {
  const plansRoot = path.join(domainPath, "plans");
  if (!exists(plansRoot)) return [];
  const plans = [];
  for (const lifecycleEntry of readEntries(plansRoot, ctx)) {
    if (!lifecycleEntry.isDirectory()) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(plansRoot, lifecycleEntry.name),
        "layout",
        "plans 下只允许生命周期目录",
      );
      continue;
    }
    if (!LIFECYCLES.includes(lifecycleEntry.name)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        path.join(plansRoot, lifecycleEntry.name),
        "lifecycle",
        `生命周期必须是 ${LIFECYCLES.join(" | ")}`,
      );
      continue;
    }
    const lifecyclePath = path.join(plansRoot, lifecycleEntry.name);
    for (const planEntry of readEntries(lifecyclePath, ctx)) {
      if (!planEntry.isDirectory()) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          path.join(lifecyclePath, planEntry.name),
          "layout",
          "生命周期下只允许 Plan 目录",
        );
        continue;
      }
      const match = PLAN_NAME.exec(planEntry.name);
      if (match === null || !isValidDate(match[1]) || !HAN.test(match[2])) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          path.join(lifecyclePath, planEntry.name),
          "name",
          "Plan 目录名必须是 YYYY-MM-DD-中文工作名",
        );
        continue;
      }
      if (
        ctx.planFilter !== undefined &&
        ctx.planFilter !== "" &&
        planEntry.name !== ctx.planFilter
      ) {
        continue;
      }
      plans.push(scanPlan(ctx, path.join(lifecyclePath, planEntry.name), planEntry.name));
    }
  }
  return plans;
};

const scanDomain = (ctx, domainEntry) => {
  const domain = domainEntry.name;
  if (!KEBAB.test(domain)) {
    addIssue(
      ctx.errors,
      ctx.rootDir,
      path.join(ctx.domainsRoot, domain),
      "name",
      "domain 必须是 kebab-case",
    );
    return null;
  }
  const domainPath = path.join(ctx.domainsRoot, domain);
  const contextFile = path.join(domainPath, "CONTEXT.md");
  const document = readDocument(ctx, contextFile, "context", { required: true });
  const context =
    document === null
      ? null
      : {
          domain,
          file: contextFile,
          name: document.data.name,
          description: document.data.description,
          data: document.data,
          body: document.body,
          content: document.content,
        };
  const questionsDirectory = path.join(domainPath, "questions");
  if (!exists(questionsDirectory)) {
    try {
      fs.mkdirSync(questionsDirectory, { recursive: true });
      addFixed(ctx.fixed, ctx.rootDir, questionsDirectory, "missing", "创建 questions 目录");
    } catch (error) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        questionsDirectory,
        "write",
        `创建目录失败: ${describe(error)}`,
      );
    }
  }
  const questions = scanNumberedDocuments(ctx, questionsDirectory, "question", {
    required: true,
    continuous: true,
  });
  const adrs = scanNumberedDocuments(ctx, path.join(domainPath, "adr"), "adr", {
    required: false,
    continuous: true,
  });
  const workflows = scanWorkflows(ctx, path.join(domainPath, "workflows"));
  const plans = scanPlans(ctx, domainPath);

  if (exists(path.join(domainPath, "questions"))) {
    writeGenerated(
      ctx,
      path.join(domainPath, "questions", "index.md"),
      `${renderQuestionsIndex(questions)}\n`,
    );
  }
  if (exists(path.join(domainPath, "adr"))) {
    writeGenerated(ctx, path.join(domainPath, "adr", "index.md"), `${renderAdrIndex(adrs)}\n`);
  }
  if (exists(path.join(domainPath, "workflows"))) {
    writeGenerated(
      ctx,
      path.join(domainPath, "workflows", "index.md"),
      `${renderWorkflowsIndex(workflows)}\n`,
    );
  }
  return { domain, context, questions, adrs, workflows, plans };
};

const normalizeLimits = (raw) => {
  const limits = { ...DEFAULT_LIMITS };
  if (typeof raw !== "object" || raw === null) return limits;
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) limits[key] = value;
  }
  return limits;
};

/**
 * 校验工作区并生成索引。
 * @param {string} rootDirectory - 工作区根。
 * @param {object} options - domainsPath / limits / domain / plan / strict。
 * @returns {{ok: boolean, errors: object[], warnings: object[], updated: string[]}}
 */
export const checkWorkspace = (rootDirectory, options = {}) => {
  const rootDir = path.resolve(rootDirectory);
  const domainsPath = options.domainsPath ?? DOMAINS_DIR;
  const domainsRoot = path.isAbsolute(domainsPath)
    ? path.resolve(domainsPath)
    : path.resolve(rootDir, domainsPath);
  const limits = normalizeLimits(options.limits);
  const ctx = {
    rootDir,
    domainsRoot,
    limits,
    errors: [],
    warnings: [],
    fixed: [],
    updated: [],
    domainFilter: options.domain,
    planFilter: options.plan,
    strict: options.strict !== false,
  };

  if (!exists(domainsRoot)) {
    addIssue(ctx.errors, rootDir, domainsRoot, "missing", "领域根不存在；先运行 nano_flow_create");
    return {
      ok: false,
      errors: ctx.errors,
      warnings: ctx.warnings,
      fixed: ctx.fixed,
      updated: ctx.updated,
    };
  }

  const guideFile = path.join(domainsRoot, "GUIDE.md");
  if (!exists(guideFile)) {
    writeGenerated(ctx, guideFile, "");
  }
  try {
    const guideSize = fs.statSync(guideFile).size;
    if (guideSize > ctx.limits.guideMaxBytes) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        guideFile,
        "size",
        `GUIDE.md ${guideSize} 字节，超过 ${ctx.limits.guideMaxBytes}；只保留索引与指针`,
      );
    }
  } catch (error) {
    addIssue(ctx.errors, ctx.rootDir, guideFile, "read", `读取失败: ${describe(error)}`);
  }

  const domains = [];
  for (const entry of readEntries(domainsRoot, ctx)) {
    if (!entry.isDirectory()) continue;
    if (
      ctx.domainFilter !== undefined &&
      ctx.domainFilter !== "" &&
      entry.name !== ctx.domainFilter
    ) {
      continue;
    }
    const scanned = scanDomain(ctx, entry);
    if (scanned !== null) domains.push(scanned);
  }
  if (ctx.domainFilter !== undefined && ctx.domainFilter !== "" && domains.length === 0) {
    addIssue(ctx.errors, rootDir, domainsRoot, "domain", `domain 不存在: ${ctx.domainFilter}`);
  }
  if (ctx.planFilter !== undefined && ctx.planFilter !== "") {
    const found = domains.some((domain) =>
      domain.plans.some((plan) => plan.name === ctx.planFilter),
    );
    if (!found) {
      addIssue(ctx.errors, rootDir, domainsRoot, "plan", `Plan 不存在: ${ctx.planFilter}`);
    }
  }

  const contexts = domains.map((domain) => domain.context).filter((context) => context !== null);
  const seenContextNames = new Set();
  for (const context of contexts) {
    if (seenContextNames.has(context.name)) {
      addIssue(ctx.errors, rootDir, context.file, "name", `context name 重复 ${context.name}`);
    }
    seenContextNames.add(context.name);
  }
  // 单域过滤或宽松模式只做校验，不用不完整的集合覆盖全量 CONTEXT-MAP。
  if ((options.domain === undefined || options.domain === "") && options.strict !== false) {
    writeGenerated(ctx, path.join(domainsRoot, CONTEXT_MAP_FILE), renderContextMap(ctx, contexts));
  }

  return {
    ok: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    fixed: [...ctx.fixed].sort((left, right) => left.path.localeCompare(right.path)),
    updated: [...new Set(ctx.updated)].sort((left, right) => left.localeCompare(right)),
  };
};
