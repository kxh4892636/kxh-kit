import path from "node:path";
import {
  NOTE_STATUSES,
  SPEC_STATUSES,
  ADR_STATUSES,
  NAME_MAX_CHARS,
  REASON_MAX_CHARS,
  NEXT_STEP_MAX_CHARS,
  NUMBERED_NAME,
  HAN,
  addIssue,
  readText,
  exists,
  byteLength,
  isSingleLine,
  parseFrontmatter,
} from "./base.mjs";

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

export {
  checkName,
  checkHanName,
  checkDescription,
  checkMetadata,
  checkSingleLineField,
  checkUnknownKeys,
  HEADER_KEYS,
  checkRelatedSection,
  readDocument,
};
