/**
 * `nano_flow_create`：创建 domain / plan / note 的目录与模板文件。
 * 只补缺失文件，绝不覆盖；GUIDE.md 只在缺失时落空模板，正文由用户维护。
 * @module @kxh4892636/pi-toolkit/nano-flow/tools/create
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { Type } from "typebox";

import { DEFAULT_DOMAIN_ROOT } from "../config.ts";
import type { NanoDeps } from "./shared.ts";
import { asArguments, optionalString, requiredString } from "./shared.ts";

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

const yamlValue = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/\r?\n/gu, " ");

const render = (template: string, values: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

const readTemplate = (deps: NanoDeps, name: string): Promise<string> =>
  readFile(join(deps.templatesRoot, name), "utf8");

const displayPath = (workspace: string, target: string): string =>
  relative(workspace, target).replaceAll("\\", "/");

const ensureInside = (root: string, target: string): string => {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return resolvedTarget;
  throw new Error(`路径越界: ${target}`);
};

const domainsRootOf = (workspace: string): string =>
  isAbsolute(DEFAULT_DOMAIN_ROOT) ? DEFAULT_DOMAIN_ROOT : join(workspace, DEFAULT_DOMAIN_ROOT);

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
  deps: NanoDeps,
  workspace: string,
  domain: string,
  name: string,
  description: string,
): Promise<{ created: string[]; skipped: string[]; domainPath: string }> => {
  if (!KEBAB.test(domain)) throw new Error(`domain 必须是 kebab-case: ${domain}`);
  const domainsRoot = domainsRootOf(workspace);
  const domainPath = ensureInside(domainsRoot, join(domainsRoot, domain));
  await mkdir(domainPath, { recursive: true });
  const report = { created: [] as string[], skipped: [] as string[] };
  const values = {
    name: yamlValue(name),
    title: name,
    description: yamlValue(description),
    description_text: description,
  };
  await writeIfMissing(
    join(domainPath, "CONTEXT.md"),
    render(await readTemplate(deps, "context.md"), values),
    report,
    workspace,
  );
  for (const folder of ["questions", "adr", "workflows"]) {
    await mkdir(join(domainPath, folder), { recursive: true });
    const templateName = folder === "questions" ? "questions-index.md" : `${folder}-index.md`;
    await writeIfMissing(
      join(domainPath, folder, "index.md"),
      await readTemplate(deps, templateName),
      report,
      workspace,
    );
  }
  for (const lifecycle of LIFECYCLES) {
    await mkdir(join(domainPath, "plans", lifecycle), { recursive: true });
  }
  await writeIfMissing(
    join(domainsRoot, "GUIDE.md"),
    await readTemplate(deps, "guide.md"),
    report,
    workspace,
  );
  await writeIfMissing(
    join(domainsRoot, "CONTEXT-MAP.md"),
    await readTemplate(deps, "context-map.md"),
    report,
    workspace,
  );
  return { ...report, domainPath };
};

const findPlanDirectory = async (
  domainPath: string,
  planName: string | undefined,
  lifecycle: string | undefined,
): Promise<string> => {
  if (lifecycle !== undefined && !(LIFECYCLES as readonly string[]).includes(lifecycle)) {
    throw new Error(`lifecycle 必须是 ${LIFECYCLES.join(" | ")}`);
  }
  const lifecycles = lifecycle === undefined ? LIFECYCLES : [lifecycle];
  const candidates: string[] = [];
  for (const candidate of lifecycles) {
    const directory = join(domainPath, "plans", candidate);
    if (!existsSync(directory)) continue;
    if (planName !== undefined) {
      const target = join(directory, planName);
      if (existsSync(target)) candidates.push(target);
      continue;
    }
    if (candidate !== "active") continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(join(directory, entry.name));
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
  deps: NanoDeps,
  args: Record<string, unknown>,
  workspace: string,
): Promise<string> => {
  const kind = optionalString(args, "kind") ?? "domain";
  if (!(KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind 必须是 ${KINDS.join(" | ")}`);
  }
  const domain = requiredString(args, "domain");
  if (!KEBAB.test(domain)) throw new Error(`domain 必须是 kebab-case: ${domain}`);

  if (kind === "domain") {
    const name = optionalString(args, "name") ?? domain;
    const description = optionalString(args, "description") ?? `${domain} 域的职责与术语，待补。`;
    const result = await scaffoldDomain(deps, workspace, domain, name, description);
    return [
      `已创建/检查 domain: ${domain}`,
      `目录: ${displayPath(workspace, result.domainPath)}`,
      ...(result.created.length === 0 ? [] : ["新建:", ...result.created.map((f) => `- ${f}`)]),
      ...(result.skipped.length === 0 ? [] : ["已存在:", ...result.skipped.map((f) => `- ${f}`)]),
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
      deps,
      workspace,
      domain,
      domain,
      `${domain} 域的职责与术语，待补。`,
    );
    const planDirectory = ensureInside(
      join(domainResult.domainPath, "plans", lifecycle),
      join(domainResult.domainPath, "plans", lifecycle, name),
    );
    if (existsSync(planDirectory))
      throw new Error(`Plan 已存在: ${displayPath(workspace, planDirectory)}`);
    await mkdir(planDirectory, { recursive: true });
    const title = (match[2] ?? "").trim();
    const description = optionalString(args, "description") ?? `${title} 的规格与进度。`;
    const values = {
      name: yamlValue(title),
      title,
      description: yamlValue(description),
      description_text: description,
    };
    await writeFile(
      join(planDirectory, "spec.md"),
      render(await readTemplate(deps, "spec.md"), values),
      "utf8",
    );
    await writeFile(
      join(planDirectory, "notes_index.md"),
      await readTemplate(deps, "notes-index.md"),
      "utf8",
    );
    return [
      `已创建 Plan: ${domain}/${lifecycle}/${name}`,
      `目录: ${displayPath(workspace, planDirectory)}`,
      "下一步: 写 spec.md，再用 kind=note 建 note，最后运行 nano_flow_check。",
    ].join("\n");
  }

  const title = optionalString(args, "title");
  const nameArgument = optionalString(args, "name");
  const description = optionalString(args, "description") ?? "待补。";
  const domainResult = await scaffoldDomain(
    deps,
    workspace,
    domain,
    domain,
    `${domain} 域的职责与术语，待补。`,
  );
  const planDirectory = await findPlanDirectory(
    domainResult.domainPath,
    optionalString(args, "plan"),
    optionalString(args, "lifecycle"),
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
  const values = {
    name: yamlValue(name),
    title: name,
    description: yamlValue(description),
    description_text: description,
    next_step: yamlValue("读取 spec 与 notes_index，确认第一项可推进工作"),
  };
  await writeFile(file, render(await readTemplate(deps, "note.md"), values), {
    encoding: "utf8",
    flag: "wx",
  });
  return [
    `已创建 note: ${displayPath(workspace, file)}`,
    `Plan: ${displayPath(workspace, planDirectory)}`,
    "下一步: 补齐 note 的交付、验收与下一步，然后运行 nano_flow_check。",
  ].join("\n");
};

/** 构造 `nano_flow_create` 工具定义。 */
export const createCreateTool = (deps: NanoDeps) => ({
  name: "nano_flow_create",
  label: "Nano Flow Create",
  description:
    "创建 Nano Flow 的目录与模板文件：kind=domain 建 CONTEXT/questions/adr/workflows 与 GUIDE 空模板；kind=plan 建 spec 与 notes_index；kind=note 建一条 note。只补缺失文件，不覆盖已有内容；GUIDE 正文不在这里写。",
  promptSnippet: "Create a Nano Flow domain, plan, or note from templates.",
  parameters: Type.Object({
    kind: Type.Optional(
      Type.String({ enum: [...KINDS], description: "domain | plan | note，缺省 domain" }),
    ),
    domain: Type.String({ description: "kebab-case 域名，例如 order" }),
    name: Type.Optional(
      Type.String({
        description:
          "domain 的显示名；plan 的 YYYY-MM-DD-中文工作名；note 的 NNN-中文标题（省略时用 title 自动编号）",
      }),
    ),
    title: Type.Optional(Type.String({ description: "note 省略 name 时用于自动编号的中文标题" })),
    description: Type.Optional(Type.String({ description: "文档 description" })),
    lifecycle: Type.Optional(
      Type.String({ enum: [...LIFECYCLES], description: "plan 的生命周期，缺省 active" }),
    ),
    plan: Type.Optional(Type.String({ description: "kind=note 时要写入的 Plan 目录名" })),
  }),
  async execute(
    _toolCallId: string,
    raw: unknown,
    _signal: AbortSignal | undefined,
    _onUpdate: unknown,
    ctx: { readonly cwd: string },
  ) {
    const text = await executeCreate(deps, asArguments(raw), ctx.cwd);
    return { content: [{ type: "text" as const, text }], details: { text } };
  },
});
