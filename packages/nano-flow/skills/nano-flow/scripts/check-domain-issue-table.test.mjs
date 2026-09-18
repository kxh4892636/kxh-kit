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
    (content) => `${content}\n| 99 | [幽灵](99-幽灵.md) | pending | — | /code-delivery |\n`,
    "Issue 表引用了不存在的 99",
  ],
])("拒绝 Issue 表%s", (_name, mutate, expected) => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    fs.writeFileSync(specPath, mutate(fs.readFileSync(specPath, "utf8")), "utf8");
  }, expected);
});

test.each([
  ["行首空格", (row) => ` ${row}`],
  ["列数不足", () => "| 01 | [取消订单](01-取消订单.md) | pending | —"],
  ["编号前缀", (row) => row.replace("| 01 |", "| x01 |")],
  ["非法状态", (row) => row.replace("| pending |", "| PENDING |")],
  ["链接前缀", (row) => row.replace("[取消订单]", "x[取消订单]")],
  ["链接后缀", (row) => row.replace("01-取消订单.md)", "01-取消订单.md)x")],
])("Issue 表解析拒绝%s", (_name, mutate) => {
  assertWorkspaceError((rootDir) => {
    const specPath = path.join(implementingPlanPath(rootDir), "spec.md");
    const content = fs.readFileSync(specPath, "utf8");
    const row = content.match(/^\| 01 .*$/m)[0];
    fs.writeFileSync(specPath, content.replace(row, mutate(row)), "utf8");
  }, "Issue 表缺少 01");
});

test("Issue 表接受最小尾分隔符和两位依赖", () => {
  const rootDir = createValidWorkspace();
  try {
    const planRoot = implementingPlanPath(rootDir);
    const firstIssue = fs.readFileSync(path.join(planRoot, "01-取消订单.md"), "utf8");
    fs.writeFileSync(
      path.join(planRoot, "02-通知客户.md"),
      firstIssue.replace("blocked_by: []", 'blocked_by: ["01"]'),
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
