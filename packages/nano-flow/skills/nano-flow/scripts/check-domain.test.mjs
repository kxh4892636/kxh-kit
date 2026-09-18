import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test, vi } from "vitest";

import { checkDomain, runDomainCheck } from "./check-domain.mjs";
import {
  assertWorkspaceError,
  createValidWorkspace,
  writeFile,
} from "./testing/check-domain-fixture.mjs";

test("接受满足领域文档与 Plan 不变量的工作区", () => {
  const rootDir = createValidWorkspace();
  try {
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("CLI wrapper reports success and validation errors", () => {
  const rootDir = createValidWorkspace();
  try {
    const stdout = [];
    const stderr = [];
    assert.equal(
      runDomainCheck({ rootDirectory: rootDir, stdout: (message) => stdout.push(message) }),
      0,
    );
    assert.deepEqual(stdout, ["领域文档校验通过。"]);

    fs.rmSync(path.join(rootDir, "docs"), { recursive: true });
    assert.equal(
      runDomainCheck({ rootDirectory: rootDir, stderr: (message) => stderr.push(message) }),
      1,
    );
    assert.ok(stderr[0].includes("领域文档校验失败"));
    assert.ok(stderr[1].includes("目录不存在"));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([
  [
    "缺少 docs",
    (rootDir) => fs.rmSync(path.join(rootDir, "docs"), { recursive: true }),
    "目录不存在",
  ],
  ["缺少 context map", (rootDir) => fs.rmSync(path.join(rootDir, "CONTEXT-MAP.md")), "文件不存在"],
  [
    "非法 domain-name",
    (rootDir) =>
      fs.renameSync(path.join(rootDir, "docs/ordering"), path.join(rootDir, "docs/Bad_Name")),
    "domain-name 必须是 kebab-case",
  ],
  [
    "缺少 CONTEXT.md",
    (rootDir) => fs.rmSync(path.join(rootDir, "docs/ordering/CONTEXT.md")),
    "业务域缺少 CONTEXT.md",
  ],
  [
    "CONTEXT.md 不含中文",
    (rootDir) => fs.writeFileSync(path.join(rootDir, "docs/ordering/CONTEXT.md"), "English only\n"),
    "正文必须包含中文",
  ],
  [
    "空 CONTEXT.md",
    (rootDir) => fs.writeFileSync(path.join(rootDir, "docs/ordering/CONTEXT.md"), ""),
    "正文必须包含中文",
  ],
  [
    "CONTEXT.md 超过行数",
    (rootDir) =>
      fs.writeFileSync(path.join(rootDir, "docs/ordering/CONTEXT.md"), `${"中文\n".repeat(611)}`),
    "CONTEXT.md 共 611 行，超过 610",
  ],
  [
    "context map 缺少领域",
    (rootDir) => fs.writeFileSync(path.join(rootDir, "CONTEXT-MAP.md"), "# 空索引\n"),
    "缺少业务域 ordering 的索引",
  ],
  [
    "context map 指向不存在领域",
    (rootDir) =>
      fs.appendFileSync(
        path.join(rootDir, "CONTEXT-MAP.md"),
        "- [ghost](./docs/ghost/CONTEXT.md)\n",
      ),
    "索引指向不存在的业务域 ghost",
  ],
  [
    "CONTEXT.md 无法读取",
    (rootDir) => {
      const contextPath = path.join(rootDir, "docs/ordering/CONTEXT.md");
      fs.rmSync(contextPath);
      fs.mkdirSync(contextPath);
    },
    "读取失败",
  ],
  [
    "plans 无法枚举",
    (rootDir) => {
      const plansPath = path.join(rootDir, "docs/ordering/plans");
      fs.rmSync(plansPath, { recursive: true });
      fs.writeFileSync(plansPath, "不是目录");
    },
    "枚举失败",
  ],
])("拒绝%s", (_name, mutate, expected) => {
  assertWorkspaceError(mutate, expected);
});

test("校验 ADR 数量、连续中文文件名、中文正文和行数", () => {
  const rootDir = createValidWorkspace();
  try {
    const adrRoot = path.join(rootDir, "docs/ordering/adr");
    fs.rmSync(adrRoot, { recursive: true });
    fs.mkdirSync(adrRoot);
    for (let index = 1; index <= 90; index += 1) {
      const id = String(index).padStart(4, "0");
      const name = index === 2 ? `${id}-english.md` : `${id}-决策.md`;
      const content = index === 3 ? `${"中文\r\n".repeat(145)}` : "中文决策。\n";
      fs.writeFileSync(path.join(adrRoot, name), content, "utf8");
    }
    const errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("ADR 数量 90 超过 89")));
    assert.ok(errors.some((error) => error.includes("0002-中文决策名.md")));
    assert.ok(errors.some((error) => error.includes("ADR 共 145 行，超过 144")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("接受 CONTEXT 和 ADR 的精确数量与行数上限", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.writeFileSync(path.join(rootDir, "docs/ordering/CONTEXT.md"), "中文\n".repeat(610));
    const adrRoot = path.join(rootDir, "docs/ordering/adr");
    fs.rmSync(adrRoot, { recursive: true });
    fs.mkdirSync(adrRoot);
    for (let index = 1; index <= 89; index += 1) {
      const id = String(index).padStart(4, "0");
      fs.writeFileSync(path.join(adrRoot, `${id}-决策.md`), "中文\n".repeat(144), "utf8");
    }
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("忽略占用结构名称的普通文件与伪装成 Markdown 的目录", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.writeFileSync(path.join(rootDir, "docs/not-a-domain"), "ignored", "utf8");
    fs.writeFileSync(path.join(rootDir, "docs/ordering/plans/not-a-lifecycle"), "ignored", "utf8");
    fs.writeFileSync(
      path.join(rootDir, "docs/ordering/plans/implementing/not-a-plan"),
      "ignored",
      "utf8",
    );
    fs.mkdirSync(path.join(rootDir, "docs/ordering/adr/9999-伪装.md"));
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("domain-name 的 kebab-case 校验锚定整个名称", () => {
  const rootDir = createValidWorkspace();
  try {
    for (const name of ["-leading", "trailing-", "double--dash", "valid-name_"]) {
      writeFile(rootDir, `docs/${name}/CONTEXT.md`, "中文。\n");
    }
    writeFile(rootDir, "docs/valid-name/CONTEXT.md", "中文。\n");
    const errors = checkDomain(rootDir);
    assert.equal(
      errors.filter((error) => error.includes("domain-name 必须是 kebab-case")).length,
      4,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("允许业务域省略 adr 和 plans", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.rmSync(path.join(rootDir, "docs/ordering/adr"), { recursive: true });
    fs.rmSync(path.join(rootDir, "docs/ordering/plans"), { recursive: true });
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("CLI wrapper uses default process and console dependencies", () => {
  const rootDir = createValidWorkspace();
  const originalArgv = process.argv;
  const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  process.argv = [process.execPath, "check-domain.mjs", rootDir];
  try {
    assert.equal(runDomainCheck({}), 0);
    assert.equal(stdout.mock.calls[0][0], "领域文档校验通过。");
    fs.rmSync(path.join(rootDir, "docs"), { recursive: true });
    assert.equal(runDomainCheck({}), 1);
    assert.ok(stderr.mock.calls[0][0].includes("领域文档校验失败"));
  } finally {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([new Error("boom"), "boom"])("CLI wrapper normalizes unexpected %s", (failure) => {
  const stderr = [];
  vi.spyOn(fs, "existsSync").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    assert.equal(
      runDomainCheck({ rootDirectory: ".", stderr: (message) => stderr.push(message) }),
      1,
    );
    assert.ok(stderr[0].includes("boom"));
  } finally {
    vi.restoreAllMocks();
  }
});
