/**
 * 自动修复用的行级文本工具：只改 YAML 头里的目标行与引用的名字，不重排 YAML、不动正文。
 *
 * 这里只放「确定性」修复：结果由文件名、note 状态等既有事实唯一决定，不需要判断内容。
 * @module @kxh4892636/dsh-toolkit/nano-flow/documents/lib/fix
 */

import path from "node:path";

import { addFixed, writeInsideWorkspace } from "./base.mjs";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

/** YAML 头的范围；没有头时返回 null。 */
const frontmatterRange = (content) => {
  const match = FRONTMATTER.exec(content);
  if (match === null) return null;
  return { end: match[0].length, text: match[1] };
};

/** 沿用原值的引号风格给新值加引号。 */
const quoteValue = (value, quote) => {
  if (quote === "") return value;
  const escaped = quote === "'" ? value.replaceAll("'", "''") : value.replaceAll('"', '\\"');
  return `${quote}${escaped}${quote}`;
};

/** 读现有值的引号风格。 */
const quoteOf = (raw) => {
  const first = raw.trim().slice(0, 1);
  return first === "'" || first === '"' ? first : "";
};

/**
 * 标量续行的范围：`index` 之后所有「缩进行或空行」，直到下一个顶格行。
 *
 * 空行也得跟着删：块标量（`|` / `>-`）里允许空行，漏掉它就会把后面的续行
 * 留在文件里，字段仍然是多行，下次校验再折一遍、再抄一遍，永不收敛。
 */
const continuationEnd = (lines, index) => {
  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (line.trim() !== "" && !/^[ \t]/u.test(line)) break;
    cursor += 1;
  }
  return cursor;
};

/**
 * 改写 YAML 头里的一个标量字段，保持原引号风格；键不存在时按单引号追加到头部末尾。
 * @returns 新内容；没有 YAML 头时返回 null。
 */
const setFrontmatterScalar = (content, key, value) => {
  const range = frontmatterRange(content);
  if (range === null) return null;
  const lines = range.text.split(/\r?\n/u);
  const pattern = new RegExp(`^${key}:[ \\t]*(.*)$`, "u");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) {
    lines.push(`${key}: ${quoteValue(value, "'")}`);
  } else {
    const raw = pattern.exec(lines[index])?.[1] ?? "";
    lines[index] = `${key}: ${quoteValue(value, quoteOf(raw))}`;
    const end = continuationEnd(lines, index);
    if (end > index + 1) lines.splice(index + 1, end - index - 1);
  }
  return `---\n${lines.join("\n")}\n---\n${content.slice(range.end)}`;
};

/**
 * 删除 YAML 头里的一个字段，连同它下面缩进的续行。
 * @returns 新内容；字段不存在时原样返回；没有 YAML 头时返回 null。
 */
const removeFrontmatterKey = (content, key) => {
  const range = frontmatterRange(content);
  if (range === null) return null;
  const lines = range.text.split(/\r?\n/u);
  const pattern = new RegExp(`^${key}:[ \\t]*(.*)$`, "u");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) return content;
  const cursor = continuationEnd(lines, index);
  const keep = [...lines.slice(0, index), ...lines.slice(cursor)];
  return `---\n${keep.join("\n")}\n---\n${content.slice(range.end)}`;
};

/** 多行值折成单行：换行与连续空白压成一个空格。 */
const collapseToSingleLine = (value) => String(value).replaceAll(/\s+/gu, " ").trim();

const escapeRegExp = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * 把正文里对旧 name 的引用换成新 name：引号包裹的 `'name'` / `"name"`，以及块状列表项 `- name`。
 * @returns 新内容与是否发生替换。
 */
const replaceNameToken = (content, from, to) => {
  const escaped = escapeRegExp(from);
  const quoted = new RegExp(`(['"])${escaped}\\1`, "gu");
  const blockItem = new RegExp(`^([ \\t]*- )${escaped}$`, "gmu");
  const withQuoted = content.replaceAll(quoted, (_whole, quote) => quoteValue(to, quote));
  const next = withQuoted.replaceAll(blockItem, (_whole, prefix) => `${prefix}${to}`);
  return { content: next, changed: next !== content };
};

/**
 * 写回修复后的内容并登记一条修复记录。
 * @returns 是否真的写入了（内容相同或写入被拒时为 false）。
 */
const writeFixed = (ctx, file, content, rule, message) => {
  if (writeInsideWorkspace(ctx, file, content) !== "written") return false;
  addFixed(ctx.fixed, ctx.rootDir, path.resolve(file), rule, message);
  return true;
};

/**
 * 把改名结果同步到同 Plan 内其他 note 的 `related_noted`（文件与内存两处）。
 * @param ctx - 校验上下文。
 * @param notes - 同 Plan 的 note 列表；命中改动的项会被就地更新。
 * @param renames - 旧 name → 新 name。
 */
const propagateRenames = (ctx, notes, renames) => {
  const summary = [...renames].map(([from, to]) => `${from} → ${to}`).join("、");
  for (const note of notes) {
    let content = note.content;
    const related = [];
    let changed = false;
    for (const item of note.related) {
      const mapped = renames.get(item) ?? item;
      if (mapped !== item) changed = true;
      related.push(mapped);
    }
    if (!changed) continue;
    for (const [from, to] of renames) {
      content = replaceNameToken(content, from, to).content;
    }
    const written = writeFixed(
      ctx,
      note.file,
      content,
      "related",
      `related_noted 随改名更新：${summary}`,
    );
    note.content = written ? content : note.content;
    note.related = related;
    note.data.related_noted = related;
  }
};

export {
  frontmatterRange,
  setFrontmatterScalar,
  removeFrontmatterKey,
  collapseToSingleLine,
  replaceNameToken,
  writeFixed,
  propagateRenames,
};
