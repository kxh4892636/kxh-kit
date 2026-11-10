import path from "node:path";
import {
  NOTE_STATUSES,
  SPEC_STATUSES,
  ADR_STATUSES,
  REASON_MAX_CHARS,
  NEXT_STEP_MAX_CHARS,
  addIssue,
  addFixed,
  readText,
  exists,
  byteLength,
  isSingleLine,
  nameProblem,
  parseFrontmatter,
  writeInsideWorkspace,
} from "./base.mjs";
import { collapseToSingleLine, removeFrontmatterKey, setFrontmatterScalar } from "./fix.mjs";

/** 校验 name；规则只来自 `base.mjs` 的 `nameProblem`（create 用的是同一份）。 */
const checkName = (value, kind, ctx, file) => {
  const problem = nameProblem(value, kind);
  if (problem === null) return true;
  addIssue(ctx.errors, ctx.rootDir, file, problem.rule, problem.message);
  return !problem.blocking;
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

/**
 * 校验页面文末的 `## 相关` 段：每条必须是 `- [标题](相对.md) — 原因`。
 * 段外链接不解析；反向链接由 check 的后续版本生成，不手写。
 * @param ctx - 校验上下文（errors / rootDir）。
 * @param file - 页面文件路径。
 * @param body - 去掉 YAML 头后的正文。
 */
const checkRelatedSection = (ctx, file, body) => {
  const headings = [...body.matchAll(/^## 相关\s*$/gmu)];
  if (headings.length === 0) return;
  if (headings.length > 1) {
    addIssue(ctx.errors, ctx.rootDir, file, "related", "只允许一个「## 相关」段");
  }
  const first = headings[0];
  const after = body.slice(first.index + first[0].length);
  if (/^#{2,6} /mu.test(after)) {
    addIssue(ctx.errors, ctx.rootDir, file, "related", "「## 相关」必须是最后一个章节");
  }
  const section = after.split(/^## /mu)[0];
  const lines = section
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) {
    addIssue(ctx.errors, ctx.rootDir, file, "related", "「## 相关」不能为空");
    return;
  }
  const baseDir = path.dirname(file);
  for (const line of lines) {
    const match = line.match(/^-\s*\[([^\]]+)\]\(([^)\s]+)\)\s+—\s+(.+)$/u);
    if (match === null) {
      addIssue(
        ctx.errors,
        ctx.rootDir,
        file,
        "related",
        `相关条目必须是「- [标题](相对.md) — 原因」：${line}`,
      );
      continue;
    }
    const [, , target, reason] = match;
    if (!target.endsWith(".md")) {
      addIssue(ctx.errors, ctx.rootDir, file, "related", `相关链接只允许 .md：${target}`);
    }
    let targetPath = target.split("#")[0];
    try {
      targetPath = decodeURI(targetPath);
    } catch {
      // 非法的 % 序列按原文处理，交给存在性校验报错。
    }
    const resolved = path.resolve(baseDir, targetPath);
    if (!exists(resolved)) {
      addIssue(ctx.errors, ctx.rootDir, file, "related", `相关链接目标不存在：${target}`);
    }
    if (reason.trim() === "") {
      addIssue(ctx.errors, ctx.rootDir, file, "related", `相关链接缺少原因：${target}`);
    }
  }
};

/** 各 kind 必须单行的字段。 */
const SINGLE_LINE_FIELDS = Object.freeze({
  adr: ["name", "description"],
  context: ["name", "description"],
  note: ["name", "description", "reason", "next_step"],
  question: ["name", "description"],
  spec: ["name", "description"],
  workflow: ["name", "description"],
});

/**
 * 应用确定性字段修复：多行折成单行、非 blocked 的 note 去掉 reason、name 对齐文件名。
 * 修完重新解析，让后续校验看到修复后的值。
 * @returns `{ content, data, body, renamedFrom }`。
 */
const applyFieldFixes = (ctx, file, kind, content, parsed, expectedName) => {
  const changes = [];
  let next = content;
  let current = parsed;
  for (const field of SINGLE_LINE_FIELDS[kind] ?? ["name", "description"]) {
    const value = parsed.data[field];
    if (typeof value !== "string" || isSingleLine(value)) continue;
    const rewritten = setFrontmatterScalar(next, field, collapseToSingleLine(value));
    if (rewritten === null) continue;
    next = rewritten;
    changes.push({ rule: "header", message: `${field} 多行合并为单行` });
  }
  if (next !== content) current = parseFrontmatter(next);
  let data = current.data ?? parsed.data;
  const reason = data.reason;
  if (
    kind === "note" &&
    data.status !== "blocked" &&
    typeof reason === "string" &&
    reason.trim() !== ""
  ) {
    const rewritten = removeFrontmatterKey(next, "reason");
    if (rewritten !== null && rewritten !== next) {
      next = rewritten;
      current = parseFrontmatter(next);
      data = current.data ?? data;
      changes.push({ rule: "header", message: "非 blocked 的 note 去掉 reason" });
    }
  }
  let renamedFrom = "";
  if (expectedName !== undefined && typeof data.name === "string" && data.name !== expectedName) {
    const rewritten = setFrontmatterScalar(next, "name", expectedName);
    if (rewritten !== null) {
      renamedFrom = data.name;
      next = rewritten;
      current = parseFrontmatter(next);
      data = current.data ?? data;
      changes.push({
        rule: "name",
        message: `name 对齐文件名为 ${expectedName}（原 ${renamedFrom}）`,
      });
    }
  }
  if (changes.length === 0) {
    return { content, data, body: parsed.body, renamedFrom };
  }
  if (writeInsideWorkspace(ctx, file, next) === "written") {
    for (const change of changes) {
      addFixed(ctx.fixed, ctx.rootDir, path.resolve(file), change.rule, change.message);
    }
  }
  return { content: next, data, body: current.body ?? parsed.body, renamedFrom };
};

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
  const fixed = applyFieldFixes(ctx, file, kind, content, parsed, options.expectedName);
  const { data, body } = fixed;
  checkUnknownKeys(data, HEADER_KEYS[kind], ctx, file);
  if (!checkName(data.name, kind, ctx, file)) return null;
  checkDescription(data.description, ctx, file);
  checkMetadata(data.metadata, ctx, file);
  if (kind === "context" || kind === "question" || kind === "adr" || kind === "workflow") {
    checkRelatedSection(ctx, file, body);
  }

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
  const size = byteLength(fixed.content);
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

  return { data, body, content: fixed.content, file, renamedFrom: fixed.renamedFrom };
};

export {
  checkName,
  checkDescription,
  checkMetadata,
  checkSingleLineField,
  checkUnknownKeys,
  HEADER_KEYS,
  checkRelatedSection,
  readDocument,
};
