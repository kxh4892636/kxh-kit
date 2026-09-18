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

test.each(["not-json", "{}", '["1"]'])("拒绝无效 blocked_by %s", (blockedBy) => {
  assertWorkspaceError(
    (rootDir) =>
      replaceFile(
        path.join(implementingPlanPath(rootDir), "01-取消订单.md"),
        "blocked_by: []",
        `blocked_by: ${blockedBy}`,
      ),
    "blocked_by 无效",
  );
});

test.each([
  ["缺少行", (content) => content.replace(/^\| 01 .*$/m, ""), "Notes 索引数量 0 必须为 1–21"],
  [
    "错误链接",
    (content) => content.replace("01-取消订单.md", "01-错误链接.md"),
    "Note 01 链接应指向 01-取消订单.md",
  ],
  [
    "跨目录同名链接",
    (content) => content.replace("(01-取消订单.md)", "(../01-取消订单.md)"),
    "Note 01 链接应指向 01-取消订单.md",
  ],
  [
    "错误状态",
    (content) => content.replace("| pending |", "| completed |"),
    "表格状态 completed 与 frontmatter pending 不一致",
  ],
  [
    "错误依赖",
    (content) => content.replace("| — |", "| 99 |"),
    "Note 01 表格依赖与 blocked_by 不一致",
  ],
  [
    "额外 Note",
    (content) => `${content}\n| 99 | [幽灵](99-幽灵.md) | pending | — | /code-delivery |\n`,
    "Notes 索引引用了不存在的 99",
  ],
])("拒绝 Note 表%s", (_name, mutate, expected) => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    fs.writeFileSync(specPath, mutate(fs.readFileSync(specPath, "utf8")), "utf8");
  }, expected);
});

test.each([
  ["列数不足", () => "| 01 | [取消订单](01-取消订单.md) | pending | —"],
  ["编号前缀", (row) => row.replace("| 01 |", "| x01 |")],
  ["非法依赖", (row) => row.replace("| — |", "| invalid |")],
  ["非法状态", (row) => row.replace("| pending |", "| PENDING |")],
  ["链接前缀", (row) => row.replace("[取消订单]", "x[取消订单]")],
  ["链接后缀", (row) => row.replace("01-取消订单.md)", "01-取消订单.md)x")],
])("Note 表解析拒绝%s", (_name, mutate) => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    const content = fs.readFileSync(specPath, "utf8");
    const row = content.match(/^\| 01 .*$/m)[0];
    fs.writeFileSync(specPath, content.replace(row, mutate(row)), "utf8");
  }, "Notes 索引行格式无效");
});

test("Note 表接受最小尾分隔符和两位依赖", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const firstNote = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    fs.writeFileSync(
      path.join(planRoot, "02-通知客户.md"),
      firstNote.replace("blocked_by: []", 'blocked_by: ["01"]'),
      "utf8",
    );
    const specPath = path.join(planRoot, "spec.md");
    replaceFile(
      specPath,
      "| 01 | [取消订单](01-取消订单.md) | pending | — | /code-delivery |",
      "| 01 | [取消订单](01-取消订单.md) | pending | — |\n| 02 | [通知客户](02-通知客户.md) | pending | 01 |",
    );
    assert.deepEqual(checkDomain(rootDir), []);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test.each([21, 22])("Notes 索引 %s 项的上限，Plan 可保留更多 notes", (count) => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const template = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    const specPath = path.join(planRoot, "spec.md");
    for (let number = 2; number <= 23; number += 1) {
      const id = String(number).padStart(2, "0");
      fs.writeFileSync(path.join(planRoot, `${id}-独立任务.md`), template);
      if (number <= count)
        fs.appendFileSync(
          specPath,
          `| ${id} | [独立任务](${id}-独立任务.md) | pending | — | 继续 |\n`,
        );
    }
    const errors = checkDomain(rootDir);
    if (count === 21) assert.deepEqual(errors, []);
    else assert.ok(errors.some((error) => error.includes("Notes 索引数量 22 必须为 1–21")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("未索引的 Note 仍参与状态汇总与依赖校验", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const first = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    fs.writeFileSync(
      path.join(planRoot, "02-讨论方案.md"),
      first.replace("status: pending", "status: in_progress"),
    );
    assert.ok(checkDomain(rootDir).some((error) => error.includes("聚合状态应为 in_progress")));
    replaceFile(path.join(planRoot, "spec.md"), "status: pending", "status: in_progress");
    assert.deepEqual(checkDomain(rootDir), []);
    replaceFile(path.join(planRoot, "02-讨论方案.md"), "blocked_by: []", '["ignored"]');
    assert.ok(checkDomain(rootDir).some((error) => error.includes("frontmatter 缺少 blocked_by")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("索引拒绝重复 ID，其他章节表格不能充当索引", () => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    fs.appendFileSync(
      specPath,
      "\n## Notes\n\n| 01 | [取消订单](01-取消订单.md) | pending | — | 继续 |\n",
    );
  }, "spec 必须只有一个 Notes 索引章节");
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    fs.appendFileSync(specPath, "| 01 | [取消订单](01-取消订单.md) | pending | — | 继续 |\n");
  }, "Notes 索引重复 ID 01");
  assertWorkspaceError((rootDir) => {
    replaceFile(
      path.join(implementingPlanPath(rootDir), "spec.md"),
      "## Notes",
      "## Notes\n\n## 其他表格",
    );
  }, "Notes 索引数量 0 必须为 1–21");
});
