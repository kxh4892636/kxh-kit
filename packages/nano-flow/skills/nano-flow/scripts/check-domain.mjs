#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveSpecStatus,
  NOTE_STATUSES,
  parseFrontmatter as parsePlanFrontmatter,
  parseNoteDependencies,
} from "./plan-document.mjs";

const LIFECYCLES = new Set(["planning", "implementing", "reference", "archived"]);
const SPEC_STATUSES = new Set(["pending", "in_progress", "completed"]);
const HAN_PATTERN = /\p{Script=Han}/u;

const relativePath = (rootDir, targetPath) =>
  path.relative(rootDir, targetPath).replaceAll("\\", "/");

const addError = (errors, rootDir, targetPath, message) => {
  errors.push(`${relativePath(rootDir, targetPath)}: ${message}`);
};

const readText = (targetPath, errors, rootDir) => {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    addError(
      errors,
      rootDir,
      targetPath,
      `读取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

const readEntries = (targetPath, errors, rootDir) => {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (error) {
    addError(
      errors,
      rootDir,
      targetPath,
      `枚举失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

const countLines = (content) => {
  const normalized = content.replaceAll("\r\n", "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
};

const parseFrontmatter = (content, targetPath, errors, rootDir) => {
  const parsed = parsePlanFrontmatter(content);
  if (!parsed) {
    addError(errors, rootDir, targetPath, "缺少 YAML frontmatter");
    return new Map();
  }
  return parsed.fields;
};

const parseDependencies = (rawValue, targetPath, errors, rootDir) => {
  const parsed = parseNoteDependencies(rawValue);
  if (parsed.kind === "valid") return parsed.dependencies;
  if (parsed.kind === "missing") {
    addError(errors, rootDir, targetPath, "frontmatter 缺少 blocked_by");
    return [];
  }
  const detail =
    parsed.kind === "invalid_json" ? parsed.detail : '必须是两位稳定 ID 的 JSON 数组，例如 ["01"]';
  addError(errors, rootDir, targetPath, `blocked_by 无效: ${detail}`);
  return [];
};

const hasSection = (content, heading) => new RegExp(`^## ${heading}$`, "m").test(content);

const assertChineseDocument = (content, targetPath, errors, rootDir) => {
  if (!HAN_PATTERN.test(content)) {
    addError(errors, rootDir, targetPath, "正文必须包含中文");
  }
};

const isValidDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const normalized = [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  return normalized === value;
};

const parseNoteTable = (specContent, specPath, errors, rootDir) => {
  if ([...specContent.matchAll(/^## Notes\r?$/gm)].length !== 1) {
    addError(errors, rootDir, specPath, "spec 必须只有一个 Notes 索引章节");
  }
  const section = specContent.match(/^## Notes\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "";
  const rows = new Map();
  let count = 0;
  for (const line of section.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line
      .trim()
      .slice(1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells[0] === "#" || /^:?-+:?$/.test(cells[0])) continue;
    count += 1;
    const link = cells[1]?.match(/^\[[^\]]+\]\(([^)]+\.md)\)$/);
    if (
      cells.length < 5 ||
      !/^\d{2}$/.test(cells[0]) ||
      !NOTE_STATUSES.includes(cells[2]) ||
      !link ||
      !/^(?:—|\d{2}(?:,\s*\d{2})*)$/.test(cells[3])
    ) {
      addError(errors, rootDir, specPath, "Notes 索引行格式无效");
      continue;
    }
    if (rows.has(cells[0])) addError(errors, rootDir, specPath, `Notes 索引重复 ID ${cells[0]}`);
    rows.set(cells[0], {
      dependencies: cells[3].match(/\d{2}/g) ?? [],
      fileName: link[1],
      status: cells[2],
    });
  }
  if (count === 0 || count > 21) {
    addError(errors, rootDir, specPath, `Notes 索引数量 ${count} 必须为 1–21`);
  }
  return rows;
};

const checkDependencyGraph = (notes, planPath, errors, rootDir) => {
  const noteById = new Map(notes.map((note) => [note.id, note]));
  if (!notes.some((note) => note.dependencies.length === 0)) {
    addError(errors, rootDir, planPath, "Note 依赖图至少需要一个根节点");
  }

  for (const note of notes) {
    for (const dependency of note.dependencies) {
      const dependencyNote = noteById.get(dependency);
      if (!dependencyNote) {
        addError(errors, rootDir, note.path, `blocked_by 引用了不存在的 Note ${dependency}`);
        continue;
      }
      if (Number(dependency) >= Number(note.id)) {
        addError(errors, rootDir, note.path, `依赖 ${dependency} 必须排在 Note ${note.id} 之前`);
      }
      if (
        ["in_progress", "blocked", "completed"].includes(note.status) &&
        dependencyNote.status !== "completed"
      ) {
        addError(
          errors,
          rootDir,
          note.path,
          `${note.status} Note 的直接依赖 ${dependency} 尚未 completed`,
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (note) => {
    if (visiting.has(note.id)) return true;
    if (visited.has(note.id)) return false;
    visiting.add(note.id);
    const cyclic = note.dependencies.some((dependency) => {
      const dependencyNote = noteById.get(dependency);
      return dependencyNote ? visit(dependencyNote) : false;
    });
    visiting.delete(note.id);
    visited.add(note.id);
    return cyclic;
  };

  if (notes.some((note) => visit(note))) {
    addError(errors, rootDir, planPath, "Note 依赖图存在环");
  }
};

const checkNote = (notePath, id, errors, rootDir) => {
  const content = readText(notePath, errors, rootDir);
  if (content === null) return null;
  assertChineseDocument(content, notePath, errors, rootDir);
  const frontmatter = parseFrontmatter(content, notePath, errors, rootDir);
  const status = frontmatter.get("status");
  if (!NOTE_STATUSES.includes(status)) {
    addError(errors, rootDir, notePath, `status 必须是 ${NOTE_STATUSES.join(" | ")}`);
  }
  const dependencies = parseDependencies(frontmatter.get("blocked_by"), notePath, errors, rootDir);

  for (const heading of [
    "交付",
    "范围",
    "直接依赖",
    "验收",
    "上下文",
    "决策与证据",
    "执行检查点",
    "下一步",
  ]) {
    if (!hasSection(content, heading)) {
      addError(errors, rootDir, notePath, `缺少「## ${heading}」章节`);
    }
  }
  if (status === "blocked" && (!content.includes("障碍") || !content.includes("解除条件"))) {
    addError(errors, rootDir, notePath, "blocked Note 必须记录障碍和解除条件");
  }
  if (
    status === "completed" &&
    !/证据/.test(
      content.match(/^## (?:交付记录|交付物与证据)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "",
    )
  ) {
    addError(errors, rootDir, notePath, "completed Note 必须记录交付物与验证证据");
  }

  return { id, path: notePath, status, dependencies };
};

const checkPlanLayout = (planPath, errors, rootDir) => {
  const planName = path.basename(planPath);
  const planNameMatch = planName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!planNameMatch || !isValidDate(planNameMatch[1]) || !HAN_PATTERN.test(planNameMatch[2])) {
    addError(errors, rootDir, planPath, "Plan 目录名必须是 YYYY-MM-DD-中文工作名");
  }

  const entries = readEntries(planPath, errors, rootDir);
  for (const entry of entries.filter((item) => item.isDirectory())) {
    addError(errors, rootDir, path.join(planPath, entry.name), "Plan 目录内不允许嵌套目录");
  }
  const markdownFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
  const hasStory = markdownFiles.some((entry) => entry.name === "story.md");
  const hasSpec = markdownFiles.some((entry) => entry.name === "spec.md");
  if (!hasStory) addError(errors, rootDir, planPath, "Plan 必须包含 story.md");
  if (!hasSpec) addError(errors, rootDir, planPath, "Plan 必须包含 spec.md");
  if (!markdownFiles.some((entry) => /^\d{2}-.+\.md$/.test(entry.name))) {
    addError(errors, rootDir, planPath, "Plan 至少需要一个 Note");
  }

  for (const entry of markdownFiles) {
    const allowed =
      ["story.md", "spec.md"].includes(entry.name) || /^\d{2}-.+\.md$/.test(entry.name);
    if (!allowed) {
      addError(
        errors,
        rootDir,
        path.join(planPath, entry.name),
        "Plan 文件名必须是 story.md、spec.md 或 NN-中文标题.md",
      );
    }
    if (!["story.md", "spec.md"].includes(entry.name) && !HAN_PATTERN.test(entry.name)) {
      addError(errors, rootDir, path.join(planPath, entry.name), "Note 文件名必须包含中文标题");
    }
    const content = readText(path.join(planPath, entry.name), errors, rootDir);
    if (content !== null) {
      assertChineseDocument(content, path.join(planPath, entry.name), errors, rootDir);
    }
  }
  return { hasStory, hasSpec, markdownFiles };
};

const loadNotes = (planPath, markdownFiles, errors, rootDir) => {
  const noteEntries = markdownFiles
    .filter((entry) => /^\d{2}-.+\.md$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const notes = [];
  const ids = new Set();
  for (const entry of noteEntries) {
    const id = entry.name.slice(0, 2);
    if (ids.has(id)) addError(errors, rootDir, planPath, `Note ID 重复 ${id}`);
    ids.add(id);
    const note = checkNote(path.join(planPath, entry.name), id, errors, rootDir);
    if (note) notes.push({ ...note, fileName: entry.name });
  }
  return notes;
};

const checkNoteTable = (specContent, specPath, notes, errors, rootDir) => {
  const noteTable = parseNoteTable(specContent, specPath, errors, rootDir);
  for (const note of notes) {
    const row = noteTable.get(note.id);
    if (!row) continue;
    if (row.fileName !== note.fileName) {
      addError(errors, rootDir, specPath, `Note ${note.id} 链接应指向 ${note.fileName}`);
    }
    if (row.status !== note.status) {
      addError(
        errors,
        rootDir,
        specPath,
        `Note ${note.id} 表格状态 ${row.status} 与 frontmatter ${note.status} 不一致`,
      );
    }
    if (row.dependencies.join(",") !== note.dependencies.join(",")) {
      addError(errors, rootDir, specPath, `Note ${note.id} 表格依赖与 blocked_by 不一致`);
    }
  }
  for (const id of noteTable.keys()) {
    if (!notes.some((note) => note.id === id)) {
      addError(errors, rootDir, specPath, `Notes 索引引用了不存在的 ${id}`);
    }
  }
};

const checkSpec = (planPath, lifecycle, markdownFiles, errors, rootDir) => {
  const specPath = path.join(planPath, "spec.md");
  const specContent = readText(specPath, errors, rootDir);
  if (specContent === null) return;
  const specFrontmatter = parseFrontmatter(specContent, specPath, errors, rootDir);
  for (const heading of [
    "问题",
    "方案",
    "已排除的备选",
    "实施决策",
    "工作环境",
    "范围",
    "非范围",
    "待定",
    "上下文",
    "执行约束",
    "当前进度",
    "恢复入口",
    "Notes",
  ]) {
    if (!hasSection(specContent, heading)) {
      addError(errors, rootDir, specPath, `缺少「## ${heading}」章节`);
    }
  }
  const specStatus = specFrontmatter.get("status");
  if (!SPEC_STATUSES.has(specStatus)) {
    addError(errors, rootDir, specPath, `status 必须是 ${[...SPEC_STATUSES].join(" | ")}`);
  }
  const notes = loadNotes(planPath, markdownFiles, errors, rootDir);
  checkNoteTable(specContent, specPath, notes, errors, rootDir);
  if (notes.length === 0) return;
  checkDependencyGraph(notes, planPath, errors, rootDir);
  const expectedSpecStatus = deriveSpecStatus(notes);
  if (specStatus !== expectedSpecStatus) {
    addError(errors, rootDir, specPath, `聚合状态应为 ${expectedSpecStatus}，实际为 ${specStatus}`);
  }
  if (lifecycle === "reference" && expectedSpecStatus !== "completed") {
    addError(errors, rootDir, planPath, "reference Plan 的 Note 必须全部 completed");
  }
};

const checkPlan = (planPath, lifecycle, errors, rootDir) => {
  const layout = checkPlanLayout(planPath, errors, rootDir);
  if (layout.hasStory) {
    const storyPath = path.join(planPath, "story.md");
    const content = readText(storyPath, errors, rootDir);
    if (content !== null) {
      for (const heading of ["原始想法", "角色", "故事", "约束与澄清", "迷雾", "上下文"]) {
        if (!hasSection(content, heading))
          addError(errors, rootDir, storyPath, `缺少「## ${heading}」章节`);
      }
    }
  }
  if (layout.hasSpec) {
    checkSpec(planPath, lifecycle, layout.markdownFiles, errors, rootDir);
  }
};

const checkPlans = (domainPath, errors, rootDir) => {
  const plansPath = path.join(domainPath, "plans");
  if (!fs.existsSync(plansPath)) return;
  const lifecycleEntries = readEntries(plansPath, errors, rootDir).filter((entry) =>
    entry.isDirectory(),
  );
  for (const lifecycleEntry of lifecycleEntries) {
    if (!LIFECYCLES.has(lifecycleEntry.name)) {
      addError(
        errors,
        rootDir,
        path.join(plansPath, lifecycleEntry.name),
        "Plan 生命周期目录只能是 planning、implementing、reference 或 archived",
      );
      continue;
    }
    const lifecyclePath = path.join(plansPath, lifecycleEntry.name);
    for (const planEntry of readEntries(lifecyclePath, errors, rootDir).filter((entry) =>
      entry.isDirectory(),
    )) {
      checkPlan(path.join(lifecyclePath, planEntry.name), lifecycleEntry.name, errors, rootDir);
    }
  }
};

const checkAdrs = (domainPath, errors, rootDir) => {
  const adrPath = path.join(domainPath, "adr");
  if (!fs.existsSync(adrPath)) return;
  const adrFiles = readEntries(adrPath, errors, rootDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  if (adrFiles.length > 89) {
    addError(errors, rootDir, adrPath, `ADR 数量 ${adrFiles.length} 超过 89`);
  }
  for (const [index, adrFile] of adrFiles.entries()) {
    const adrFilePath = path.join(adrPath, adrFile.name);
    const nameMatch = adrFile.name.match(/^(\d{4})-(.+)\.md$/);
    const expectedId = String(index + 1).padStart(4, "0");
    if (!nameMatch || nameMatch[1] !== expectedId || !HAN_PATTERN.test(nameMatch[2])) {
      addError(
        errors,
        rootDir,
        adrFilePath,
        `ADR 文件名必须按域内连续编号，期望 ${expectedId}-中文决策名.md`,
      );
    }
    const content = readText(adrFilePath, errors, rootDir);
    if (content === null) continue;
    assertChineseDocument(content, adrFilePath, errors, rootDir);
    const lineCount = countLines(content);
    if (lineCount > 144) {
      addError(errors, rootDir, adrFilePath, `ADR 共 ${lineCount} 行，超过 144`);
    }
  }
};

export const checkDomain = (rootDirectory) => {
  const rootDir = path.resolve(rootDirectory);
  const errors = [];
  const policyPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "references",
    "skills",
    "domain",
    "SKILL.md",
  );
  if (!fs.existsSync(policyPath)) {
    addError(errors, rootDir, policyPath, "/nano-flow 缺少 references/skills/domain/SKILL.md");
  }
  for (const requiredFile of ["CONTEXT-MAP.md"]) {
    if (!fs.existsSync(path.join(rootDir, requiredFile))) {
      addError(errors, rootDir, path.join(rootDir, requiredFile), "文件不存在");
    }
  }
  const docsPath = path.join(rootDir, "docs");
  if (!fs.existsSync(docsPath)) {
    addError(errors, rootDir, docsPath, "目录不存在");
    return errors;
  }
  const mapPath = path.join(rootDir, "CONTEXT-MAP.md");
  const mapContent = fs.existsSync(mapPath) ? readText(mapPath, errors, rootDir) : null;
  const domainEntries = readEntries(docsPath, errors, rootDir).filter((entry) =>
    entry.isDirectory(),
  );
  const domainNames = new Set(domainEntries.map((entry) => entry.name));

  for (const domainEntry of domainEntries) {
    const domainPath = path.join(docsPath, domainEntry.name);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(domainEntry.name)) {
      addError(errors, rootDir, domainPath, "domain-name 必须是 kebab-case");
    }
    for (const fileName of ["CONTEXT.md", "QUESTIONS.md"]) {
      const documentPath = path.join(domainPath, fileName);
      if (!fs.existsSync(documentPath)) {
        addError(errors, rootDir, documentPath, `业务域缺少 ${fileName}`);
        continue;
      }
      const content = readText(documentPath, errors, rootDir);
      if (content !== null) {
        assertChineseDocument(content, documentPath, errors, rootDir);
        const lineCount = countLines(content);
        if (lineCount > 610) {
          addError(errors, rootDir, documentPath, `${fileName} 共 ${lineCount} 行，超过 610`);
        }
      }
    }
    if (mapContent !== null && !mapContent.includes(`(./docs/${domainEntry.name}/CONTEXT.md)`)) {
      addError(errors, rootDir, mapPath, `缺少业务域 ${domainEntry.name} 的索引`);
    }
    checkAdrs(domainPath, errors, rootDir);
    checkPlans(domainPath, errors, rootDir);
  }

  if (mapContent !== null) {
    for (const match of mapContent.matchAll(/\(\.\/docs\/([^/]+)\/CONTEXT\.md\)/g)) {
      if (!domainNames.has(match[1])) {
        addError(errors, rootDir, mapPath, `索引指向不存在的业务域 ${match[1]}`);
      }
    }
  }

  return errors;
};

export const runDomainCheck = ({
  rootDirectory = process.argv[2] ?? process.cwd(),
  stderr = (message) => console.error(message),
  stdout = (message) => console.log(message),
} = {}) => {
  const rootDir = path.resolve(rootDirectory);
  try {
    const errors = checkDomain(rootDir);
    if (errors.length > 0) {
      stderr(`领域文档校验失败，共 ${errors.length} 项：`);
      for (const error of errors) stderr(`- ${error}`);
      return 1;
    }
    stdout("领域文档校验通过。");
    return 0;
  } catch (error) {
    stderr(`领域文档校验异常: ${error instanceof Error ? error.stack : String(error)}`);
    return 1;
  }
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) process.exitCode = runDomainCheck();
