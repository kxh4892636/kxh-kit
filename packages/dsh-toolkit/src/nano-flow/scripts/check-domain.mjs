#!/usr/bin/env node
// Nano Flow 工作区校验：领域文档、Plan 布局、notes.json（DAG）与尺寸上限。
// 唯一实现：nano_flow_check 直接以 node 运行本文件，不再另写一套规则。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_DOMAINS = ".agents/domains";
export const PLAN_LIFECYCLES = Object.freeze(["active", "reference", "archived"]);
// reference 与 archived 是冻结内容，模板差异不再校验，避免历史缺项淹没本次新增问题。
export const CHECKED_LIFECYCLES = Object.freeze(["active"]);
export const NOTE_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
]);
/** `waiting` 时在等什么；与 dag.ts 的 NOTE_NEEDS 保持一致。 */
export const NOTE_NEEDS = Object.freeze(["answer", "review"]);
/** 重命名前的状态名，读到即当作 waiting + needs: review。 */
export const LEGACY_WAITING_STATUS = "awaiting_verification";

export const LIMIT_KEYS = Object.freeze([
  "storyMaxBytes",
  "specMaxBytes",
  "noteMaxBytes",
  "noteDescriptionMaxChars",
  "indexMaxRows",
  "contextMaxBytes",
  "questionsMaxBytes",
  "adrMaxBytes",
  "adrMaxCount",
]);

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HAN = /\p{Script=Han}/u;
const NOTE_ID = /^\d{2}$/;

const rel = (rootDir, targetPath) => path.relative(rootDir, targetPath).replaceAll("\\", "/");

const resolveDomains = (rootDir, domainsPath) =>
  path.isAbsolute(domainsPath) ? domainsPath : path.join(rootDir, domainsPath);

const byteLength = (value) => Buffer.byteLength(value, "utf8");

const isValidDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    [
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("-") === value
  );
};

/**
 * 校验来自工具调用的上限对象；缺键或非正整数直接抛错。
 * @param raw - 已解析的上限值。
 * @returns 完整上限。
 */
export const parseLimits = (raw) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("limits 必须是对象");
  }
  const limits = {};
  for (const key of LIMIT_KEYS) {
    const value = raw[key];
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`limits.${key} 必须是正整数，实际为 ${JSON.stringify(value)}`);
    }
    limits[key] = value;
  }
  return limits;
};

const createReporter = (rootDir) => {
  const errors = [];
  return {
    errors,
    /** @param {string} targetPath @param {string} rule @param {string} message */
    push(targetPath, rule, message) {
      errors.push({ path: rel(rootDir, targetPath), rule, message });
    },
  };
};

const readText = (targetPath, report) => {
  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    report.push(
      targetPath,
      "io",
      `读取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

const readEntries = (targetPath, report) => {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (error) {
    report.push(
      targetPath,
      "io",
      `枚举失败: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
};

const checkDomainKnowledge = (rootDir, domainsPath, limits) => {
  const report = createReporter(rootDir);
  const mapPath = path.join(rootDir, "CONTEXT-MAP.md");
  if (!fs.existsSync(mapPath)) {
    report.push(mapPath, "knowledge", "缺少 CONTEXT-MAP.md");
    return report.errors;
  }
  const mapContent = readText(mapPath, report);
  const domainsDir = resolveDomains(rootDir, domainsPath);
  if (!fs.existsSync(domainsDir)) {
    report.push(domainsDir, "knowledge", `缺少领域根目录 ${domainsPath}`);
    return report.errors;
  }
  const domainNames = new Set();
  for (const entry of readEntries(domainsDir, report)) {
    if (!entry.isDirectory()) continue;
    domainNames.add(entry.name);
    const domainPath = path.join(domainsDir, entry.name);
    if (!KEBAB.test(entry.name)) {
      report.push(domainPath, "knowledge", "domain-name 必须是 kebab-case");
    }
    for (const fileName of ["CONTEXT.md", "QUESTIONS.md"]) {
      const documentPath = path.join(domainPath, fileName);
      if (!fs.existsSync(documentPath)) {
        report.push(documentPath, "knowledge", `业务域缺少 ${fileName}`);
        continue;
      }
      const content = readText(documentPath, report);
      if (content === null) continue;
      if (!HAN.test(content)) report.push(documentPath, "knowledge", "正文必须包含中文");
      const maxBytes =
        fileName === "CONTEXT.md" ? limits.contextMaxBytes : limits.questionsMaxBytes;
      const size = byteLength(content);
      if (size > maxBytes) {
        report.push(documentPath, "size", `${fileName} 共 ${size} 字节，超过 ${maxBytes}`);
      }
    }
    if (
      mapContent !== null &&
      !mapContent.includes(`(./${domainsPath}/${entry.name}/CONTEXT.md)`)
    ) {
      report.push(mapPath, "knowledge", `缺少业务域 ${entry.name} 的索引`);
    }
    checkAdrs(domainPath, limits, report);
  }
  if (mapContent !== null) {
    const prefix = `./${domainsPath}/`;
    const suffix = "/CONTEXT.md";
    for (const match of mapContent.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (!target.startsWith(prefix) || !target.endsWith(suffix)) continue;
      const name = target.slice(prefix.length, -suffix.length);
      if (!domainNames.has(name))
        report.push(mapPath, "knowledge", `索引指向不存在的业务域 ${name}`);
    }
  }
  return report.errors;
};

const checkAdrs = (domainPath, limits, report) => {
  const adrPath = path.join(domainPath, "adr");
  if (!fs.existsSync(adrPath)) return;
  const files = readEntries(adrPath, report)
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  if (files.length > limits.adrMaxCount) {
    report.push(adrPath, "size", `ADR 共 ${files.length} 个，超过 ${limits.adrMaxCount}`);
  }
  for (const [index, file] of files.entries()) {
    const filePath = path.join(adrPath, file.name);
    const expected = String(index + 1).padStart(4, "0");
    const match = file.name.match(/^(\d{4})-(.+)\.md$/);
    if (!match || match[1] !== expected || !HAN.test(match[2])) {
      report.push(
        filePath,
        "knowledge",
        `ADR 文件名必须按域内连续编号，期望 ${expected}-中文决策名.md`,
      );
    }
    const content = readText(filePath, report);
    if (content === null) continue;
    if (!HAN.test(content)) report.push(filePath, "knowledge", "正文必须包含中文");
    const size = byteLength(content);
    if (size > limits.adrMaxBytes) {
      report.push(filePath, "size", `ADR 共 ${size} 字节，超过 ${limits.adrMaxBytes}`);
    }
  }
};

const checkMarkdownLinks = (planDir, filePath, report) => {
  const content = fs.readFileSync(filePath, "utf8");
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const clean = target.split("#")[0];
    if (!clean.endsWith(".md")) continue;
    const resolved = path.resolve(planDir, clean);
    if (!fs.existsSync(resolved)) {
      report.push(filePath, "link", `链接目标不存在: ${clean}`);
    }
  }
};

const checkPlanDocuments = (planDir, limits, report, checkLinks) => {
  const entries = readEntries(planDir, report);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      report.push(path.join(planDir, entry.name), "layout", "Plan 目录内不允许嵌套目录");
    }
  }
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  for (const required of ["story.md", "spec.md", "notes.json"]) {
    if (!files.includes(required)) {
      report.push(path.join(planDir, required), "layout", `Plan 必须包含 ${required}`);
    }
  }
  for (const name of files) {
    if (!/^(?:story|spec).*\.md$/.test(name)) continue;
    const filePath = path.join(planDir, name);
    const content = readText(filePath, report);
    if (content === null) continue;
    if (!HAN.test(content)) report.push(filePath, "layout", "正文必须包含中文");
    const max = name.startsWith("story") ? limits.storyMaxBytes : limits.specMaxBytes;
    const size = byteLength(content);
    if (size > max) {
      report.push(filePath, "size", `${name} 共 ${size} 字节，超过 ${max}；先压缩，再拆子索引`);
    }
    if (checkLinks) checkMarkdownLinks(planDir, filePath, report);
  }
};

const checkCycle = (notes, report, notesPath) => {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (note) => {
    if (visiting.has(note.id)) return true;
    if (visited.has(note.id)) return false;
    visiting.add(note.id);
    const cyclic = note.blocked_by.some((dependency) => {
      const target = byId.get(dependency);
      return target === undefined ? false : visit(target);
    });
    visiting.delete(note.id);
    visited.add(note.id);
    return cyclic;
  };
  if (notes.some((note) => visit(note))) report.push(notesPath, "dag", "note 依赖图存在环");
};

const isStringArray = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const checkNotesDocument = (planDir, limits, report) => {
  const notesPath = path.join(planDir, "notes.json");
  if (!fs.existsSync(notesPath)) return;
  const content = readText(notesPath, report);
  if (content === null) return;
  let doc;
  try {
    doc = JSON.parse(content);
  } catch (error) {
    report.push(
      notesPath,
      "notes",
      `notes.json 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    report.push(notesPath, "notes", "notes.json 根必须是对象");
    return;
  }
  if (doc.version !== 1)
    report.push(notesPath, "notes", `version 必须是 1，实际为 ${String(doc.version)}`);
  if (!isStringArray(doc.index)) {
    report.push(notesPath, "index", "index 必须是字符串数组");
  }
  if (!Array.isArray(doc.notes)) {
    report.push(notesPath, "notes", "notes 必须是数组");
    return;
  }
  const ids = new Set();
  const notes = [];
  for (const [position, note] of doc.notes.entries()) {
    const at = path.join(notesPath, `notes[${position}]`);
    if (typeof note !== "object" || note === null || Array.isArray(note)) {
      report.push(at, "notes", "note 必须是对象");
      continue;
    }
    const id = note.id;
    if (typeof id !== "string" || !NOTE_ID.test(id)) {
      report.push(at, "notes", "id 必须是两位数字字符串");
      continue;
    }
    if (ids.has(id)) report.push(at, "notes", `id 重复: ${id}`);
    ids.add(id);
    if (typeof note.title !== "string" || note.title.trim() === "") {
      report.push(at, "notes", "title 必须是非空字符串");
    }
    if (typeof note.description !== "string") {
      report.push(at, "notes", "description 必须是字符串");
    } else if ([...note.description].length > limits.noteDescriptionMaxChars) {
      report.push(at, "size", `description 超过 ${limits.noteDescriptionMaxChars} 字`);
    }
    const status = note.status === LEGACY_WAITING_STATUS ? "waiting" : note.status;
    if (!NOTE_STATUSES.includes(status)) {
      report.push(at, "notes", `status 必须是 ${NOTE_STATUSES.join(" | ")}`);
    }
    const needs =
      note.needs === undefined && note.status === LEGACY_WAITING_STATUS ? "review" : note.needs;
    if (status === "waiting" && needs === undefined) {
      if (note.status !== LEGACY_WAITING_STATUS) {
        report.push(at, "notes", `status 是 waiting 时必须给 needs（${NOTE_NEEDS.join(" | ")}）`);
      }
    } else if (needs !== undefined && !NOTE_NEEDS.includes(needs)) {
      report.push(at, "notes", `needs 必须是 ${NOTE_NEEDS.join(" | ")}`);
    }
    if (!isStringArray(note.blocked_by)) {
      report.push(at, "notes", "blocked_by 必须是字符串数组");
    }
    if (note.evidence !== undefined && !isStringArray(note.evidence)) {
      report.push(at, "notes", "evidence 必须是字符串数组");
    }
    if (
      note.blocked_reason !== undefined &&
      note.blocked_reason !== null &&
      typeof note.blocked_reason !== "string"
    ) {
      report.push(at, "notes", "blocked_reason 必须是字符串或 null");
    }
    if (typeof note.content !== "string") {
      report.push(at, "notes", "content 必须是字符串");
    } else if (byteLength(note.content) > limits.noteMaxBytes) {
      report.push(
        at,
        "size",
        `note ${id} 正文 ${byteLength(note.content)} 字节，超过 ${limits.noteMaxBytes}；请拆分为多条 note`,
      );
    }
    notes.push({
      id,
      status,
      blocked_by: isStringArray(note.blocked_by) ? note.blocked_by : [],
      evidence: isStringArray(note.evidence) ? note.evidence : [],
      blocked_reason: typeof note.blocked_reason === "string" ? note.blocked_reason : undefined,
    });
  }
  const byId = new Map(notes.map((note) => [note.id, note]));
  for (const note of notes) {
    for (const dependency of note.blocked_by) {
      if (dependency === note.id) {
        report.push(notesPath, "dag", `note ${note.id} 不能依赖自己`);
        continue;
      }
      const target = byId.get(dependency);
      if (target === undefined) {
        report.push(notesPath, "dag", `note ${note.id} 依赖不存在的 note ${dependency}`);
        continue;
      }
      if (note.status !== "pending" && target.status !== "completed") {
        report.push(
          notesPath,
          "dag",
          `${note.status} 的 note ${note.id} 的直接依赖 ${dependency} 尚未 completed`,
        );
      }
    }
    if (note.status === "completed" && note.evidence.length === 0) {
      report.push(notesPath, "notes", `completed 的 note ${note.id} 缺少 evidence`);
    }
    if (note.status === "blocked" && (note.blocked_reason ?? "").trim() === "") {
      report.push(notesPath, "notes", `blocked 的 note ${note.id} 必须写 blocked_reason`);
    }
  }
  checkCycle(notes, report, notesPath);
  const index = isStringArray(doc.index) ? doc.index : [];
  if (index.length > limits.indexMaxRows) {
    report.push(notesPath, "index", `index 共 ${index.length} 项，超过 ${limits.indexMaxRows}`);
  }
  const seen = new Set();
  for (const id of index) {
    if (seen.has(id)) report.push(notesPath, "index", `index 重复: ${id}`);
    seen.add(id);
    if (!byId.has(id)) report.push(notesPath, "index", `index 引用了不存在的 note ${id}`);
  }
};

const checkPlan = (planDir, lifecycle, limits, report) => {
  // 没有 notes.json 的目录是旧 Markdown Plan：当作不存在，不校验、不报错。
  if (!fs.existsSync(path.join(planDir, "notes.json"))) return;
  const name = path.basename(planDir);
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match || !isValidDate(match[1]) || !HAN.test(match[2])) {
    report.push(planDir, "layout", "Plan 目录名必须是 YYYY-MM-DD-中文工作名");
  }
  // reference / archived 是冻结内容：历史链接常指向已退役文件或从未提交的运行时资料，
  // 与「冻结内容不校验模板差异」一致，Markdown 链接只对 active 校验。
  checkPlanDocuments(planDir, limits, report, lifecycle === "active");
  checkNotesDocument(planDir, limits, report);
};

const checkPlans = (rootDir, domainsPath, limits, report, planRef) => {
  const domainsDir = resolveDomains(rootDir, domainsPath);
  if (planRef !== undefined) {
    const segments = planRef.split("/").filter(Boolean);
    if (segments.length !== 3) {
      report.push(domainsDir, "layout", "--plan 必须是 <domain>/<lifecycle>/<plan-name>");
      return;
    }
    const [domain, lifecycle, planName] = segments;
    if (!PLAN_LIFECYCLES.includes(lifecycle)) {
      report.push(domainsDir, "layout", `生命周期只能是 ${PLAN_LIFECYCLES.join(" | ")}`);
      return;
    }
    const planDir = path.join(domainsDir, domain, "plans", lifecycle, planName);
    if (!fs.existsSync(planDir)) {
      report.push(planDir, "layout", "Plan 不存在");
      return;
    }
    checkPlan(planDir, lifecycle, limits, report);
    return;
  }
  for (const domainEntry of readEntries(domainsDir, report)) {
    if (!domainEntry.isDirectory()) continue;
    const plansDir = path.join(domainsDir, domainEntry.name, "plans");
    if (!fs.existsSync(plansDir)) continue;
    for (const lifecycleEntry of readEntries(plansDir, report)) {
      if (!lifecycleEntry.isDirectory()) continue;
      if (!PLAN_LIFECYCLES.includes(lifecycleEntry.name)) {
        report.push(
          path.join(plansDir, lifecycleEntry.name),
          "layout",
          `生命周期只能是 ${PLAN_LIFECYCLES.join(" | ")}`,
        );
        continue;
      }
      if (!CHECKED_LIFECYCLES.includes(lifecycleEntry.name)) continue;
      const lifecyclePath = path.join(plansDir, lifecycleEntry.name);
      for (const planEntry of readEntries(lifecyclePath, report)) {
        if (!planEntry.isDirectory()) continue;
        checkPlan(path.join(lifecyclePath, planEntry.name), lifecycleEntry.name, limits, report);
      }
    }
  }
};

/**
 * 校验一个工作区（或其中单个 Plan）。
 * @param {{ rootDirectory: string, domainsPath?: string, planRef?: string, limits?: Record<string, number> }} options
 * @returns {{ path: string, rule: string, message: string }[]}
 */
export const checkWorkspace = (options) => {
  const rootDir = path.resolve(options.rootDirectory);
  const domainsPath = options.domainsPath ?? DEFAULT_DOMAINS;
  const limits = options.limits ?? parseLimits(undefined);
  if (options.planRef === undefined) {
    return [
      ...checkDomainKnowledge(rootDir, domainsPath, limits),
      ...(() => {
        const report = createReporter(rootDir);
        checkPlans(rootDir, domainsPath, limits, report, undefined);
        return report.errors;
      })(),
    ];
  }
  const report = createReporter(rootDir);
  checkPlans(rootDir, domainsPath, limits, report, options.planRef);
  return report.errors;
};

export const formatErrors = (errors) =>
  errors.map((error) => `${error.path}: [${error.rule}] ${error.message}`);

const run = (argv) => {
  const args = [...argv];
  let json = false;
  let planRef;
  let limitsText;
  let domainsPath = DEFAULT_DOMAINS;
  let rootDirectory = ".";
  const positional = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--json") json = true;
    else if (arg === "--plan") planRef = args.shift();
    else if (arg === "--domains") domainsPath = args.shift() ?? DEFAULT_DOMAINS;
    else if (arg === "--limits") limitsText = args.shift();
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法: node check-domain.mjs <工作区根> [--domains <相对路径>] [--plan <domain>/<lifecycle>/<name>] [--json]",
      );
      return 0;
    } else positional.push(arg);
  }
  if (positional[0] !== undefined) rootDirectory = positional[0];
  let errors;
  try {
    if (limitsText === undefined) throw new Error("缺少 --limits（由 nano_flow_check 传入）");
    const limits = parseLimits(JSON.parse(limitsText));
    errors = checkWorkspace({ rootDirectory, domainsPath, planRef, limits });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json)
      console.log(JSON.stringify({ ok: false, errors: [{ path: "", rule: "internal", message }] }));
    else console.error(`校验异常: ${message}`);
    return 1;
  }
  if (json) {
    console.log(JSON.stringify({ ok: errors.length === 0, errors }));
  } else if (errors.length === 0) {
    console.log("校验通过。");
  } else {
    console.error(`校验失败，共 ${errors.length} 项：`);
    for (const line of formatErrors(errors)) console.error(`- ${line}`);
  }
  return errors.length === 0 ? 0 : 1;
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
