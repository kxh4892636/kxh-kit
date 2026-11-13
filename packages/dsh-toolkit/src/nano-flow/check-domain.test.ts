import { existsSync } from "node:fs";
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
    const map = await readFile(join(root, ".agents", "domains", "CONTEXT-MAP.md"), "utf8");
    expect(map).toContain("[订单](./ordering/CONTEXT.md)");
    expect(map).toContain("**订单 → 账单**：订单完成后通知账单。");
    expect(existsSync(join(root, "CONTEXT-MAP.md"))).toBe(false);
  });

  it("does not overwrite CONTEXT-MAP when only one domain is checked", async () => {
    const root = await makeRoot();
    await domain(root, "ordering", "订单");
    await domain(root, "billing", "账单");
    const first = checkWorkspace(root);
    expect(first.ok).toBe(true);
    const before = await readFile(join(root, ".agents", "domains", "CONTEXT-MAP.md"), "utf8");
    const scoped = checkWorkspace(root, { domain: "ordering" });
    expect(scoped.ok).toBe(true);
    const after = await readFile(join(root, ".agents", "domains", "CONTEXT-MAP.md"), "utf8");
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

  it("keeps every incomplete note in the tracked table without a row limit", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = ".agents/domains/demo/plans/active/2026-11-08-多-note";
    await write(
      root,
      `${plan}/spec.md`,
      [
        "---",
        "name: '多 note'",
        "description: '多 note。'",
        "status: pending",
        "---",
        "",
        "# 多 note",
        "",
      ].join("\n"),
    );
    for (let index = 1; index <= 25; index += 1) {
      const id = String(index).padStart(3, "0");
      await write(
        root,
        `${plan}/${id}-任务${index}.md`,
        [
          "---",
          `name: '${id}-任务${index}'`,
          `description: '任务 ${index}。'`,
          "status: pending",
          "reason:",
          "related_noted: []",
          "next_step: '继续'",
          "---",
          "",
          `# ${id}-任务${index}`,
          "",
        ].join("\n"),
      );
    }
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    const spec = await readFile(join(root, plan, "spec.md"), "utf8");
    expect(spec).toContain("025-任务25");
    expect(spec).not.toContain("其余");
  });

  it("does not cap the number of ADRs", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    for (let index = 1; index <= 60; index += 1) {
      const id = String(index).padStart(3, "0");
      await write(
        root,
        `.agents/domains/demo/adr/${id}-决策${index}.md`,
        [
          "---",
          `name: '${id}-决策${index}'`,
          `description: '决策 ${index}。'`,
          "status: accepted",
          "---",
          "",
          `# ${id}-决策${index}`,
          "",
        ].join("\n"),
      );
    }
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
  });

  it("rejects spec-N.md split files and expects details to be linked from spec.md", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = ".agents/domains/demo/plans/active/2026-11-08-指针-spec";
    const spec = [
      "---",
      "name: '指针 spec'",
      "description: '指针 spec。'",
      "status: pending",
      "---",
      "",
      "# 指针 spec",
      "",
      "细节见 [note 001](001-细节.md)。",
      "",
    ].join("\n");
    await write(root, `${plan}/spec.md`, spec);
    await write(root, `${plan}/spec-1.md`, "不该存在的 spec 分片。\n");
    const result = checkWorkspace(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("spec 不拆分"))).toBe(true);
  });

  it("tells the model to split an oversized note into multiple notes", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = ".agents/domains/demo/plans/active/2026-11-08-大-note";
    await write(
      root,
      `${plan}/spec.md`,
      [
        "---",
        "name: '大 note'",
        "description: '大 note。'",
        "status: pending",
        "---",
        "",
        "# 大 note",
        "",
      ].join("\n"),
    );
    await write(
      root,
      `${plan}/001-大-note.md`,
      [
        "---",
        "name: '001-大-note'",
        "description: '大 note。'",
        "status: pending",
        "reason:",
        "related_noted: []",
        "next_step: '继续'",
        "---",
        "",
        "# 001-大-note",
        "",
        "x".repeat(14000),
        "",
      ].join("\n"),
    );
    const result = checkWorkspace(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("拆成多个独立 note"))).toBe(true);
  });

  it("validates related links at the end of a page", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const question = (body: string): string =>
      [
        "---",
        "name: '001-相关问题'",
        "description: '相关问题。'",
        "---",
        "",
        "# 001-相关问题",
        "",
        body,
      ].join("\n");
    await write(
      root,
      ".agents/domains/demo/adr/001-决策.md",
      [
        "---",
        "name: '001-决策'",
        "description: '决策。'",
        "status: accepted",
        "---",
        "",
        "# 001-决策",
        "",
      ].join("\n"),
    );
    await write(
      root,
      ".agents/domains/demo/questions/001-相关问题.md",
      question("## 相关\n- [001-决策](../adr/001-决策.md) — 同一决策\n"),
    );
    const valid = checkWorkspace(root);
    expect(valid.ok).toBe(true);
  });

  it("rejects dead related links, missing reasons, and trailing sections", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const question = (body: string): string =>
      [
        "---",
        "name: '001-相关问题'",
        "description: '相关问题。'",
        "---",
        "",
        "# 001-相关问题",
        "",
        body,
      ].join("\n");
    await write(
      root,
      ".agents/domains/demo/questions/001-相关问题.md",
      question("## 相关\n- [缺失](../adr/009-缺失.md) — 不存在\n"),
    );
    const dead = checkWorkspace(root);
    expect(dead.ok).toBe(false);
    expect(dead.errors.some((issue) => issue.message.includes("相关链接目标不存在"))).toBe(true);

    await write(
      root,
      ".agents/domains/demo/questions/001-相关问题.md",
      question("## 相关\n- [缺失](../adr/009-缺失.md)\n"),
    );
    const noReason = checkWorkspace(root);
    expect(noReason.ok).toBe(false);
    expect(noReason.errors.some((issue) => issue.message.includes("必须是「- ["))).toBe(true);

    await write(
      root,
      ".agents/domains/demo/questions/001-相关问题.md",
      question("## 相关\n- [缺失](../adr/009-缺失.md) — 不存在\n\n## 其他\n"),
    );
    const trailing = checkWorkspace(root);
    expect(trailing.ok).toBe(false);
    expect(trailing.errors.some((issue) => issue.message.includes("必须是最后一个章节"))).toBe(
      true,
    );
  });

  it("enforces the GUIDE budget from limits", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    await write(root, ".agents/domains/GUIDE.md", "x".repeat(14 * 1024));
    const over = checkWorkspace(root);
    expect(over.ok).toBe(false);
    expect(over.errors.some((issue) => issue.message.includes("GUIDE.md"))).toBe(true);

    const raised = checkWorkspace(root, { limits: { guideMaxBytes: 15 * 1024 } });
    expect(raised.ok).toBe(true);
  });

  it("keeps Chinese file names readable in generated index links", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const doc = (name: string, extra: string[] = []): string =>
      [
        "---",
        `name: '${name}'`,
        `description: '${name}。'`,
        ...extra,
        "---",
        "",
        `# ${name}`,
        "",
      ].join("\n");
    await write(root, ".agents/domains/demo/questions/001-中文问题.md", doc("001-中文问题"));
    await write(
      root,
      ".agents/domains/demo/adr/001-中文决策.md",
      doc("001-中文决策", ["status: accepted"]),
    );
    await write(
      root,
      ".agents/domains/demo/workflows/001-中文工作流/001-中文工作流.md",
      doc("001-中文工作流"),
    );
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    const questions = await readFile(join(root, ".agents/domains/demo/questions/index.md"), "utf8");
    expect(questions).toContain("[001-中文问题](001-中文问题.md)");
    expect(questions).not.toContain("%E4");
    const adrs = await readFile(join(root, ".agents/domains/demo/adr/index.md"), "utf8");
    expect(adrs).toContain("[001-中文决策](001-中文决策.md)");
    const workflows = await readFile(join(root, ".agents/domains/demo/workflows/index.md"), "utf8");
    expect(workflows).toContain("[001-中文工作流](001-中文工作流/001-中文工作流.md)");
  });

  it("escapes only ASCII-unsafe characters in generated links", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    await write(
      root,
      ".agents/domains/demo/questions/001-中文 问题.md",
      [
        "---",
        "name: '001-中文 问题'",
        "description: '带空格的问题。'",
        "---",
        "",
        "# 带空格",
        "",
      ].join("\n"),
    );
    const plan = ".agents/domains/demo/plans/active/2026-11-08-示例";
    await write(
      root,
      `${plan}/spec.md`,
      [
        "---",
        "name: '示例'",
        "description: '示例。'",
        "status: pending",
        "---",
        "",
        "# 示例",
        "",
      ].join("\n"),
    );
    await write(
      root,
      `${plan}/001-中文 标题.md`,
      [
        "---",
        "name: '001-中文 标题'",
        "description: '带空格的标题。'",
        "status: pending",
        "reason:",
        "related_noted: []",
        "next_step: '继续'",
        "---",
        "",
        "# 001-中文 标题",
        "",
      ].join("\n"),
    );
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    const questions = await readFile(join(root, ".agents/domains/demo/questions/index.md"), "utf8");
    expect(questions).toContain("(001-中文%20问题.md)");
    const notes = await readFile(join(root, plan, "notes_index.md"), "utf8");
    expect(notes).toContain("(001-中文%20标题.md)");
  });

  it("reports legacy documents and auto-aligns mismatched names", async () => {
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
    // 名字与文件名不一致会被自动对齐，重复因此消失。
    expect(strict.fixed.some((issue) => issue.message.includes("name 对齐文件名"))).toBe(true);
    expect(strict.errors.some((issue) => issue.message.includes("缺少 YAML 头"))).toBe(true);

    const loose = checkWorkspace(root, { strict: false });
    expect(loose.warnings.some((issue) => issue.message.includes("缺少 YAML 头"))).toBe(true);
  });
});

describe("自动修复", () => {
  const planDir = (name: string): string => `.agents/domains/${name}/plans/active/2026-01-01-示例`;

  const noteOf = (name: string, status: string, extraLines: string[] = []): string =>
    [
      "---",
      `name: '${name}'`,
      "description: '示例 note。'",
      `status: ${status}`,
      ...extraLines,
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n");

  const specOf = (status: string): string =>
    [
      "---",
      "name: '2026-01-01-示例'",
      "description: '示例 Plan。'",
      `status: ${status}`,
      "---",
      "",
      "# 示例",
      "",
    ].join("\n");

  it("按 note 派生 spec 状态", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = planDir("demo");
    await write(root, `${plan}/spec.md`, specOf("in_progress"));
    await write(root, `${plan}/001-甲.md`, noteOf("001-甲", "completed", ["related_noted: []"]));
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    expect(result.fixed.some((issue) => issue.message.includes("spec 状态"))).toBe(true);
    expect(await readFile(join(root, plan, "spec.md"), "utf8")).toContain("status: completed");
  });

  it("name 与文件名不一致时对齐，并联动 related_noted", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = planDir("demo");
    await write(root, `${plan}/spec.md`, specOf("in_progress"));
    await write(
      root,
      `${plan}/001-甲.md`,
      noteOf("旧名", "pending", ["related_noted: []", "next_step: '继续'"]),
    );
    await write(
      root,
      `${plan}/002-乙.md`,
      noteOf("002-乙", "pending", ["related_noted: ['旧名']", "next_step: '继续'"]),
    );
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    expect(result.fixed.some((issue) => issue.message.includes("name 对齐文件名"))).toBe(true);
    expect(result.fixed.some((issue) => issue.rule === "related")).toBe(true);
    expect(await readFile(join(root, plan, "001-甲.md"), "utf8")).toContain("name: '001-甲'");
    const second = await readFile(join(root, plan, "002-乙.md"), "utf8");
    expect(second).toContain("001-甲");
    expect(second).not.toContain("旧名");
  });

  it("非 blocked 的 note 去掉 reason", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = planDir("demo");
    await write(root, `${plan}/spec.md`, specOf("in_progress"));
    await write(
      root,
      `${plan}/001-甲.md`,
      noteOf("001-甲", "pending", ["related_noted: []", "next_step: '继续'", "reason: '旧原因'"]),
    );
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    expect(result.fixed.some((issue) => issue.message.includes("去掉 reason"))).toBe(true);
    expect(await readFile(join(root, plan, "001-甲.md"), "utf8")).not.toContain("reason:");
  });

  it("多行头字段折成单行，重复执行不再产生修复", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = planDir("demo");
    await write(root, `${plan}/spec.md`, specOf("in_progress"));
    await write(
      root,
      `${plan}/001-甲.md`,
      [
        "---",
        "name: '001-甲'",
        "description: |",
        "  第一行",
        "  第二行",
        "status: pending",
        "related_noted: []",
        "next_step: '继续'",
        "---",
        "",
        "# 001-甲",
        "",
      ].join("\n"),
    );
    const first = checkWorkspace(root);
    expect(first.ok).toBe(true);
    expect(first.fixed.some((issue) => issue.message.includes("description 多行合并为单行"))).toBe(
      true,
    );
    expect(await readFile(join(root, plan, "001-甲.md"), "utf8")).toContain(
      "description: 第一行 第二行",
    );
    const second = checkWorkspace(root);
    expect(second.fixed).toHaveLength(0);
  });

  it("缺 questions 目录时自动创建", async () => {
    const root = await makeRoot();
    await write(root, ".agents/domains/demo/CONTEXT.md", context("演示", "演示的职责。"));
    await write(root, ".agents/domains/demo/adr/index.md", "# ADR\n");
    await write(root, ".agents/domains/demo/workflows/index.md", "# Workflows\n");
    const result = checkWorkspace(root);
    expect(result.ok).toBe(true);
    expect(result.fixed.some((issue) => issue.message.includes("创建 questions 目录"))).toBe(true);
    expect(existsSync(join(root, ".agents/domains/demo/questions/index.md"))).toBe(true);
  });

  it("blocked 缺 reason 仍只报错", async () => {
    const root = await makeRoot();
    await domain(root, "demo", "演示");
    const plan = planDir("demo");
    await write(root, `${plan}/spec.md`, specOf("in_progress"));
    await write(root, `${plan}/001-甲.md`, noteOf("001-甲", "blocked", ["related_noted: []"]));
    const result = checkWorkspace(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("reason"))).toBe(true);
  });
});
