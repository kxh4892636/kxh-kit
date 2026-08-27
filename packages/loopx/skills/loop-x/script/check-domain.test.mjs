import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test, vi } from "vitest";

import { checkDomain as checkDomainImplementation, runDomainCheck } from "./check-domain.mjs";
import { verifyContract } from "./testing/script-contracts.mjs";

const checkDomain = (rootDirectory) => {
  const result = checkDomainImplementation(rootDirectory);
  verifyContract("checkDomain", result, rootDirectory);
  return result;
};

const writeFile = (rootDir, relativePath, content) => {
  const targetPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
};

const createValidWorkspace = () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "domain-check-"));
  writeFile(
    rootDir,
    "CONTEXT-MAP.md",
    "# Context Map\n\n## Contexts\n\n- [ordering](./docs/ordering/CONTEXT.md) - 订单域。\n",
  );
  writeFile(
    rootDir,
    "docs/ordering/CONTEXT.md",
    "# Ordering\n\n## Language\n\n**订单**：客户请求。\n",
  );
  writeFile(
    rootDir,
    "docs/ordering/adr/0001-采用事件溯源.md",
    "# 采用事件溯源\n\n订单需要保留完整历史，因此采用事件溯源。\n",
  );
  writeFile(
    rootDir,
    "docs/ordering/plans/active/2026-08-22-支持订单取消/spec.md",
    `---
status: pending
---

# 支持订单取消

## 问题

客户需要取消订单。

## 方案

增加取消能力。

## 已排除的备选

- 直接删除：无法保留历史。

## 实施决策

使用订单状态转换。

## 工作环境

本地工作区。

## 范围

未发货订单。

## 非范围

已发货订单。

## 待定

无。

## 上下文

订单术语表。

## Issue

| # | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
| 01 | [取消订单](01-取消订单.md) | pending | — | /implement |
`,
  );
  writeFile(
    rootDir,
    "docs/ordering/plans/active/2026-08-22-支持订单取消/01-取消订单.md",
    `---
status: pending
blocked_by: []
---

# 取消订单

## 交付

客户可以取消订单。

## 范围

支持未发货订单。

## 直接依赖

无。

## 验收

- [ ] 取消结果可判定。

## 上下文

- 订单术语表。

## 下一步

/implement
`,
  );
  return rootDir;
};

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

test("拒绝与 Issue 状态不一致的 spec 聚合状态", () => {
  const rootDir = createValidWorkspace();
  try {
    const specPath = path.join(
      rootDir,
      "docs/ordering/plans/active/2026-08-22-支持订单取消/spec.md",
    );
    fs.writeFileSync(
      specPath,
      fs.readFileSync(specPath, "utf8").replace("status: pending", "status: completed"),
      "utf8",
    );
    assert.ok(
      checkDomain(rootDir).some((error) =>
        error.includes("聚合状态应为 pending，实际为 completed"),
      ),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("拒绝无效的依赖顺序和 reference 生命周期", () => {
  const rootDir = createValidWorkspace();
  try {
    const activePath = path.join(rootDir, "docs/ordering/plans/active/2026-08-22-支持订单取消");
    const referencePath = activePath.replace(
      `${path.sep}active${path.sep}`,
      `${path.sep}reference${path.sep}`,
    );
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.renameSync(activePath, referencePath);
    const issuePath = path.join(referencePath, "01-取消订单.md");
    fs.writeFileSync(
      issuePath,
      fs.readFileSync(issuePath, "utf8").replace("blocked_by: []", 'blocked_by: ["01"]'),
      "utf8",
    );
    const errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("必须排在 Issue 01 之前")));
    assert.ok(errors.some((error) => error.includes("reference Plan 的 Issue 必须全部 completed")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

const activePlanPath = (rootDir) =>
  path.join(rootDir, "docs/ordering/plans/active/2026-08-22-支持订单取消");

const replaceFile = (targetPath, searchValue, replacement) => {
  fs.writeFileSync(
    targetPath,
    fs.readFileSync(targetPath, "utf8").replace(searchValue, replacement),
    "utf8",
  );
};

const assertWorkspaceError = (mutate, expected) => {
  const rootDir = createValidWorkspace();
  try {
    mutate(rootDir);
    const errors = checkDomain(rootDir);
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `缺少错误 ${expected}\n${errors.join("\n")}`,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
};

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
      path.join(rootDir, "docs/ordering/plans/active/not-a-plan"),
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

test.each([
  [
    "未知生命周期",
    (rootDir) =>
      fs.renameSync(
        path.join(rootDir, "docs/ordering/plans/active"),
        path.join(rootDir, "docs/ordering/plans/draft"),
      ),
    "Plan 生命周期目录只能是 active、reference 或 archived",
  ],
  [
    "非法 Plan 日期",
    (rootDir) =>
      fs.renameSync(
        activePlanPath(rootDir),
        path.join(path.dirname(activePlanPath(rootDir)), "2026-02-30-无效日期"),
      ),
    "Plan 目录名必须是 YYYY-MM-DD-中文工作名",
  ],
  [
    "非法 Plan 名称",
    (rootDir) =>
      fs.renameSync(
        activePlanPath(rootDir),
        path.join(path.dirname(activePlanPath(rootDir)), "invalid"),
      ),
    "Plan 目录名必须是 YYYY-MM-DD-中文工作名",
  ],
  [
    "Plan 嵌套目录",
    (rootDir) => fs.mkdirSync(path.join(activePlanPath(rootDir), "nested")),
    "Plan 目录内不允许嵌套目录",
  ],
  [
    "Plan 没有 story 或 spec",
    (rootDir) => fs.rmSync(path.join(activePlanPath(rootDir), "spec.md")),
    "Plan 至少需要 story.md 或 spec.md",
  ],
  [
    "非 active Plan 没有 spec",
    (rootDir) => {
      fs.rmSync(path.join(activePlanPath(rootDir), "spec.md"));
      const referenceRoot = path.join(rootDir, "docs/ordering/plans/reference");
      fs.mkdirSync(referenceRoot);
      fs.renameSync(
        activePlanPath(rootDir),
        path.join(referenceRoot, path.basename(activePlanPath(rootDir))),
      );
    },
    "非 active Plan 必须包含 spec.md",
  ],
  [
    "非法 Plan 文件名",
    (rootDir) => fs.writeFileSync(path.join(activePlanPath(rootDir), "notes.md"), "中文备注。\n"),
    "Plan 文件名必须是 story.md、spec.md 或 NN-中文标题.md",
  ],
  [
    "Issue 文件名没有中文",
    (rootDir) =>
      fs.renameSync(
        path.join(activePlanPath(rootDir), "01-取消订单.md"),
        path.join(activePlanPath(rootDir), "01-cancel.md"),
      ),
    "Issue 文件名必须包含中文标题",
  ],
])("拒绝%s", (_name, mutate, expected) => {
  assertWorkspaceError(mutate, expected);
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

test("要求 spec 至少声明一个连续编号的 Issue", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    fs.rmSync(path.join(planRoot, "01-取消订单.md"));
    assert.ok(checkDomain(rootDir).some((error) => error.includes("至少需要一个 Issue")));

    fs.writeFileSync(path.join(planRoot, "03-取消订单.md"), "中文。\n", "utf8");
    assert.ok(checkDomain(rootDir).some((error) => error.includes("Issue 编号必须连续，期望 01")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("拒绝缺少 frontmatter、章节和有效状态的 spec 与 Issue", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    fs.writeFileSync(path.join(planRoot, "spec.md"), "# English spec\n", "utf8");
    fs.writeFileSync(path.join(planRoot, "01-取消订单.md"), "# English issue\n", "utf8");
    const errors = checkDomain(rootDir);
    assert.ok(errors.filter((error) => error.includes("缺少 YAML frontmatter")).length >= 2);
    assert.ok(
      errors.some((error) =>
        error.includes("status 必须是 pending | in_progress | blocked | completed"),
      ),
    );
    assert.ok(errors.some((error) => error.includes("frontmatter 缺少 blocked_by")));
    assert.ok(errors.some((error) => error.includes("缺少「## 交付」章节")));
    assert.ok(errors.some((error) => error.includes("缺少「## 问题」章节")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each(["not-json", "{}", '["1"]'])("拒绝无效 blocked_by %s", (blockedBy) => {
  assertWorkspaceError(
    (rootDir) =>
      replaceFile(
        path.join(activePlanPath(rootDir), "01-取消订单.md"),
        "blocked_by: []",
        `blocked_by: ${blockedBy}`,
      ),
    "blocked_by 无效",
  );
});

test("校验 blocked 与 completed Issue 的状态证据", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    const issuePath = path.join(planRoot, "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "status: blocked");
    replaceFile(path.join(planRoot, "spec.md"), "| pending |", "| blocked |");
    let errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("blocked Issue 必须记录障碍和解除条件")));

    replaceFile(issuePath, "status: blocked", "status: completed");
    replaceFile(path.join(planRoot, "spec.md"), "status: pending", "status: completed");
    replaceFile(path.join(planRoot, "spec.md"), "| blocked |", "| completed |");
    errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("completed Issue 必须记录交付物与验证证据")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([
  ["缺少行", (content) => content.replace(/^\| 01 .*$/m, ""), "Issue 表缺少 01"],
  [
    "错误链接",
    (content) => content.replace("01-取消订单.md", "01-错误链接.md"),
    "Issue 01 链接应指向 01-取消订单.md",
  ],
  [
    "错误状态",
    (content) => content.replace("| pending |", "| completed |"),
    "表格状态 completed 与 frontmatter pending 不一致",
  ],
  [
    "错误依赖",
    (content) => content.replace("| — |", "| 99 |"),
    "Issue 01 表格依赖与 blocked_by 不一致",
  ],
  [
    "额外 Issue",
    (content) => `${content}\n| 99 | [幽灵](99-幽灵.md) | pending | — | /implement |\n`,
    "Issue 表引用了不存在的 99",
  ],
])("拒绝 Issue 表%s", (_name, mutate, expected) => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(activePlanPath(rootDir), "spec.md");
    fs.writeFileSync(specPath, mutate(fs.readFileSync(specPath, "utf8")), "utf8");
  }, expected);
});

test("拒绝断号、无根、缺失引用、逆序依赖和依赖环", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    const firstIssue = path.join(planRoot, "01-取消订单.md");
    const secondIssue = path.join(planRoot, "02-通知客户.md");
    replaceFile(firstIssue, "blocked_by: []", 'blocked_by: ["02", "99"]');
    fs.writeFileSync(
      secondIssue,
      fs.readFileSync(firstIssue, "utf8").replace('blocked_by: ["02", "99"]', 'blocked_by: ["01"]'),
      "utf8",
    );
    const specPath = path.join(planRoot, "spec.md");
    fs.appendFileSync(
      specPath,
      "\n| 02 | [通知客户](02-通知客户.md) | pending | 01 | /implement |\n",
    );
    replaceFile(
      specPath,
      "| 01 | [取消订单](01-取消订单.md) | pending | — |",
      "| 01 | [取消订单](01-取消订单.md) | pending | 02, 99 |",
    );
    const errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("至少需要一个根节点")));
    assert.ok(errors.some((error) => error.includes("不存在的 Issue 99")));
    assert.ok(errors.some((error) => error.includes("依赖 02 必须排在 Issue 01 之前")));
    assert.ok(errors.some((error) => error.includes("Issue 依赖图存在环")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("要求进行中 Issue 的直接依赖已经完成", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    const firstIssue = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    fs.writeFileSync(
      path.join(planRoot, "02-通知客户.md"),
      firstIssue
        .replace("status: pending", "status: in_progress")
        .replace("blocked_by: []", 'blocked_by: ["01"]'),
      "utf8",
    );
    const specPath = path.join(planRoot, "spec.md");
    replaceFile(specPath, "status: pending", "status: in_progress");
    fs.appendFileSync(
      specPath,
      "\n| 02 | [通知客户](02-通知客户.md) | in_progress | 01 | /implement |\n",
    );
    assert.ok(
      checkDomain(rootDir).some((error) =>
        error.includes("in_progress Issue 的直接依赖 01 尚未 completed"),
      ),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("覆盖无尾随换行和 frontmatter 非字段行", () => {
  const rootDir = createValidWorkspace();
  try {
    const contextPath = path.join(rootDir, "docs/ordering/CONTEXT.md");
    fs.writeFileSync(contextPath, fs.readFileSync(contextPath, "utf8").trimEnd(), "utf8");
    const issuePath = path.join(activePlanPath(rootDir), "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "# comment\nstatus: pending");
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("分别校验 blocked 解除条件和 completed 证据", () => {
  const blocked = createValidWorkspace();
  try {
    const issuePath = path.join(activePlanPath(blocked), "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "status: blocked");
    fs.appendFileSync(issuePath, "\n## 阻塞记录\n\n障碍：外部依赖。\n");
    const specPath = path.join(activePlanPath(blocked), "spec.md");
    replaceFile(specPath, "status: pending", "status: in_progress");
    replaceFile(specPath, "| pending |", "| blocked |");
    assert.ok(checkDomain(blocked).some((error) => error.includes("解除条件")));
  } finally {
    fs.rmSync(blocked, { recursive: true, force: true });
  }

  const completed = createValidWorkspace();
  try {
    const issuePath = path.join(activePlanPath(completed), "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "status: completed");
    fs.appendFileSync(issuePath, "\n## 交付记录\n\n交付物：代码。\n");
    const specPath = path.join(activePlanPath(completed), "spec.md");
    replaceFile(specPath, "status: pending", "status: completed");
    replaceFile(specPath, "| pending |", "| completed |");
    assert.ok(checkDomain(completed).some((error) => error.includes("验证证据")));
  } finally {
    fs.rmSync(completed, { recursive: true, force: true });
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
