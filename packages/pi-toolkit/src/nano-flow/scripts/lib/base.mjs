import fs from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

/** 默认领域根；与 `prompts/system.md` 的约定一致。 */
const DOMAINS_DIR = ".agents/domains";

/** 领域索引文件名；与 `GUIDE.md` 同级，宿主据它定位业务域。 */
const CONTEXT_MAP_FILE = "CONTEXT-MAP.md";

/** 生成文件的标记：模型不需要维护索引，看到它就应改源文档。 */
const GENERATED_MARKER = "<!-- 由 nano_flow_check 生成，请勿手改 -->";

/** Plan 生命周期；保留现有插件的三档，轮转按 active 找 Plan。 */
export const LIFECYCLES = Object.freeze(["active", "reference", "archived"]);

/** note 状态；blocked 用 reason 表达“在等什么”。 */
const NOTE_STATUSES = Object.freeze(["pending", "in_progress", "blocked", "completed"]);

/** spec 状态；由全部 note 派生。 */
const SPEC_STATUSES = Object.freeze(["pending", "in_progress", "completed"]);

/** ADR 状态；可选。 */
const ADR_STATUSES = Object.freeze(["proposed", "accepted", "deprecated", "superseded"]);

/** 面板可调的默认上限；工具会把当前设置以 `--limits` 传入。 */
const DEFAULT_LIMITS = Object.freeze({
  specMaxBytes: 34 * 1024,
  noteMaxBytes: 13 * 1024,
  noteDescriptionMaxChars: 233,
  contextMaxBytes: 89 * 1024,
  questionMaxBytes: 13 * 1024,
  adrMaxBytes: 13 * 1024,
  workflowMaxBytes: 34 * 1024,
  guideMaxBytes: 13 * 1024,
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

/** 记录一条自动修复，调用方据此只回「修了什么」。 */
const addFixed = (fixedList, rootDir, targetPath, rule, message) => {
  fixedList.push({ path: relativePath(rootDir, targetPath), rule, message });
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

/**
 * 把内容写进工作区内的文件，越界或失败记 error。
 * @returns `written` | `unchanged` | `rejected`
 */
const writeInsideWorkspace = (ctx, file, content) => {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${path.resolve(ctx.rootDir)}${path.sep}`)) {
    addIssue(ctx.errors, ctx.rootDir, file, "write", "目标不在工作区内，拒绝写入");
    return "rejected";
  }
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const parentReal = fs.realpathSync(path.dirname(resolved));
    const rootReal = fs.realpathSync(ctx.rootDir);
    if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
      addIssue(ctx.errors, ctx.rootDir, file, "write", "目标解析到工作区外，拒绝写入");
      return "rejected";
    }
    if (exists(resolved)) {
      const fileReal = fs.realpathSync(resolved);
      if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${path.sep}`)) {
        addIssue(ctx.errors, ctx.rootDir, file, "write", "目标文件解析到工作区外，拒绝写入");
        return "rejected";
      }
      if (fs.readFileSync(resolved, "utf8") === content) return "unchanged";
    }
    fs.writeFileSync(resolved, content, "utf8");
    return "written";
  } catch (error) {
    addIssue(ctx.errors, ctx.rootDir, file, "write", `写入失败: ${describe(error)}`);
    return "rejected";
  }
};

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

export {
  DOMAINS_DIR,
  CONTEXT_MAP_FILE,
  GENERATED_MARKER,
  NOTE_STATUSES,
  SPEC_STATUSES,
  ADR_STATUSES,
  DEFAULT_LIMITS,
  NAME_MAX_CHARS,
  REASON_MAX_CHARS,
  NEXT_STEP_MAX_CHARS,
  KEBAB,
  PLAN_NAME,
  NUMBERED_NAME,
  HAN,
  relativePath,
  addIssue,
  addFixed,
  writeInsideWorkspace,
  describe,
  readText,
  readEntries,
  exists,
  byteLength,
  isValidDate,
  isSingleLine,
  normalizeCell,
  sortByName,
  parseFrontmatter,
};
