import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { checkDomain } from "../check-domain.mjs";

// check-domain 的三份 spec 共用同一套最小合法工作区夹具。
// 夹具放在非 *.test.mjs 模块里: spec 之间互相 import 会把对方的用例重复注册。
// 放在 scripts/testing/ 下: 打包 skill 时该目录被跳过(check-domain.mjs 的产物清单不含测试夹具)。
export const writeFile = (rootDir, relativePath, content) => {
  const targetPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
};

const writeContextMap = (rootDir) => {
  writeFile(
    rootDir,
    "CONTEXT-MAP.md",
    "# Context Map\n\n## Contexts\n\n- [ordering](./docs/ordering/CONTEXT.md) - 订单域。\n",
  );
};

const writeContext = (rootDir) => {
  writeFile(
    rootDir,
    "docs/ordering/CONTEXT.md",
    "# Ordering\n\n## Language\n\n**订单**：客户请求。\n",
  );
};

const writeAdr = (rootDir) => {
  writeFile(
    rootDir,
    "docs/ordering/adr/0001-采用事件溯源.md",
    "# 采用事件溯源\n\n订单需要保留完整历史，因此采用事件溯源。\n",
  );
};

const writeActivePlanSpec = (rootDir) => {
  writeFile(
    rootDir,
    "docs/ordering/plans/implementing/2026-08-22-支持订单取消/spec.md",
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
| 01 | [取消订单](01-取消订单.md) | pending | — | /code-delivery |
`,
  );
};

const writeActivePlanIssue = (rootDir) => {
  writeFile(
    rootDir,
    "docs/ordering/plans/implementing/2026-08-22-支持订单取消/01-取消订单.md",
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

/code-delivery
`,
  );
};

export const createValidWorkspace = () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "domain-check-"));
  writeContextMap(rootDir);
  writeContext(rootDir);
  writeAdr(rootDir);
  writeActivePlanSpec(rootDir);
  writeActivePlanIssue(rootDir);
  return rootDir;
};

export const implementingPlanPath = (rootDir) =>
  path.join(rootDir, "docs/ordering/plans/implementing/2026-08-22-支持订单取消");

export const replaceFile = (targetPath, searchValue, replacement) => {
  fs.writeFileSync(
    targetPath,
    fs.readFileSync(targetPath, "utf8").replace(searchValue, replacement),
    "utf8",
  );
};

export const assertWorkspaceError = (mutate, expected) => {
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
