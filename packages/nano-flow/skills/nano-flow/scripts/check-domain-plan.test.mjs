import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import { checkDomain } from "./check-domain.mjs";
import {
  activePlanPath,
  assertWorkspaceError,
  createValidWorkspace,
  replaceFile,
} from "./testing/check-domain-fixture.mjs";

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

test("接受带前导零的有效 Plan 日期", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.renameSync(
      activePlanPath(rootDir),
      path.join(path.dirname(activePlanPath(rootDir)), "2026-08-02-支持订单取消"),
    );
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("接受四位低年份的有效 Plan 日期", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.renameSync(
      activePlanPath(rootDir),
      path.join(path.dirname(activePlanPath(rootDir)), "0100-08-02-支持订单取消"),
    );
    assert.deepEqual(checkDomain(rootDir), []);
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
    "reference Plan 没有 spec",
    (rootDir) => {
      fs.rmSync(path.join(activePlanPath(rootDir), "spec.md"));
      const referenceRoot = path.join(rootDir, "docs/ordering/plans/reference");
      fs.mkdirSync(referenceRoot);
      fs.renameSync(
        activePlanPath(rootDir),
        path.join(referenceRoot, path.basename(activePlanPath(rootDir))),
      );
    },
    "reference Plan 必须包含 spec.md",
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

test.each(["active", "archived", "reference"])("%s Plan 的纯故事生命周期约束", (lifecycle) => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    fs.rmSync(path.join(planRoot, "spec.md"));
    fs.rmSync(path.join(planRoot, "01-取消订单.md"));
    fs.writeFileSync(path.join(planRoot, "story.md"), "# 用户故事\n\n客户可以取消订单。\n", "utf8");
    if (lifecycle !== "active") {
      const lifecycleRoot = path.join(rootDir, "docs/ordering/plans", lifecycle);
      fs.mkdirSync(lifecycleRoot, { recursive: true });
      fs.renameSync(planRoot, path.join(lifecycleRoot, path.basename(planRoot)));
    }
    const expectedErrors =
      lifecycle === "reference"
        ? ["docs/ordering/plans/reference/2026-08-22-支持订单取消: reference Plan 必须包含 spec.md"]
        : [];
    assert.deepEqual(checkDomain(rootDir), expectedErrors);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("结构文件名校验锚定完整名称", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    fs.renameSync(planRoot, path.join(path.dirname(planRoot), `x${path.basename(planRoot)}`));
    fs.renameSync(
      path.join(rootDir, "docs/ordering/adr/0001-采用事件溯源.md"),
      path.join(rootDir, "docs/ordering/adr/x0001-采用事件溯源.md"),
    );
    const renamedPlan = path.join(path.dirname(planRoot), `x${path.basename(planRoot)}`);
    fs.writeFileSync(path.join(renamedPlan, "x01-额外.md"), "中文。\n", "utf8");
    const errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.endsWith("Plan 目录名必须是 YYYY-MM-DD-中文工作名")));
    assert.ok(
      errors.some((error) =>
        error.endsWith("ADR 文件名必须按域内连续编号，期望 0001-中文决策名.md"),
      ),
    );
    assert.ok(
      errors.some((error) =>
        error.endsWith("Plan 文件名必须是 story.md、spec.md 或 NN-中文标题.md"),
      ),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
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
      "\n| 02 | [通知客户](02-通知客户.md) | pending | 01 | /code-delivery |\n",
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
      "\n| 02 | [通知客户](02-通知客户.md) | in_progress | 01 | /code-delivery |\n",
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

test("接受具备完整证据的 blocked 与 completed Issue", () => {
  for (const [status, specStatus, evidence] of [
    ["blocked", "in_progress", "## 阻塞记录\n\n障碍：外部依赖。\n解除条件：依赖恢复。\n"],
    ["completed", "completed", "## 交付记录\n\n交付物：代码。\n证据：测试通过。\n"],
  ]) {
    const rootDir = createValidWorkspace();
    try {
      const planRoot = activePlanPath(rootDir);
      const issuePath = path.join(planRoot, "01-取消订单.md");
      replaceFile(issuePath, "status: pending", `status: ${status}`);
      fs.appendFileSync(issuePath, `\n${evidence}`);
      const specPath = path.join(planRoot, "spec.md");
      replaceFile(specPath, "status: pending", `status: ${specStatus}`);
      replaceFile(specPath, "| pending |", `| ${status} |`);
      assert.deepEqual(checkDomain(rootDir), []);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

test("接受全部完成的 reference Plan", () => {
  const rootDir = createValidWorkspace();
  try {
    const activePath = activePlanPath(rootDir);
    const referencePath = activePath.replace(
      `${path.sep}active${path.sep}`,
      `${path.sep}reference${path.sep}`,
    );
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.renameSync(activePath, referencePath);
    const issuePath = path.join(referencePath, "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "status: completed");
    fs.appendFileSync(issuePath, "\n## 交付记录\n\n交付物：代码。\n证据：测试通过。\n");
    const specPath = path.join(referencePath, "spec.md");
    replaceFile(specPath, "status: pending", "status: completed");
    replaceFile(specPath, "| pending |", "| completed |");
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each(["x## 交付记录", "## 交付记录 x"])("拒绝非精确 completed 证据标题 %s", (heading) => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = activePlanPath(rootDir);
    const issuePath = path.join(planRoot, "01-取消订单.md");
    replaceFile(issuePath, "status: pending", "status: completed");
    fs.appendFileSync(issuePath, `\n${heading}\n\n交付物：代码。\n证据：测试通过。\n`);
    const specPath = path.join(planRoot, "spec.md");
    replaceFile(specPath, "status: pending", "status: completed");
    replaceFile(specPath, "| pending |", "| completed |");
    assert.ok(
      checkDomain(rootDir).some((error) =>
        error.endsWith("completed Issue 必须记录交付物与验证证据"),
      ),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
