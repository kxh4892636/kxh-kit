import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { checkWorkspace } from "./scripts/check-domain.mjs";

const created: string[] = [];
const domainRoot = ".agents/domains";
const planName = "2026-11-09-示例工作";

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const frontmatter = (fields: string): string => `---\n${fields}\n---\n\n# 正文\n`;

/** 造一个最小域：CONTEXT、questions、adr、workflows 与一个 Plan。 */
const seedWorkspace = (options: { plan?: boolean; questions?: boolean } = {}): string => {
  const workspace = mkdtempSync(join(tmpdir(), "pi-nano-check-"));
  created.push(workspace);
  const domain = join(workspace, domainRoot, "demo");
  mkdirSync(join(domain, "adr"), { recursive: true });
  mkdirSync(join(domain, "workflows"), { recursive: true });
  if (options.questions !== false) mkdirSync(join(domain, "questions"), { recursive: true });
  writeFileSync(
    join(domain, "CONTEXT.md"),
    frontmatter("name: '示例域'\ndescription: '演示用域'"),
    "utf8",
  );
  if (options.plan !== false) {
    const plan = join(domain, "plans", "active", planName);
    mkdirSync(plan, { recursive: true });
  }
  return workspace;
};

const planDirOf = (workspace: string): string =>
  join(workspace, domainRoot, "demo", "plans", "active", planName);

const writeSpec = (workspace: string, status: string): void => {
  writeFileSync(
    join(planDirOf(workspace), "spec.md"),
    frontmatter(`name: '${planName}'\ndescription: '示例 Plan'\nstatus: '${status}'`),
    "utf8",
  );
};

const writeNote = (workspace: string, fileName: string, fields: string): void => {
  writeFileSync(join(planDirOf(workspace), fileName), frontmatter(fields), "utf8");
};

const read = (workspace: string, ...rest: string[]): string =>
  readFileSync(join(workspace, ...rest), "utf8");

const check = (workspace: string) => checkWorkspace(workspace, { domainsPath: domainRoot });

const rulesOf = (issues: readonly { rule: string }[]): string[] =>
  issues.map((issue) => issue.rule);

describe("自动修复：spec 状态按 note 派生", () => {
  it("把与 note 不符的 status 改回来并记一条修复，不报 status 错误", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "completed");
    writeNote(
      workspace,
      "001-甲.md",
      "name: '001-甲'\ndescription: '甲'\nstatus: 'pending'\nnext_step: '继续'",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).not.toContain("status");
    expect(result.fixed.some((issue) => issue.rule === "status")).toBe(true);
    expect(read(workspace, domainRoot, "demo", "plans", "active", planName, "spec.md")).toContain(
      "status: 'pending'",
    );
  });
});

describe("自动修复：name 对齐文件名", () => {
  it("改写 name，并把同 Plan 其他 note 的 related_noted 一起改", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "in_progress");
    writeNote(workspace, "001-甲.md", "name: '旧名字'\ndescription: '甲'\nstatus: 'completed'");
    writeNote(
      workspace,
      "002-乙.md",
      "name: '002-乙'\ndescription: '乙'\nstatus: 'pending'\nnext_step: '继续'\nrelated_noted: ['旧名字']",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).not.toContain("name");
    expect(rulesOf(result.errors)).not.toContain("related");
    expect(result.fixed.map((issue) => issue.rule)).toContain("name");
    expect(read(workspace, domainRoot, "demo", "plans", "active", planName, "001-甲.md")).toContain(
      "name: '001-甲'",
    );
    expect(read(workspace, domainRoot, "demo", "plans", "active", planName, "002-乙.md")).toContain(
      "related_noted: ['001-甲']",
    );
  });
});

describe("自动修复：非 blocked 的 note 去掉 reason", () => {
  it("删掉 reason 字段并记一条修复", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "in_progress");
    writeNote(
      workspace,
      "001-甲.md",
      "name: '001-甲'\ndescription: '甲'\nstatus: 'pending'\nreason: '多余'\nnext_step: '继续'",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).not.toContain("header");
    expect(result.fixed.some((issue) => issue.message.includes("reason"))).toBe(true);
    expect(
      read(workspace, domainRoot, "demo", "plans", "active", planName, "001-甲.md"),
    ).not.toContain("reason:");
  });

  it("blocked 的 note 保留 reason", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "in_progress");
    writeNote(
      workspace,
      "001-甲.md",
      "name: '001-甲'\ndescription: '甲'\nstatus: 'blocked'\nreason: '等确认'\nnext_step: '等确认'",
    );
    const result = check(workspace);
    expect(result.errors).toHaveLength(0);
    expect(read(workspace, domainRoot, "demo", "plans", "active", planName, "001-甲.md")).toContain(
      "reason: '等确认'",
    );
  });
});

describe("自动修复：多行头字段折成单行", () => {
  it("把多行 description 折成一行并记一条修复", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "in_progress");
    writeFileSync(
      join(planDirOf(workspace), "001-甲.md"),
      frontmatter(
        "name: '001-甲'\ndescription: |\n  第一行\n  第二行\nstatus: 'pending'\nnext_step: '继续'",
      ),
      "utf8",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).not.toContain("header");
    expect(result.fixed.some((issue) => issue.message.includes("description"))).toBe(true);
    const text = read(workspace, domainRoot, "demo", "plans", "active", planName, "001-甲.md");
    expect(text).toContain("description: 第一行 第二行");
  });
});

describe("自动修复：缺 questions 目录", () => {
  it("建目录并生成 index.md", () => {
    const workspace = seedWorkspace({ questions: false });
    writeSpec(workspace, "pending");
    const result = check(workspace);
    expect(result.ok).toBe(true);
    expect(result.fixed.some((issue) => issue.message.includes("questions 目录"))).toBe(true);
    expect(read(workspace, domainRoot, "demo", "questions", "index.md")).toContain("Questions");
  });
});

describe("不在清单里的问题仍然只报", () => {
  it("相关链接目标不存在不被修", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "pending");
    writeFileSync(
      join(workspace, domainRoot, "demo", "adr", "001-示例.md"),
      frontmatter("name: '001-示例'\ndescription: '示例'") +
        "\n## 相关\n\n- [缺失](../questions/999-无.md) — 说明\n",
      "utf8",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).toContain("related");
    expect(result.fixed.map((issue) => issue.rule)).not.toContain("related");
  });

  it("篇幅超限不被修", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "pending");
    writeNote(
      workspace,
      "001-甲.md",
      `name: '001-甲'\ndescription: '${"长".repeat(240)}'\nstatus: 'completed'`,
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).toContain("header");
    expect(result.fixed.map((issue) => issue.rule)).not.toContain("header");
  });

  it("大写 INDEX.md 与真实编号缺口仍然只报", () => {
    const workspace = seedWorkspace();
    writeSpec(workspace, "pending");
    const adrDir = join(workspace, domainRoot, "demo", "adr");
    writeFileSync(
      join(adrDir, "001-甲.md"),
      frontmatter("name: '001-甲'\ndescription: '甲'"),
      "utf8",
    );
    writeFileSync(
      join(adrDir, "003-丙.md"),
      frontmatter("name: '003-丙'\ndescription: '丙'"),
      "utf8",
    );
    writeFileSync(
      join(adrDir, "INDEX.md"),
      frontmatter("name: '索引'\ndescription: '索引'"),
      "utf8",
    );
    const result = check(workspace);
    expect(rulesOf(result.errors)).toContain("index");
    expect(rulesOf(result.errors)).toContain("number");
    expect(result.fixed).toHaveLength(0);
    expect(read(workspace, domainRoot, "demo", "adr", "003-丙.md")).toContain("name: '003-丙'");
  });
});
