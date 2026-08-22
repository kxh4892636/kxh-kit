import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { checkDomain } from "./check-domain.mjs";

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

test("拒绝与 Issue 状态不一致的 spec 聚合状态", () => {
	const rootDir = createValidWorkspace();
	try {
		const specPath = path.join(
			rootDir,
			"docs/ordering/plans/active/2026-08-22-支持订单取消/spec.md",
		);
		fs.writeFileSync(
			specPath,
			fs.readFileSync(specPath, "utf8").replace(
				"status: pending",
				"status: completed",
			),
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
		const activePath = path.join(
			rootDir,
			"docs/ordering/plans/active/2026-08-22-支持订单取消",
		);
		const referencePath = activePath.replace(
			`${path.sep}active${path.sep}`,
			`${path.sep}reference${path.sep}`,
		);
		fs.mkdirSync(path.dirname(referencePath), { recursive: true });
		fs.renameSync(activePath, referencePath);
		const issuePath = path.join(referencePath, "01-取消订单.md");
		fs.writeFileSync(
			issuePath,
			fs.readFileSync(issuePath, "utf8").replace(
				"blocked_by: []",
				'blocked_by: ["01"]',
			),
			"utf8",
		);
		const errors = checkDomain(rootDir);
		assert.ok(errors.some((error) => error.includes("必须排在 Issue 01 之前")));
		assert.ok(
			errors.some((error) =>
				error.includes("reference Plan 的 Issue 必须全部 completed"),
			),
		);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
