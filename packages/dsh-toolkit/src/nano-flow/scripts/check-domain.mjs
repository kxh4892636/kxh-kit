#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

/** 默认领域根；与 `prompts/agents.md` 的约定一致。 */
export const DOMAINS_DIR = ".agents/domains";

/** 领域索引文件名；与 `GUIDE.md` 同级，宿主据它定位业务域。 */
export const CONTEXT_MAP_FILE = "CONTEXT-MAP.md";

/** 生成文件的标记：模型不需要维护索引，看到它就应改源文档。 */
export const GENERATED_MARKER = "<!-- 由 nano_flow_check 生成，请勿手改 -->";

/** 索引表与生成章节的固定标题。 */
export const TRACKED_HEADING = "## 追踪 Note";

/** Plan 生命周期；保留现有插件的三档，轮转按 active 找 Plan。 */
export const LIFECYCLES = Object.freeze(["active", "reference", "archived"]);

/** note 状态；blocked 用 reason 表达“在等什么”。 */
export const NOTE_STATUSES = Object.freeze(["pending", "in_progress", "blocked", "completed"]);

/** spec 状态；由全部 note 派生。 */
export const SPEC_STATUSES = Object.freeze(["pending", "in_progress", "completed"]);

/** ADR 状态；可选。 */
export const ADR_STATUSES = Object.freeze(["proposed", "accepted", "deprecated", "superseded"]);

/** 面板可调的默认上限；工具会把当前设置以 `--limits` 传入。 */
export const DEFAULT_LIMITS = Object.freeze({
  specMaxBytes: 34 * 1024,
  noteMaxBytes: 13 * 1024,
  noteDescriptionMaxChars: 233,
  contextMaxBytes: 89 * 1024,
  questionMaxBytes: 13 * 1024,
  adrMaxBytes: 13 * 1024,
  workflowMaxBytes: 34 * 1024,
});

/** 名称、reason、next_step 的单行长度上限。 */
const NAME_MAX_CHARS = 89;
const REASON_MAX_CHARS = 233;
const NEXT_STEP_MAX_CHARS = 233;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAN_NAME = /^(\d{4}-\d{2}-\d{2})-(.+)$/u;
const NUMBERED_NAME = /^(\d{3})-(.+)$/u;
const HAN = /\p{Script=Han}/u;

const relativePath = (rootDir, targetPath) =>
  path.relative(rootDir, targetPath).replaceAll("\\", "/");

const addIssue = (issueList, rootDir, targetPath, rule, message) => {
  issueList.push({ path: relativePath(rootDir, targetPath), rule, message });
};

const describe = (error) => (error instanceof Error ? error.message : String(error));

const readText = (targetPath, ctx) => {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    addIssue(ctx.errors, ctx.rootDir, targetPath, "read", `读取失败: ${describe(error)}`);
    return null;
  }
};

const readEntries = (targetPath, ctx) => {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (error) {
    addIssue(ctx.errors, ctx.rootDir, targetPath, "read", `枚举失败: ${describe(error)}`);
    return [];
  }
};

const exists = (targetPath) => fs.existsSync(targetPath);

const byteLength = (text) => Buffer.byteLength(text, "utf8");

const isValidDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return (
    [
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("-") === value
  );
};

const isSingleLine = (value) => !/[\r\n]/u.test(value);

const normalizeCell = (value) =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll(/\s+/gu, " ")
    .trim();

const sortByName = (left, right) => {
  const leftPrefix = Number(left.name.slice(0, 3));
  const rightPrefix = Number(right.name.slice(0, 3));
  if (Number.isFinite(leftPrefix) && Number.isFinite(rightPrefix) && leftPrefix !== rightPrefix) {
    return leftPrefix - rightPrefix;
  }
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
};

const parseFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { kind: "missing" };
  let data;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    return { kind: "invalid", detail: describe(error) };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { kind: "invalid", detail: "YAML 头必须是对象" };
  }
  return { kind: "ok", data, body: content.slice(match[0].length) };
};

const checkName = (value, kind, ctx, file) => {
  if (typeof value !== "string" || value.trim() === "") {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "缺少 name");
    return false;
  }
  if (!isSingleLine(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "name 必须是单行");
    return false;
  }
  if (value.length > NAME_MAX_CHARS) {
    addIssue(
      ctx.errors,
      ctx.rootDir,
      file,
      "header",
      `name 共 ${value.length} 字，超过 ${NAME_MAX_CHARS}`,
    );
  }
  if (["adr", "question", "note", "workflow"].includes(kind) && !NUMBERED_NAME.test(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "name 必须是三位数字前缀，例如 001-标题");
  }
  return true;
};

const checkHanName = (value, ctx, file) => {
  if (typeof value === "string" && !HAN.test(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "name", "名称必须包含中文标题");
  }
};

const checkDescription = (value, ctx, file) => {
  if (typeof value !== "string" || value.trim() === "") {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "缺少 description");
    return;
  }
  if (!isSingleLine(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "description 必须是单行");
    return;
  }
  if (value.length > ctx.limits.noteDescriptionMaxChars) {
    addIssue(
      ctx.errors,
      ctx.rootDir,
      file,
      "header",
      `description 共 ${value.length} 字，超过 ${ctx.limits.noteDescriptionMaxChars}`,
    );
  }
};

const checkMetadata = (value, ctx, file) => {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "header", "metadata 必须是对象");
  }
};

const checkSingleLineField = (value, label, max, ctx, file, required) => {
  if (value === undefined || value === null || value === "") {
    if (required) addIssue(ctx.errors, ctx.rootDir, file, "header", `缺少 ${label}`);
    return;
  }
  if (typeof value !== "string") {
    addIssue(ctx.errors, ctx.rootDir, file, "header", `${label} 必须是字符串`);
    return;
  }
  if (!isSingleLine(value)) {
    addIssue(ctx.errors, ctx.rootDir, file, "header", `${label} 必须是单行`);
    return;
  }
  if (value.length > max) {
    addIssue(
      ctx.errors,
      ctx.rootDir,
      file,
      "header",
      `${label} 共 ${value.length} 字，超过 ${max}`,
    );
  }
};

const checkUnknownKeys = (data, allowed, ctx, file) => {
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "header",
        `未知头字段 ${key}；自由扩展请放进 metadata`,
      );
    }
  }
};

const HEADER_KEYS = Object.freeze({
  context: ["name", "description", "relations", "metadata"],
  question: ["name", "description", "metadata"],
  adr: ["name", "description", "status", "metadata"],
  workflow: ["name", "description", "metadata"],
  spec: ["name", "description", "status", "metadata"],
  note: ["name", "description", "status", "reason", "related_noted", "next_step", "metadata"],
});

const readDocument = (ctx, file, kind, options = {}) => {
  if (!exists(file)) {
    if (options.required === true) {
      addIssue(ctx.errors, ctx.rootDir, file, "missing", "文件不存在");
    }
    return null;
  }
  const content = readText(file, ctx);
  if (content === null) return null;
  const parsed = parseFrontmatter(content);
  if (parsed.kind === "missing") {
    addIssue(
      ctx.strict === false ? ctx.warnings : ctx.errors,
      ctx.rootDir,
      file,
      "header",
      "缺少 YAML 头（--- ... ---）",
    );
    return null;
  }
  if (parsed.kind === "invalid") {
    addIssue(
      ctx.strict === false ? ctx.warnings : ctx.errors,
      ctx.rootDir,
      file,
      "header",
      `YAML 头无效: ${parsed.detail}`,
    );
    return null;
  }
  const { data, body } = parsed;
  checkUnknownKeys(data, HEADER_KEYS[kind], ctx, file);
  if (!checkName(data.name, kind, ctx, file)) return null;
  checkDescription(data.description, ctx, file);
  checkMetadata(data.metadata, ctx, file);

  if (kind === "adr") {
    if (data.status !== undefined && data.status !== null) {
      if (!ADR_STATUSES.includes(data.status)) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          file,
          "header",
          `ADR status 必须是 ${ADR_STATUSES.join(" | ")}`,
        );
      }
    }
  }
  if (kind === "spec") {
    if (!SPEC_STATUSES.includes(data.status)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "header",
        `spec status 必须是 ${SPEC_STATUSES.join(" | ")}`,
      );
    }
  }
  if (kind === "note") {
    if (!NOTE_STATUSES.includes(data.status)) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "header",
        `note status 必须是 ${NOTE_STATUSES.join(" | ")}`,
      );
    }
    if (data.status === "blocked") {
      checkSingleLineField(data.reason, "reason", REASON_MAX_CHARS, ctx, file, true);
    } else if (data.reason !== undefined && data.reason !== null && data.reason !== "") {
      addIssue(ctx.errors, ctx.rootDir, file, "header", "只有 blocked 的 note 才写 reason");
    }
    checkSingleLineField(
      data.next_step,
      "next_step",
      NEXT_STEP_MAX_CHARS,
      ctx,
      file,
      data.status !== "completed",
    );
    if (data.related_noted !== undefined && data.related_noted !== null) {
      if (
        !Array.isArray(data.related_noted) ||
        data.related_noted.some((item) => typeof item !== "string")
      ) {
        addIssue(ctx.errors, ctx.rootDir, file, "header", "related_noted 必须是 name 字符串数组");
      }
    }
  }

  const limit =
    kind === "context"
      ? ctx.limits.contextMaxBytes
      : kind === "question"
        ? ctx.limits.questionMaxBytes
        : kind === "adr"
          ? ctx.limits.adrMaxBytes
          : kind === "workflow"
            ? ctx.limits.workflowMaxBytes
            : kind === "spec"
              ? ctx.limits.specMaxBytes
              : ctx.limits.noteMaxBytes;
  const size = byteLength(content);
  if (size > limit) {
    const advice =
      kind === "note"
        ? "；单条 note 放不下时拆成多个独立 note（各自新的 NNN 编号）"
        : kind === "question"
          ? "；单个 question 放不下时拆成多个独立 question 文件（各自新的 NNN 编号）"
          : kind === "adr"
            ? "；单个 ADR 放不下时拆成多个独立 ADR 文件（各自新的 NNN 编号）"
            : kind === "spec"
              ? "；请把细节下沉到 note 或领域文档，并在 spec.md 留指针"
              : kind === "context"
                ? "；CONTEXT 上限足够大，请压缩，不拆分"
                : kind === "workflow"
                  ? "；workflow 放不下时拆成多个独立 workflow（各自新的 NNN 编号）"
                  : "；请先压缩";
    addIssue(ctx.errors, ctx.rootDir, file, "size", `${size} 字节，超过 ${limit}${advice}`);
  }

  return { data, body, content, file };
};

const indexTable = (headers, rows) => {
  const head = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((cells) => `| ${cells.join(" | ")} |`);
  return [head, separator, ...body].join("\n");
};

const noteRow = (note, includeStatus) => {
  const cells = [
    `[${normalizeCell(note.name)}](${encodeURI(note.fileName)})`,
    normalizeCell(note.description),
  ];
  if (includeStatus === true) {
    cells.push(note.status);
    cells.push(
      note.reason === undefined || note.reason === null || note.reason === ""
        ? "—"
        : normalizeCell(note.reason),
    );
    cells.push(normalizeCell(note.nextStep ?? "—"));
    cells.push(
      note.related.length === 0 ? "—" : note.related.map((item) => normalizeCell(item)).join(", "),
    );
  } else {
    cells.push(
      note.related.length === 0 ? "—" : note.related.map((item) => normalizeCell(item)).join(", "),
    );
  }
  return cells;
};

const renderTracked = (notes) => {
  const incomplete = notes.filter((note) => note.status !== "completed");
  const priority = { blocked: 0, in_progress: 1, pending: 2, completed: 3 };
  incomplete.sort((left, right) => {
    const gap = (priority[left.status] ?? 9) - (priority[right.status] ?? 9);
    return gap === 0 ? sortByName(left, right) : gap;
  });
  const rows = incomplete.map((note) => noteRow(note, true));
  return [
    GENERATED_MARKER,
    "",
    indexTable(["Name", "Description", "Status", "Reason", "Next Step", "Related Note"], rows),
  ].join("\n");
};

const renderNotesIndex = (notes) => {
  const rows = [...notes].sort(sortByName).map((note) => noteRow(note, false));
  return [
    "# Notes Index",
    "",
    GENERATED_MARKER,
    "",
    indexTable(["Name", "Description", "Related Note"], rows),
  ].join("\n");
};

const findTrackedRange = (content, ctx, file) => {
  const matches = [...content.matchAll(/^## 追踪 Note\s*$/gm)];
  if (matches.length > 1) {
    addIssue(ctx.errors, ctx.rootDir, file, "spec", "只允许一个「## 追踪 Note」章节");
    return null;
  }
  if (matches.length === 0) return null;
  const match = matches[0];
  const start = match.index ?? 0;
  const after = content.slice(start + match[0].length);
  if (/^#{2,6} /m.test(after)) {
    addIssue(ctx.errors, ctx.rootDir, file, "spec", "「## 追踪 Note」必须是最后一个章节");
    return null;
  }
  return { start, end: content.length };
};

const writeGenerated = (ctx, file, content) => {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(ctx.rootDir)}${path.sep}`)) {
    addIssue(ctx.errors, ctx.rootDir, file, "write", "目标不在工作区内，拒绝写入");
    return;
  }
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const parentReal = fs.realpathSync(path.dirname(resolved));
    const rootReal = fs.realpathSync(ctx.rootDir);
    if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
      addIssue(ctx.errors, ctx.rootDir, file, "write", "目标解析到工作区外，拒绝写入");
      return;
    }
    if (exists(resolved)) {
      const fileReal = fs.realpathSync(resolved);
      if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${path.sep}`)) {
        addIssue(ctx.errors, ctx.rootDir, file, "write", "目标文件解析到工作区外，拒绝写入");
        return;
      }
      const current = fs.readFileSync(resolved, "utf8");
      if (current === content) return;
    }
    fs.writeFileSync(resolved, content, "utf8");
    ctx.updated.push(relativePath(ctx.rootDir, resolved));
  } catch (error) {
    addIssue(ctx.errors, ctx.rootDir, file, "write", `写入失败: ${describe(error)}`);
  }
};

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
    const document = readDocument(ctx, file, kind, { required: true });
    if (document === null) continue;
    const base = entry.name.slice(0, -3);
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
    checkHanName(document.data.name, ctx, file);
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
    const document = readDocument(ctx, file, "workflow", { required: true });
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
    checkHanName(document.data.name, ctx, file);
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

const renderContextMap = (ctx, contexts) => {
  const sorted = [...contexts].sort((left, right) => {
    if (left.domain === "common") return -1;
    if (right.domain === "common") return 1;
    return left.domain < right.domain ? -1 : left.domain > right.domain ? 1 : 0;
  });
  const contextLines =
    sorted.length === 0
      ? ["（暂无业务域）"]
      : sorted.map((context) => {
          const relative = relativePath(ctx.domainsRoot, context.file);
          return `- [${normalizeCell(context.name)}](./${relative}) - ${normalizeCell(context.description)}`;
        });

  const byDomain = new Map(contexts.map((context) => [context.domain, context]));
  const relations = [];
  const seen = new Set();
  for (const context of sorted) {
    const declared = context.data.relations;
    if (declared === undefined || declared === null) continue;
    if (!Array.isArray(declared)) {
      addIssue(ctx.errors, ctx.rootDir, context.file, "header", "relations 必须是数组");
      continue;
    }
    for (const relation of declared) {
      if (typeof relation !== "object" || relation === null) {
        addIssue(ctx.errors, ctx.rootDir, context.file, "relation", "relation 必须是对象");
        continue;
      }
      const to = relation.to;
      const description = relation.description;
      if (typeof to !== "string" || !KEBAB.test(to)) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          context.file,
          "relation",
          "relation.to 必须是 kebab-case 域名",
        );
        continue;
      }
      if (typeof description !== "string" || description.trim() === "") {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          context.file,
          "relation",
          "relation.description 不能为空",
        );
        continue;
      }
      const target = byDomain.get(to);
      if (target === undefined) {
        addIssue(
          ctx.errors,
          ctx.rootDir,
          context.file,
          "relation",
          `relation.to 指向不存在的域 ${to}`,
        );
        continue;
      }
      const key = `${context.domain}->${to}`;
      if (seen.has(key)) {
        addIssue(ctx.errors, ctx.rootDir, context.file, "relation", `关系 ${key} 重复定义`);
        continue;
      }
      seen.add(key);
      relations.push({ from: context.name, to: target.name, description });
    }
  }
  relations.sort((left, right) => {
    const from = left.from < right.from ? -1 : left.from > right.from ? 1 : 0;
    return from === 0 ? (left.to < right.to ? -1 : left.to > right.to ? 1 : 0) : from;
  });
  const relationLines =
    relations.length === 0
      ? ["（暂无关系）"]
      : relations.map(
          (relation) =>
            `- **${normalizeCell(relation.from)} → ${normalizeCell(relation.to)}**：${normalizeCell(relation.description)}`,
        );

  return [
    "---",
    "name: Context Map",
    "description: 领域索引与关系。",
    "---",
    "",
    "# Context Map",
    "",
    GENERATED_MARKER,
    "",
    "## Contexts",
    "",
    ...contextLines,
    "",
    "## Relationships",
    "",
    ...relationLines,
    "",
  ].join("\n");
};

const renderQuestionsIndex = (questions) => {
  const rows = questions.map((question) => [
    `[${normalizeCell(question.name)}](${encodeURI(question.fileName)})`,
    normalizeCell(question.description),
  ]);
  return ["# Questions", "", GENERATED_MARKER, "", indexTable(["Name", "Description"], rows)].join(
    "\n",
  );
};

const renderAdrIndex = (adrs) => {
  const rows = adrs.map((adr) => [
    `[${normalizeCell(adr.name)}](${encodeURI(adr.fileName)})`,
    normalizeCell(adr.description),
    adr.status ?? "—",
  ]);
  return [
    "# ADR",
    "",
    GENERATED_MARKER,
    "",
    indexTable(["Name", "Description", "Status"], rows),
  ].join("\n");
};

const renderWorkflowsIndex = (workflows) => {
  const rows = workflows.map((workflow) => [
    `[${normalizeCell(workflow.name)}](${encodeURI(workflow.fileName)})`,
    normalizeCell(workflow.description),
  ]);
  return ["# Workflows", "", GENERATED_MARKER, "", indexTable(["Name", "Description"], rows)].join(
    "\n",
  );
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
    const document = readDocument(ctx, file, "note", { required: true });
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
    checkHanName(document.data.name, ctx, file);
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
    });
  }
  notes.sort(sortByName);
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
    const specStatus = spec.data.status;
    const expected = notes.every((note) => note.status === "pending")
      ? "pending"
      : notes.every((note) => note.status === "completed")
        ? "completed"
        : "in_progress";
    if (specStatus !== expected) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        specFile,
        "status",
        `spec 状态应为 ${expected}，实际为 ${specStatus}`,
      );
    }
    const range = findTrackedRange(spec.content, ctx, specFile);
    const tracked = renderTracked(notes);
    if (range === null) {
      const next = `${spec.content.replace(/\s+$/u, "")}\n\n## 追踪 Note\n\n${tracked}\n`;
      writeGenerated(ctx, specFile, next);
    } else {
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
  const questions = scanNumberedDocuments(ctx, path.join(domainPath, "questions"), "question", {
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
    updated: [],
    domainFilter: options.domain,
    planFilter: options.plan,
    strict: options.strict !== false,
  };

  if (!exists(domainsRoot)) {
    addIssue(ctx.errors, rootDir, domainsRoot, "missing", "领域根不存在；先运行 nano_flow_create");
    return { ok: false, errors: ctx.errors, warnings: ctx.warnings, updated: ctx.updated };
  }

  const guideFile = path.join(domainsRoot, "GUIDE.md");
  if (!exists(guideFile)) {
    writeGenerated(ctx, guideFile, "");
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
    updated: [...new Set(ctx.updated)].sort((left, right) => left.localeCompare(right)),
  };
};

const formatIssues = (issues) =>
  issues.map((issue) => `${issue.path}: [${issue.rule}] ${issue.message}`).join("\n");

const formatText = (result) => {
  const lines = [];
  if (result.ok) {
    lines.push("领域文档校验通过。");
  } else {
    lines.push(`领域文档校验失败，共 ${result.errors.length} 项：`);
    lines.push(formatIssues(result.errors));
  }
  if (result.warnings.length > 0) {
    lines.push(`警告 ${result.warnings.length} 项：`);
    lines.push(formatIssues(result.warnings));
  }
  if (result.updated.length > 0) {
    lines.push(`已更新索引 ${result.updated.length} 个：`);
    lines.push(result.updated.map((file) => `- ${file}`).join("\n"));
  }
  return lines.join("\n");
};

const parseArgs = (argv) => {
  const options = { rootDirectory: argv[0] ?? process.cwd(), json: false, strict: true };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--domains") options.domainsPath = argv[(index += 1)];
    else if (arg === "--limits") {
      try {
        options.limits = JSON.parse(argv[(index += 1)] ?? "{}");
      } catch {
        options.limits = {};
      }
    } else if (arg === "--domain") options.domain = argv[(index += 1)];
    else if (arg === "--plan") options.plan = argv[(index += 1)];
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--no-strict") options.strict = false;
  }
  return options;
};

export const runDomainCheck = ({
  rootDirectory,
  args = process.argv.slice(2),
  stdout = (message) => console.log(message),
  stderr = (message) => console.error(message),
} = {}) => {
  try {
    const root = rootDirectory ?? args[0] ?? process.cwd();
    const options = parseArgs([root, ...args.slice(1)]);
    const result = checkWorkspace(options.rootDirectory, options);
    if (options.json === true) {
      stdout(JSON.stringify(result));
    } else if (result.ok) {
      stdout(formatText(result));
    } else {
      stderr(formatText(result));
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr(`领域文档校验异常: ${error instanceof Error ? error.stack : String(error)}`);
    return 1;
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runDomainCheck();
