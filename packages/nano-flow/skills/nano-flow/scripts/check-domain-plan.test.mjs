import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";

import { checkDomain } from "./check-domain.mjs";
import {
  implementingPlanPath,
  assertWorkspaceError,
  createValidWorkspace,
  replaceFile,
} from "./testing/check-domain-fixture.mjs";

test("拒绝与 Note 状态不一致的 spec 聚合状态", () => {
  const rootDir = createValidWorkspace();
  try {
    const specPath = path.join(
      rootDir,
      "docs/ordering/plans/implementing/2026-08-22-支持订单取消/spec.md",
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
    const implementingPath = path.join(
      rootDir,
      "docs/ordering/plans/implementing/2026-08-22-支持订单取消",
    );
    const referencePath = implementingPath.replace(
      `${path.sep}implementing${path.sep}`,
      `${path.sep}reference${path.sep}`,
    );
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.renameSync(implementingPath, referencePath);
    const notePath = path.join(referencePath, "01-取消订单.md");
    fs.writeFileSync(
      notePath,
      fs.readFileSync(notePath, "utf8").replace("blocked_by: []", 'blocked_by: ["01"]'),
      "utf8",
    );
    const errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("必须排在 Note 01 之前")));
    assert.ok(errors.some((error) => error.includes("reference Plan 的 Note 必须全部 completed")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("接受带前导零的有效 Plan 日期", () => {
  const rootDir = createValidWorkspace();
  try {
    fs.renameSync(
      implementingPlanPath(rootDir),
      path.join(path.dirname(implementingPlanPath(rootDir)), "2026-08-02-支持订单取消"),
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
      implementingPlanPath(rootDir),
      path.join(path.dirname(implementingPlanPath(rootDir)), "0100-08-02-支持订单取消"),
    );
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([
  [
    "旧 active 生命周期",
    (rootDir) =>
      fs.renameSync(
        path.join(rootDir, "docs/ordering/plans/implementing"),
        path.join(rootDir, "docs/ordering/plans/active"),
      ),
    "Plan 生命周期目录只能是 planning、implementing、reference 或 archived",
  ],
  [
    "未知生命周期",
    (rootDir) =>
      fs.renameSync(
        path.join(rootDir, "docs/ordering/plans/implementing"),
        path.join(rootDir, "docs/ordering/plans/draft"),
      ),
    "Plan 生命周期目录只能是 planning、implementing、reference 或 archived",
  ],
  [
    "非法 Plan 日期",
    (rootDir) =>
      fs.renameSync(
        implementingPlanPath(rootDir),
        path.join(path.dirname(implementingPlanPath(rootDir)), "2026-02-30-无效日期"),
      ),
    "Plan 目录名必须是 YYYY-MM-DD-中文工作名",
  ],
  [
    "非法 Plan 名称",
    (rootDir) =>
      fs.renameSync(
        implementingPlanPath(rootDir),
        path.join(path.dirname(implementingPlanPath(rootDir)), "invalid"),
      ),
    "Plan 目录名必须是 YYYY-MM-DD-中文工作名",
  ],
  [
    "Plan 嵌套目录",
    (rootDir) => fs.mkdirSync(path.join(implementingPlanPath(rootDir), "nested")),
    "Plan 目录内不允许嵌套目录",
  ],
  [
    "Plan 没有 story 或 spec",
    (rootDir) => fs.rmSync(path.join(implementingPlanPath(rootDir), "spec.md")),
    "Plan 必须包含 spec.md",
  ],
  [
    "reference Plan 没有 spec",
    (rootDir) => {
      fs.rmSync(path.join(implementingPlanPath(rootDir), "spec.md"));
      const referenceRoot = path.join(rootDir, "docs/ordering/plans/reference");
      fs.mkdirSync(referenceRoot);
      fs.renameSync(
        implementingPlanPath(rootDir),
        path.join(referenceRoot, path.basename(implementingPlanPath(rootDir))),
      );
    },
    "Plan 必须包含 spec.md",
  ],
  [
    "非法 Plan 文件名",
    (rootDir) =>
      fs.writeFileSync(path.join(implementingPlanPath(rootDir), "notes.md"), "中文备注。\n"),
    "Plan 文件名必须是 story.md、spec.md 或 NN-中文标题.md",
  ],
  [
    "Note 文件名没有中文",
    (rootDir) =>
      fs.renameSync(
        path.join(implementingPlanPath(rootDir), "01-取消订单.md"),
        path.join(implementingPlanPath(rootDir), "01-cancel.md"),
      ),
    "Note 文件名必须包含中文标题",
  ],
])("拒绝%s", (_name, mutate, expected) => {
  assertWorkspaceError(mutate, expected);
});

test("Plan 至少需要一个 Note", () => {
  assertWorkspaceError((rootDir) => {
    fs.rmSync(path.join(implementingPlanPath(rootDir), "01-取消订单.md"));
  }, "至少需要一个 Note");
});

test("删除或合并后允许稳定 Note ID 断号", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    fs.renameSync(path.join(planRoot, "01-取消订单.md"), path.join(planRoot, "03-取消订单.md"));
    replaceFile(
      path.join(planRoot, "spec.md"),
      "| 01 | [取消订单](01-取消订单.md)",
      "| 03 | [取消订单](03-取消订单.md)",
    );
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("拒绝缺少 frontmatter、章节和有效状态的 spec 与 Note", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    fs.writeFileSync(path.join(planRoot, "spec.md"), "# English spec\n", "utf8");
    fs.writeFileSync(path.join(planRoot, "01-取消订单.md"), "# English note\n", "utf8");
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

test("校验 blocked 与 completed Note 的状态证据", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const notePath = path.join(planRoot, "01-取消订单.md");
    replaceFile(notePath, "status: pending", "status: blocked");
    replaceFile(path.join(planRoot, "spec.md"), "| pending |", "| blocked |");
    let errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("blocked Note 必须记录障碍和解除条件")));

    replaceFile(notePath, "status: blocked", "status: completed");
    replaceFile(path.join(planRoot, "spec.md"), "status: pending", "status: completed");
    replaceFile(path.join(planRoot, "spec.md"), "| blocked |", "| completed |");
    errors = checkDomain(rootDir);
    assert.ok(errors.some((error) => error.includes("completed Note 必须记录交付物与验证证据")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each(["planning", "implementing", "archived", "reference"])(
  "%s Plan 的纯故事生命周期约束",
  (lifecycle) => {
    const rootDir = createValidWorkspace();
    try {
      const planRoot = implementingPlanPath(rootDir);
      fs.rmSync(path.join(planRoot, "spec.md"));
      fs.rmSync(path.join(planRoot, "01-取消订单.md"));
      if (lifecycle !== "implementing") {
        const lifecycleRoot = path.join(rootDir, "docs/ordering/plans", lifecycle);
        fs.mkdirSync(lifecycleRoot, { recursive: true });
        fs.renameSync(planRoot, path.join(lifecycleRoot, path.basename(planRoot)));
      }
      const errors = checkDomain(rootDir);
      assert.ok(errors.some((error) => error.endsWith("Plan 必须包含 spec.md")));
      assert.ok(errors.some((error) => error.endsWith("Plan 至少需要一个 Note")));
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  },
);

test.each(["pending", "in_progress", "blocked", "completed"])(
  "planning Plan 允许讨论或计划 Note 为 %s",
  (status) => {
    const rootDir = createValidWorkspace();
    try {
      const planRoot = implementingPlanPath(rootDir);
      const notePath = path.join(planRoot, "01-取消订单.md");
      replaceFile(notePath, "status: pending", `status: ${status}`);
      fs.appendFileSync(
        notePath,
        "\n## 交付记录\n\n交付物与验证证据：订单取消测试通过。\n障碍：等待环境。解除条件：环境恢复。\n",
      );
      const specPath = path.join(planRoot, "spec.md");
      replaceFile(
        specPath,
        "status: pending",
        `status: ${status === "blocked" ? "in_progress" : status}`,
      );
      replaceFile(specPath, "| pending |", `| ${status} |`);
      const planningRoot = path.join(rootDir, "docs/ordering/plans/planning");
      fs.mkdirSync(planningRoot);
      fs.renameSync(planRoot, path.join(planningRoot, path.basename(planRoot)));
      const errors = checkDomain(rootDir);
      assert.deepEqual(errors, []);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  },
);

test("结构文件名校验锚定完整名称", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
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

test("拒绝无根、缺失引用、逆序依赖和依赖环", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const firstNote = path.join(planRoot, "01-取消订单.md");
    const secondNote = path.join(planRoot, "02-通知客户.md");
    replaceFile(firstNote, "blocked_by: []", 'blocked_by: ["02", "99"]');
    fs.writeFileSync(
      secondNote,
      fs.readFileSync(firstNote, "utf8").replace('blocked_by: ["02", "99"]', 'blocked_by: ["01"]'),
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
    assert.ok(errors.some((error) => error.includes("不存在的 Note 99")));
    assert.ok(errors.some((error) => error.includes("依赖 02 必须排在 Note 01 之前")));
    assert.ok(errors.some((error) => error.includes("Note 依赖图存在环")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("要求进行中 Note 的直接依赖已经完成", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const firstNote = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    fs.writeFileSync(
      path.join(planRoot, "02-通知客户.md"),
      firstNote
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
        error.includes("in_progress Note 的直接依赖 01 尚未 completed"),
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
    const notePath = path.join(implementingPlanPath(rootDir), "01-取消订单.md");
    replaceFile(notePath, "status: pending", "# comment\nstatus: pending");
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("分别校验 blocked 解除条件和 completed 证据", () => {
  const blocked = createValidWorkspace();
  try {
    const notePath = path.join(implementingPlanPath(blocked), "01-取消订单.md");
    replaceFile(notePath, "status: pending", "status: blocked");
    fs.appendFileSync(notePath, "\n## 阻塞记录\n\n障碍：外部依赖。\n");
    const specPath = path.join(implementingPlanPath(blocked), "spec.md");
    replaceFile(specPath, "status: pending", "status: in_progress");
    replaceFile(specPath, "| pending |", "| blocked |");
    assert.ok(checkDomain(blocked).some((error) => error.includes("解除条件")));
  } finally {
    fs.rmSync(blocked, { recursive: true, force: true });
  }

  const completed = createValidWorkspace();
  try {
    const notePath = path.join(implementingPlanPath(completed), "01-取消订单.md");
    replaceFile(notePath, "status: pending", "status: completed");
    fs.appendFileSync(notePath, "\n## 交付记录\n\n交付物：代码。\n");
    const specPath = path.join(implementingPlanPath(completed), "spec.md");
    replaceFile(specPath, "status: pending", "status: completed");
    replaceFile(specPath, "| pending |", "| completed |");
    assert.ok(checkDomain(completed).some((error) => error.includes("验证证据")));
  } finally {
    fs.rmSync(completed, { recursive: true, force: true });
  }
});

test("接受具备完整证据的 blocked 与 completed Note", () => {
  for (const [status, specStatus, evidence] of [
    ["blocked", "in_progress", "## 阻塞记录\n\n障碍：外部依赖。\n解除条件：依赖恢复。\n"],
    ["completed", "completed", "## 交付记录\n\n交付物：代码。\n证据：测试通过。\n"],
  ]) {
    const rootDir = createValidWorkspace();
    try {
      const planRoot = implementingPlanPath(rootDir);
      const notePath = path.join(planRoot, "01-取消订单.md");
      replaceFile(notePath, "status: pending", `status: ${status}`);
      fs.appendFileSync(notePath, `\n${evidence}`);
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
    const implementingPath = implementingPlanPath(rootDir);
    const referencePath = implementingPath.replace(
      `${path.sep}implementing${path.sep}`,
      `${path.sep}reference${path.sep}`,
    );
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.renameSync(implementingPath, referencePath);
    const notePath = path.join(referencePath, "01-取消订单.md");
    replaceFile(notePath, "status: pending", "status: completed");
    fs.appendFileSync(notePath, "\n## 交付记录\n\n交付物：代码。\n证据：测试通过。\n");
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
    const planRoot = implementingPlanPath(rootDir);
    const notePath = path.join(planRoot, "01-取消订单.md");
    replaceFile(notePath, "status: pending", "status: completed");
    fs.appendFileSync(notePath, `\n${heading}\n\n交付物：代码。\n证据：测试通过。\n`);
    const specPath = path.join(planRoot, "spec.md");
    replaceFile(specPath, "status: pending", "status: completed");
    replaceFile(specPath, "| pending |", "| completed |");
    assert.ok(
      checkDomain(rootDir).some((error) =>
        error.endsWith("completed Note 必须记录交付物与验证证据"),
      ),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("Plan 必须包含 story，且三类文档保留恢复章节", () => {
  assertWorkspaceError(
    (rootDir) => fs.rmSync(path.join(implementingPlanPath(rootDir), "story.md")),
    "Plan 必须包含 story.md",
  );
  for (const [file, heading] of [
    ["story.md", "约束与澄清"],
    ["spec.md", "恢复入口"],
    ["01-取消订单.md", "执行检查点"],
  ]) {
    assertWorkspaceError(
      (rootDir) =>
        replaceFile(path.join(implementingPlanPath(rootDir), file), `## ${heading}`, "## 已删除"),
      `缺少「## ${heading}」章节`,
    );
  }
});

test("拒绝重复 Note ID", () => {
  assertWorkspaceError((rootDir) => {
    const planRoot = implementingPlanPath(rootDir);
    fs.copyFileSync(path.join(planRoot, "01-取消订单.md"), path.join(planRoot, "01-重复任务.md"));
  }, "Note ID 重复 01");
});
