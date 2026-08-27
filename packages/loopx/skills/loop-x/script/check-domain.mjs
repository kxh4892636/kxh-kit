#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIFECYCLES = new Set(["active", "reference", "archived"]);
const ISSUE_STATUSES = new Set(["pending", "in_progress", "blocked", "completed"]);
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

export const countLines = (content) => {
  if (content.length === 0) return 0;
  const normalized = content.replaceAll("\r\n", "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
};

export const parseFrontmatter = (content, targetPath, errors, rootDir) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    addError(errors, rootDir, targetPath, "缺少 YAML frontmatter");
    return new Map();
  }

  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    const name = line.slice(0, separator);
    if (separator > 0 && /^[a-z_]+$/.test(name)) {
      fields.set(name, line.slice(separator + 1).trim());
    }
  }
  return fields;
};

export const parseDependencies = (rawValue, targetPath, errors, rootDir) => {
  if (rawValue === undefined) {
    addError(errors, rootDir, targetPath, "frontmatter 缺少 blocked_by");
    return [];
  }

  try {
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value) || value.some((dependency) => !/^\d{2}$/.test(dependency))) {
      throw new Error('必须是两位稳定 ID 的 JSON 数组，例如 ["01"]');
    }
    return value;
  } catch (error) {
    addError(
      errors,
      rootDir,
      targetPath,
      `blocked_by 无效: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

export const hasSection = (content, heading) => new RegExp(`^## ${heading}$`, "m").test(content);

const assertChineseDocument = (content, targetPath, errors, rootDir) => {
  if (!HAN_PATTERN.test(content)) {
    addError(errors, rootDir, targetPath, "正文必须包含中文");
  }
};

export const isValidDate = (value) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const normalized = [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
  return normalized === value;
};

export const parseIssueTable = (specContent) => {
  const rows = new Map();
  const rowPattern =
    /^\|\s*(\d{2})\s*\|\s*\[[^\]]+\]\(([^)]+\.md)\)\s*\|\s*(pending|in_progress|blocked|completed)\s*\|\s*([^|]+?)\s*\|/gm;
  for (const match of specContent.matchAll(rowPattern)) {
    const dependencyCell = match[4];
    const dependencies = ["—", "-"].includes(dependencyCell)
      ? []
      : [...dependencyCell.matchAll(/\d{2}/g)].map((item) => item[0]);
    rows.set(match[1], {
      fileName: path.basename(match[2]),
      status: match[3],
      dependencies,
    });
  }
  return rows;
};

export const deriveSpecStatus = (issues) => {
  const statuses = issues.map((issue) => issue.status);
  if (statuses.every((status) => status === "pending")) return "pending";
  if (statuses.every((status) => status === "completed")) return "completed";
  return "in_progress";
};

const checkDependencyGraph = (issues, planPath, errors, rootDir) => {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  if (!issues.some((issue) => issue.dependencies.length === 0)) {
    addError(errors, rootDir, planPath, "Issue 依赖图至少需要一个根节点");
  }

  for (const issue of issues) {
    for (const dependency of issue.dependencies) {
      const dependencyIssue = issueById.get(dependency);
      if (!dependencyIssue) {
        addError(errors, rootDir, issue.path, `blocked_by 引用了不存在的 Issue ${dependency}`);
        continue;
      }
      if (Number(dependency) >= Number(issue.id)) {
        addError(errors, rootDir, issue.path, `依赖 ${dependency} 必须排在 Issue ${issue.id} 之前`);
      }
      if (
        ["in_progress", "blocked", "completed"].includes(issue.status) &&
        dependencyIssue.status !== "completed"
      ) {
        addError(
          errors,
          rootDir,
          issue.path,
          `${issue.status} Issue 的直接依赖 ${dependency} 尚未 completed`,
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (issue) => {
    if (visiting.has(issue.id)) return true;
    if (visited.has(issue.id)) return false;
    visiting.add(issue.id);
    const cyclic = issue.dependencies.some((dependency) => {
      const dependencyIssue = issueById.get(dependency);
      return dependencyIssue ? visit(dependencyIssue) : false;
    });
    visiting.delete(issue.id);
    visited.add(issue.id);
    return cyclic;
  };

  if (issues.some((issue) => visit(issue))) {
    addError(errors, rootDir, planPath, "Issue 依赖图存在环");
  }
};

const checkIssue = (issuePath, id, errors, rootDir) => {
  const content = readText(issuePath, errors, rootDir);
  if (content === null) return null;
  assertChineseDocument(content, issuePath, errors, rootDir);
  const frontmatter = parseFrontmatter(content, issuePath, errors, rootDir);
  const status = frontmatter.get("status");
  if (!ISSUE_STATUSES.has(status)) {
    addError(errors, rootDir, issuePath, `status 必须是 ${[...ISSUE_STATUSES].join(" | ")}`);
  }
  const dependencies = parseDependencies(frontmatter.get("blocked_by"), issuePath, errors, rootDir);

  for (const heading of ["交付", "范围", "直接依赖", "验收", "上下文", "下一步"]) {
    if (!hasSection(content, heading)) {
      addError(errors, rootDir, issuePath, `缺少「## ${heading}」章节`);
    }
  }
  if (status === "blocked" && (!content.includes("障碍") || !content.includes("解除条件"))) {
    addError(errors, rootDir, issuePath, "blocked Issue 必须记录障碍和解除条件");
  }
  if (
    status === "completed" &&
    (!/^## (交付记录|交付物与证据)$/m.test(content) || !content.includes("证据"))
  ) {
    addError(errors, rootDir, issuePath, "completed Issue 必须记录交付物与验证证据");
  }

  return { id, path: issuePath, status, dependencies };
};

const checkPlanLayout = (planPath, lifecycle, errors, rootDir) => {
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
  if (!hasStory && !hasSpec) {
    addError(errors, rootDir, planPath, "Plan 至少需要 story.md 或 spec.md");
  }
  if (!hasSpec && lifecycle !== "active") {
    addError(errors, rootDir, planPath, "非 active Plan 必须包含 spec.md");
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
      addError(errors, rootDir, path.join(planPath, entry.name), "Issue 文件名必须包含中文标题");
    }
    const content = readText(path.join(planPath, entry.name), errors, rootDir);
    if (content !== null) {
      assertChineseDocument(content, path.join(planPath, entry.name), errors, rootDir);
    }
  }
  return { hasSpec, markdownFiles };
};

const loadIssues = (planPath, markdownFiles, errors, rootDir) => {
  const issueEntries = markdownFiles
    .filter((entry) => /^\d{2}-.+\.md$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  if (issueEntries.length === 0) {
    addError(errors, rootDir, planPath, "包含 spec.md 的 Plan 至少需要一个 Issue");
    return [];
  }

  const issues = [];
  for (const [index, entry] of issueEntries.entries()) {
    const id = entry.name.slice(0, 2);
    const expectedId = String(index + 1).padStart(2, "0");
    if (id !== expectedId) {
      addError(
        errors,
        rootDir,
        path.join(planPath, entry.name),
        `Issue 编号必须连续，期望 ${expectedId}`,
      );
    }
    const issue = checkIssue(path.join(planPath, entry.name), id, errors, rootDir);
    if (issue) issues.push({ ...issue, fileName: entry.name });
  }
  return issues;
};

const checkIssueTable = (specContent, specPath, issues, errors, rootDir) => {
  const issueTable = parseIssueTable(specContent);
  for (const issue of issues) {
    const row = issueTable.get(issue.id);
    if (!row) {
      addError(errors, rootDir, specPath, `Issue 表缺少 ${issue.id}`);
      continue;
    }
    if (row.fileName !== issue.fileName) {
      addError(errors, rootDir, specPath, `Issue ${issue.id} 链接应指向 ${issue.fileName}`);
    }
    if (row.status !== issue.status) {
      addError(
        errors,
        rootDir,
        specPath,
        `Issue ${issue.id} 表格状态 ${row.status} 与 frontmatter ${issue.status} 不一致`,
      );
    }
    if (row.dependencies.join(",") !== issue.dependencies.join(",")) {
      addError(errors, rootDir, specPath, `Issue ${issue.id} 表格依赖与 blocked_by 不一致`);
    }
  }
  for (const id of issueTable.keys()) {
    if (!issues.some((issue) => issue.id === id)) {
      addError(errors, rootDir, specPath, `Issue 表引用了不存在的 ${id}`);
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
    "Issue",
  ]) {
    if (!hasSection(specContent, heading)) {
      addError(errors, rootDir, specPath, `缺少「## ${heading}」章节`);
    }
  }
  const specStatus = specFrontmatter.get("status");
  if (!SPEC_STATUSES.has(specStatus)) {
    addError(errors, rootDir, specPath, `status 必须是 ${[...SPEC_STATUSES].join(" | ")}`);
  }
  const issues = loadIssues(planPath, markdownFiles, errors, rootDir);
  if (issues.length === 0) return;
  checkDependencyGraph(issues, planPath, errors, rootDir);
  checkIssueTable(specContent, specPath, issues, errors, rootDir);
  const expectedSpecStatus = deriveSpecStatus(issues);
  if (specStatus !== expectedSpecStatus) {
    addError(errors, rootDir, specPath, `聚合状态应为 ${expectedSpecStatus}，实际为 ${specStatus}`);
  }
  if (lifecycle === "reference" && expectedSpecStatus !== "completed") {
    addError(errors, rootDir, planPath, "reference Plan 的 Issue 必须全部 completed");
  }
};

const checkPlan = (planPath, lifecycle, errors, rootDir) => {
  const layout = checkPlanLayout(planPath, lifecycle, errors, rootDir);
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
        "Plan 生命周期目录只能是 active、reference 或 archived",
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
    "DOMAIN.md",
  );
  if (!fs.existsSync(policyPath)) {
    addError(errors, rootDir, policyPath, "/loop-x 缺少 references/DOMAIN.md");
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
    const contextPath = path.join(domainPath, "CONTEXT.md");
    if (!fs.existsSync(contextPath)) {
      addError(errors, rootDir, contextPath, "业务域缺少 CONTEXT.md");
    } else {
      const content = readText(contextPath, errors, rootDir);
      if (content !== null) {
        assertChineseDocument(content, contextPath, errors, rootDir);
        const lineCount = countLines(content);
        if (lineCount > 610) {
          addError(errors, rootDir, contextPath, `CONTEXT.md 共 ${lineCount} 行，超过 610`);
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
