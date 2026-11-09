import path from "node:path";
import {
  GENERATED_MARKER,
  KEBAB,
  relativePath,
  addIssue,
  writeInsideWorkspace,
  normalizeCell,
  sortByName,
} from "./base.mjs";

/**
 * 生成 Markdown 链接目标：中文等非 ASCII 字符保持原样，只转义会破坏链接的 ASCII 字符
 * （空格、#、?、% 等）。索引里因此显示可读的中文路径，而不是一长串 %E8…。
 * @param fileName - 相对文件名。
 * @returns Markdown 链接目标。
 */
const linkTarget = (fileName) =>
  encodeURI(fileName).replace(
    /%([C-Fc-f][0-9A-Fa-f])((?:%[89ABab][0-9A-Fa-f])+)/gu,
    (whole, lead, rest) => {
      const hex = lead + rest.replaceAll("%", "");
      const bytes = [];
      for (let index = 0; index < hex.length; index += 2) {
        bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
      }
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
      } catch {
        return whole;
      }
    },
  );

const indexTable = (headers, rows) => {
  const head = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((cells) => `| ${cells.join(" | ")} |`);
  return [head, separator, ...body].join("\n");
};

const noteRow = (note, includeStatus) => {
  const cells = [
    `[${normalizeCell(note.name)}](${linkTarget(note.fileName)})`,
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
  if (writeInsideWorkspace(ctx, file, content) === "written") {
    ctx.updated.push(relativePath(ctx.rootDir, path.resolve(file)));
  }
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
    `[${normalizeCell(question.name)}](${linkTarget(question.fileName)})`,
    normalizeCell(question.description),
  ]);
  return ["# Questions", "", GENERATED_MARKER, "", indexTable(["Name", "Description"], rows)].join(
    "\n",
  );
};

const renderAdrIndex = (adrs) => {
  const rows = adrs.map((adr) => [
    `[${normalizeCell(adr.name)}](${linkTarget(adr.fileName)})`,
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
    `[${normalizeCell(workflow.name)}](${linkTarget(workflow.fileName)})`,
    normalizeCell(workflow.description),
  ]);
  return ["# Workflows", "", GENERATED_MARKER, "", indexTable(["Name", "Description"], rows)].join(
    "\n",
  );
};

export {
  linkTarget,
  indexTable,
  noteRow,
  renderTracked,
  renderNotesIndex,
  findTrackedRange,
  writeGenerated,
  renderContextMap,
  renderQuestionsIndex,
  renderAdrIndex,
  renderWorkflowsIndex,
};
