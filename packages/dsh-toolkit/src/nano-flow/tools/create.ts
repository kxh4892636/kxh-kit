import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { ToolDefinitionLike, ToolExecContext } from "../services.js";
import {
  asArguments,
  optionalString,
  requiredString,
  textBlocks,
  type ToolRuntime,
} from "./shared.js";

const KINDS = ["domain", "plan", "note"] as const;
const LIFECYCLES = ["active", "reference", "archived"] as const;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAN_NAME = /^(\d{4}-\d{2}-\d{2})-(.+)$/u;
const NUMBERED_NAME = /^(\d{3})-(.+)$/u;
const HAN = /\p{Script=Han}/u;

const isValidDate = (value: string): boolean => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return (
    [
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("-") === value
  );
};

const yamlEscape = (value: string): string => value.replaceAll("'", "''");

const render = (template: string, values: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

const readTemplate = async (runtime: ToolRuntime, name: string): Promise<string> => {
  return readFile(join(runtime.templatesRoot, name), "utf8");
};

const ensureInside = (root: string, target: string): string => {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const relativePath = relative(resolvedRoot, resolvedTarget);
  if (relativePath === "") return resolvedTarget;
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`路径越界: ${target}`);
  }
  return resolvedTarget;
};

const displayPath = (workspace: string, target: string): string =>
  relative(workspace, target).replaceAll("\\", "/");

const writeIfMissing = async (
  file: string,
  content: string,
  report: { created: string[]; skipped: string[] },
  workspace: string,
): Promise<void> => {
  if (existsSync(file)) {
    report.skipped.push(displayPath(workspace, file));
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, { encoding: "utf8", flag: "wx" });
  report.created.push(displayPath(workspace, file));
};

const scaffoldDomain = async (
  runtime: ToolRuntime,
  workspace: string,
  domain: string,
  name: string,
  description: string,
): Promise<{ created: string[]; skipped: string[]; domainPath: string }> => {
  if (!KEBAB.test(domain)) throw new Error(`domain 必须是 kebab-case: ${domain}`);
  const domainsRoot = runtime.domainsDirectory(workspace);
  const domainPath = ensureInside(domainsRoot, join(domainsRoot, domain));
  await mkdir(domainPath, { recursive: true });
  const report = { created: [] as string[], skipped: [] as string[] };

  const contextTemplate = await readTemplate(runtime, "context.md");
  await writeIfMissing(
    join(domainPath, "CONTEXT.md"),
    render(contextTemplate, {
      name: yamlEscape(name),
      title: name,
      description: yamlEscape(description),
      description_text: description,
    }),
    report,
    workspace,
  );

  for (const folder of ["questions", "adr", "workflows"]) {
    await mkdir(join(domainPath, folder), { recursive: true });
    const templateName = `${folder === "questions" ? "questions" : folder}-index.md`;
    const template = await readTemplate(runtime, templateName);
    await writeIfMissing(join(domainPath, folder, "index.md"), template, report, workspace);
  }
  for (const lifecycle of LIFECYCLES) {
    await mkdir(join(domainPath, "plans", lifecycle), { recursive: true });
  }

  const guide = await readTemplate(runtime, "guide.md");
  await writeIfMissing(join(domainsRoot, "GUIDE.md"), guide, report, workspace);
  const map = await readTemplate(runtime, "context-map.md");
  await writeIfMissing(join(domainsRoot, "CONTEXT-MAP.md"), map, report, workspace);

  return { ...report, domainPath };
};

const findPlanDirectory = async (
  domainPath: string,
  planName: string | undefined,
  lifecycle: string | undefined,
): Promise<string> => {
  const plansRoot = join(domainPath, "plans");
  const lifecycles =
    lifecycle === undefined
      ? LIFECYCLES
      : LIFECYCLES.includes(lifecycle as (typeof LIFECYCLES)[number])
        ? [lifecycle as (typeof LIFECYCLES)[number]]
        : [];
  if (lifecycles.length === 0) throw new Error(`lifecycle 必须是 ${LIFECYCLES.join(" | ")}`);
  const candidates: string[] = [];
  for (const candidateLifecycle of lifecycles) {
    const directory = join(plansRoot, candidateLifecycle);
    if (!existsSync(directory)) continue;
    if (planName !== undefined) {
      const target = join(directory, planName);
      if (existsSync(target)) candidates.push(target);
      continue;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (candidateLifecycle === "active") candidates.push(join(directory, entry.name));
    }
  }
  if (candidates.length === 0) {
    throw new Error(
      planName === undefined
        ? "当前域没有 active 的 Plan；先创建 Plan 或显式传 plan"
        : `找不到 Plan ${planName}`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(`找到多个 Plan，请显式传 lifecycle 或 plan：${candidates.join("、")}`);
  }
  return candidates[0] as string;
};

const nextNoteName = async (planDirectory: string, rawTitle: string): Promise<string> => {
  const title = rawTitle.replace(/\.md$/u, "").trim();
  const used = new Set<number>();
  for (const entry of await readdir(planDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = NUMBERED_NAME.exec(entry.name.replace(/\.md$/u, ""));
    if (match !== null) used.add(Number(match[1]));
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return `${String(next).padStart(3, "0")}-${title}`;
};

const executeCreate = async (
  runtime: ToolRuntime,
  args: Record<string, unknown>,
  exec: ToolExecContext,
): Promise<string> => {
  const kind = optionalString(args, "kind") ?? "domain";
  if (!(KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind 必须是 ${KINDS.join(" | ")}`);
  }
  const domain = requiredString(args, "domain");
  if (!KEBAB.test(domain)) throw new Error(`domain 必须是 kebab-case: ${domain}`);
  const workspace = await runtime.workspace(exec);

  if (kind === "domain") {
    const name = optionalString(args, "name") ?? domain;
    const description = optionalString(args, "description") ?? `${domain} 域的职责与术语，待补。`;
    const result = await scaffoldDomain(runtime, workspace, domain, name, description);
    return [
      `已创建/检查 domain: ${domain}`,
      `目录: ${displayPath(workspace, result.domainPath)}`,
      ...(result.created.length === 0
        ? []
        : ["新建:", ...result.created.map((file) => `- ${file}`)]),
      ...(result.skipped.length === 0
        ? []
        : ["已存在:", ...result.skipped.map((file) => `- ${file}`)]),
      "下一步: 运行 nano_flow_check 生成索引。",
    ].join("\n");
  }

  if (kind === "plan") {
    const name = requiredString(args, "name");
    const match = PLAN_NAME.exec(name);
    if (match === null || !isValidDate(match[1] ?? "") || !HAN.test(match[2] ?? "")) {
      throw new Error(`Plan name 必须是 YYYY-MM-DD-中文工作名: ${name}`);
    }
    const lifecycle = optionalString(args, "lifecycle") ?? "active";
    if (!(LIFECYCLES as readonly string[]).includes(lifecycle)) {
      throw new Error(`lifecycle 必须是 ${LIFECYCLES.join(" | ")}`);
    }
    const domainResult = await scaffoldDomain(
      runtime,
      workspace,
      domain,
      domain,
      `${domain} 域的职责与术语，待补。`,
    );
    const planDirectory = ensureInside(
      join(runtime.domainsDirectory(workspace), domain, "plans", lifecycle),
      join(runtime.domainsDirectory(workspace), domain, "plans", lifecycle, name),
    );
    if (existsSync(planDirectory))
      throw new Error(`Plan 已存在: ${displayPath(workspace, planDirectory)}`);
    await mkdir(planDirectory, { recursive: true });
    const title = (match[2] ?? "").trim();
    const specDescription = optionalString(args, "description") ?? `${title} 的规格与进度。`;
    const spec = await readTemplate(runtime, "spec.md");
    const specContent = render(spec, {
      name: yamlEscape(title),
      title,
      description: yamlEscape(specDescription),
      description_text: specDescription,
    });
    await writeFile(join(planDirectory, "spec.md"), specContent, "utf8");
    const notesIndex = await readTemplate(runtime, "notes-index.md");
    await writeFile(join(planDirectory, "notes_index.md"), notesIndex, "utf8");
    return [
      `已创建 Plan: ${domain}/${lifecycle}/${name}`,
      `目录: ${displayPath(workspace, planDirectory)}`,
      ...(domainResult.created.length === 0
        ? []
        : ["顺带创建:", ...domainResult.created.map((file) => `- ${file}`)]),
      "下一步: 写 spec.md，再用 kind=note 建 note，最后运行 nano_flow_check。",
    ].join("\n");
  }

  const nameArgument = optionalString(args, "name");
  const title = optionalString(args, "title");
  const description = optionalString(args, "description") ?? "待补。";
  const lifecycle = optionalString(args, "lifecycle");
  const domainResult = await scaffoldDomain(
    runtime,
    workspace,
    domain,
    domain,
    `${domain} 域的职责与术语，待补。`,
  );
  const planDirectory = await findPlanDirectory(
    domainResult.domainPath,
    optionalString(args, "plan"),
    lifecycle,
  );
  const name =
    nameArgument ??
    (title === undefined || title.trim() === ""
      ? undefined
      : await nextNoteName(planDirectory, title.trim()));
  if (name === undefined) throw new Error("name 或 title 至少提供一个");
  if (!NUMBERED_NAME.test(name)) throw new Error(`note name 必须是 NNN-中文标题: ${name}`);
  const file = ensureInside(planDirectory, join(planDirectory, `${name}.md`));
  if (existsSync(file)) throw new Error(`note 已存在: ${displayPath(workspace, file)}`);
  const template = await readTemplate(runtime, "note.md");
  const content = render(template, {
    name: yamlEscape(name),
    title: name,
    description: yamlEscape(description),
    description_text: description,
    next_step: yamlEscape("读取 spec 与 notes_index，确认第一项可推进工作"),
  });
  await writeFile(file, content, { encoding: "utf8", flag: "wx" });
  return [
    `已创建 note: ${displayPath(workspace, file)}`,
    `Plan: ${displayPath(workspace, planDirectory)}`,
    "下一步: 补齐 note 的交付、验收与下一步，然后运行 nano_flow_check。",
  ].join("\n");
};

/**
 * 构造 `nano_flow_create`：按 kind 创建 domain / plan / note 的目录与模板文件。
 * @param runtime - 共享运行期依赖。
 * @returns 工具定义。
 */
export const createCreateTool = (runtime: ToolRuntime): ToolDefinitionLike => ({
  name: "nano_flow_create",
  description:
    "创建 Nano Flow 的目录与模板文件：kind=domain 建 CONTEXT/questions/adr/workflows 与 GUIDE；kind=plan 建 spec 与 notes_index；kind=note 建一条 note。只补缺失文件，不覆盖已有内容。",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      kind: {
        type: "string",
        enum: [...KINDS],
        description: "domain | plan | note，缺省 domain",
      },
      domain: { type: "string", description: "kebab-case 域名，例如 dsh" },
      name: {
        type: "string",
        description:
          "domain 的显示名；plan 的 YYYY-MM-DD-中文工作名；note 的 NNN-中文标题（省略时用 title 自动编号）",
      },
      title: { type: "string", description: "note 省略 name 时用于自动编号的中文标题" },
      description: { type: "string", description: "文档 description" },
      lifecycle: {
        type: "string",
        enum: [...LIFECYCLES],
        description: "plan 的生命周期，缺省 active",
      },
      plan: { type: "string", description: "kind=note 时要写入的 Plan 目录名" },
    },
    required: ["domain"],
  },
  output: { schema: { type: "string" }, render: (_args, value) => textBlocks(value) },
  async execute(raw, exec) {
    return executeCreate(runtime, asArguments(raw), exec);
  },
});
