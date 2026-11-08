import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { checkWorkspace } from "./scripts/check-domain.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-check-"));
  roots.push(root);
  return root;
};

const write = async (root: string, file: string, content: string): Promise<void> => {
  const target = join(root, file);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content, "utf8");
};

const context = (name: string, description: string, relations = ""): string =>
  [
    "---",
    `name: '${name}'`,
    `description: '${description}'`,
    relations === "" ? "relations: []" : relations,
    "---",
    "",
    `# ${name}`,
    "",
  ].join("\n");

const domain = async (
  root: string,
  name: string,
  display: string,
  relations = "",
): Promise<void> => {
  await write(
    root,
    `.agents/domains/${name}/CONTEXT.md`,
    context(display, `${display} 的职责。`, relations),
  );
  await write(
    root,
    `.agents/domains/${name}/questions/index.md`,
    "# Questions\n\n<!-- generated -->\n",
  );
  await mkdir(join(root, ".agents/domains", name, "adr"), { recursive: true });
  await mkdir(join(root, ".agents/domains", name, "workflows"), { recursive: true });
};

describe("checkWorkspace", () => {
  it("generates CONTEXT-MAP from context headers and relations", async () => {
    const root = await makeRoot();
    await domain(
      root,
      "ordering",
      "订单",
      "relations:\n  - to: billing\n    description: 订单完成后通知账单。",
    );
    await domain(root, "billing", "账单");
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    const map = await readFile(join(root, "CONTEXT-MAP.md"), "utf8");
    expect(map).toContain("[订单](./.agents/domains/ordering/CONTEXT.md)");
    expect(map).toContain("**订单 → 账单**：订单完成后通知账单。");
  });

  it("does not overwrite CONTEXT-MAP when only one domain is checked", async () => {
    const root = await makeRoot();
    await domain(root, "ordering", "订单");
    await domain(root, "billing", "账单");
    const first = checkWorkspace(root);
    expect(first.ok).toBe(true);
    const before = await readFile(join(root, "CONTEXT-MAP.md"), "utf8");
    const scoped = checkWorkspace(root, { domain: "ordering" });
    expect(scoped.ok).toBe(true);
    const after = await readFile(join(root, "CONTEXT-MAP.md"), "utf8");
    expect(after).toBe(before);
  });

  it("orders tracked notes by blocked, in_progress, pending and keeps all notes in notes_index", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = ".agents/domains/demo/plans/active/2026-11-08-示例";
    await write(
      root,
      `${plan}/spec.md`,
      [
        "---",
        "name: '示例'",
        "description: '示例。'",
        "status: in_progress",
        "---",
        "",
        "# 示例",
        "",
      ].join("\n"),
    );
    const note = (name: string, status: string, extra = ""): string =>
      [
        "---",
        `name: '${name}'`,
        `description: '${name} 的摘要。'`,
        `status: ${status}`,
        ...(status === "blocked" ? ["reason: '等上游'"] : ["reason:"]),
        "related_noted: []",
        ...(status === "completed" ? [] : ["next_step: '继续'"]),
        "---",
        "",
        `# ${name}`,
        "",
        extra,
      ].join("\n");
    await write(root, `${plan}/001-甲.md`, note("001-甲", "pending"));
    await write(root, `${plan}/002-乙.md`, note("002-乙", "blocked"));
    await write(root, `${plan}/003-丙.md`, note("003-丙", "completed"));
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    const spec = await readFile(join(root, plan, "spec.md"), "utf8");
    expect(spec.indexOf("002-乙")).toBeLessThan(spec.indexOf("001-甲"));
    expect(spec).not.toContain("003-丙");
    const index = await readFile(join(root, plan, "notes_index.md"), "utf8");
    expect(index).toContain("001-甲");
    expect(index).toContain("003-丙");
  });

  it("reports duplicate names and legacy documents", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const questions = ".agents/domains/demo/questions";
    await write(
      root,
      `${questions}/001-同名.md`,
      ["---", "name: '001-同名'", "description: '一。'", "---", "", "# 一", ""].join("\n"),
    );
    await write(
      root,
      `${questions}/002-同名.md`,
      ["---", "name: '001-同名'", "description: '二。'", "---", "", "# 二", ""].join("\n"),
    );
    await write(root, `${questions}/003-旧格式.md`, "# 旧格式\n\n没有 YAML 头。\n");
    const strict = checkWorkspace(root);
    expect(strict.ok).toBe(false);
    expect(strict.errors.some((issue) => issue.message.includes("name 重复"))).toBe(true);
    expect(strict.errors.some((issue) => issue.message.includes("缺少 YAML 头"))).toBe(true);

    const loose = checkWorkspace(root, { strict: false });
    expect(loose.warnings.some((issue) => issue.message.includes("缺少 YAML 头"))).toBe(true);
  });
});
