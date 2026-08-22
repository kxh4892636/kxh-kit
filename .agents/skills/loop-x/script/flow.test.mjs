import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { executeFlow } from "./flow.mjs";

const execFileAsync = promisify(execFile);
const FLOW_PATH = fileURLToPath(new URL("./flow.mjs", import.meta.url));
const PLAN_PATH = "docs/orders/plans/active/2026-08-22-订单流转";

const issueDocument = (id, dependencies = []) => `---
status: pending
blocked_by: ${JSON.stringify(dependencies)}
---

# Issue ${id} 订单能力

## 交付

交付订单能力。

## 范围

仅覆盖本 Issue。

## 直接依赖

${dependencies.length === 0 ? "无。" : dependencies.map((item) => `- ${item}: 消费订单契约。`).join("\n")}

## 验收

- [ ] 结果可判定。

## 上下文

- 订单计划。

## 下一步

/implement
`;

const specDocument = (issueDefinitions) => `---
status: pending
---

# 订单流转

## 问题

需要订单能力。

## 方案

按 Issue 交付。

## 已排除的备选

- 一次完成：范围过大。

## 实施决策

使用独立 Issue。

## 工作环境

本地工作区。

## 范围

订单能力。

## 非范围

其他业务域。

## 待定

无。

## 上下文

订单术语表。

## Issue

| # | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
${issueDefinitions
	.map(
		(issue) =>
			`| ${issue.id} | [Issue ${issue.id}](${issue.id}-订单能力.md) | pending | ${issue.dependencies.length === 0 ? "—" : issue.dependencies.join(", ")} | /implement |`,
	)
	.join("\n")}
`;

const createWorkspace = async (issueDefinitions) => {
	const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "loop-flow-"));
	const planPath = path.join(workspace, PLAN_PATH);
	await fs.mkdir(planPath, { recursive: true });
	await fs.writeFile(path.join(planPath, "spec.md"), specDocument(issueDefinitions));
	for (const issue of issueDefinitions) {
		await fs.writeFile(
			path.join(planPath, `${issue.id}-订单能力.md`),
			issueDocument(issue.id, issue.dependencies),
		);
	}
	return workspace;
};

const command = (workspace, commandName, options) =>
	executeFlow({ command: commandName, options, workspace });

const readyPlan = async (workspace, session = "plan-session") => {
	await command(workspace, "init", {
		plan: PLAN_PATH,
		route: "issues",
		session,
	});
	await command(workspace, "record-plan", {
		evidence: ["spec.md"],
		plan: PLAN_PATH,
		result: "completed",
		session,
		skill: "/to-issues",
	});
	return command(workspace, "record-plan", {
		evidence: ["用户确认基线"],
		plan: PLAN_PATH,
		result: "ready",
		session,
		skill: "/dev-gate",
	});
};

const recordPlan = (workspace, session, step, result, extra = {}) =>
	command(workspace, "record-plan", {
		...(step === "commit" ? { action: "commit" } : { skill: `/${step}` }),
		evidence: [`${step}-${result}`],
		plan: PLAN_PATH,
		result,
		session,
		...extra,
	});

const recordIssue = (workspace, issue, session, skill, result, extra = {}) =>
	command(workspace, "record-issue", {
		...(skill === "commit" ? { action: "commit" } : { skill: `/${skill}` }),
		evidence: [`${skill}-${result}`],
		issue,
		plan: PLAN_PATH,
		result,
		session,
		...extra,
	});

const addDeliveryEvidence = async (workspace, issueId) => {
	const issuePath = path.join(workspace, PLAN_PATH, `${issueId}-订单能力.md`);
	const content = await fs.readFile(issuePath, "utf8");
	await fs.writeFile(
		issuePath,
		`${content.trimEnd()}\n\n## 交付记录\n\n- 交付物: 订单能力。\n- 验证证据: 测试通过。\n`,
	);
};

test("按路由顺序记录 Plan skill", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await command(workspace, "init", {
			plan: PLAN_PATH,
			route: "story",
			session: "s1",
		});
		await assert.rejects(
			command(workspace, "record-plan", {
				evidence: ["spec.md"],
				plan: PLAN_PATH,
				result: "completed",
				session: "s1",
				skill: "/to-issues",
			}),
			/期望 \/to-story/,
		);
		const result = await command(workspace, "record-plan", {
			evidence: ["story.md"],
			plan: PLAN_PATH,
			result: "completed",
			session: "s1",
			skill: "/to-story",
		});
		assert.equal(result.next_skill, "/to-issues");
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("主路径在 dev-gate 后继续完整交付序列", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await command(workspace, "init", {
			plan: PLAN_PATH,
			route: "main",
			session: "main-session",
		});
		await recordPlan(workspace, "main-session", "grill-with-docs", "completed");
		const gated = await recordPlan(workspace, "main-session", "dev-gate", "ready");
		assert.equal(gated.next_skill, "/implement");
		assert.equal(gated.status, "active");
		await recordPlan(workspace, "main-session", "implement", "started");
		await recordPlan(workspace, "main-session", "tdd", "skipped", {
			reason: "仅文档变更",
		});
		await recordPlan(workspace, "main-session", "verifying", "passed");
		const reviewed = await recordPlan(
			workspace,
			"main-session",
			"code-review",
			"reviewed",
		);
		assert.equal(reviewed.next_action, "commit");
		const completed = await recordPlan(
			workspace,
			"main-session",
			"commit",
			"committed",
		);
		assert.equal(completed.status, "completed");
		assert.equal(completed.next_skill, null);
		assert.equal(completed.next_action, null);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("同一 Plan 的无依赖 Issue 可以由不同会话并行领取", async () => {
	const workspace = await createWorkspace([
		{ dependencies: [], id: "01" },
		{ dependencies: [], id: "02" },
	]);
	try {
		await readyPlan(workspace);
		const [first, second] = await Promise.all([
			command(workspace, "claim-issue", {
				issue: "01",
				plan: PLAN_PATH,
				session: "issue-a",
			}),
			command(workspace, "claim-issue", {
				issue: "02",
				plan: PLAN_PATH,
				session: "issue-b",
			}),
		]);
		assert.equal(first.next_skill, "/implement");
		assert.equal(second.next_skill, "/implement");
		const spec = await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8");
		assert.match(spec, /\| 01 \|.*\| in_progress \|/);
		assert.match(spec, /\| 02 \|.*\| in_progress \|/);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("同一 Issue 的并发领取只有一个会话成功", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await readyPlan(workspace);
		const attempts = await Promise.allSettled([
			command(workspace, "claim-issue", {
				issue: "01",
				plan: PLAN_PATH,
				session: "issue-a",
			}),
			command(workspace, "claim-issue", {
				issue: "01",
				plan: PLAN_PATH,
				session: "issue-b",
			}),
		]);
		assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
		assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("Issue 必须等待直接依赖完成", async () => {
	const workspace = await createWorkspace([
		{ dependencies: [], id: "01" },
		{ dependencies: ["01"], id: "02" },
	]);
	try {
		await readyPlan(workspace);
		await assert.rejects(
			command(workspace, "claim-issue", {
				issue: "02",
				plan: PLAN_PATH,
				session: "issue-b",
			}),
			/直接依赖 01 尚未 completed/,
		);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("Issue 按完整 skill 序列完成并同步 Plan 状态", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await readyPlan(workspace);
		await command(workspace, "claim-issue", {
			issue: "01",
			plan: PLAN_PATH,
			session: "issue-a",
		});
		await assert.rejects(
			recordIssue(workspace, "01", "issue-a", "verifying", "passed"),
			/期望 \/implement/,
		);
		await recordIssue(workspace, "01", "issue-a", "implement", "started");
		await recordIssue(workspace, "01", "issue-a", "tdd", "skipped", {
			reason: "仅文档变更",
		});
		await recordIssue(workspace, "01", "issue-a", "verifying", "passed");
		const reviewed = await recordIssue(
			workspace,
			"01",
			"issue-a",
			"code-review",
			"reviewed",
		);
		assert.equal(reviewed.next_skill, null);
		assert.equal(reviewed.next_action, "commit");
		await assert.rejects(
			recordIssue(workspace, "01", "issue-a", "commit", "committed"),
			/交付物与验证证据/,
		);
		await addDeliveryEvidence(workspace, "01");
		const result = await recordIssue(
			workspace,
			"01",
			"issue-a",
			"commit",
			"committed",
		);
		assert.equal(result.status, "completed");
		const state = JSON.parse(await fs.readFile(path.join(workspace, ".loop"), "utf8"));
		assert.equal(state.plans[PLAN_PATH].issues["01"].status, "completed");
		const spec = await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8");
		assert.match(spec, /^status: completed$/m);
		assert.match(spec, /\| 01 \|.*\| completed \|/);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("sync-plan 从 Issue 文档恢复完成状态", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await readyPlan(workspace);
		await command(workspace, "claim-issue", {
			issue: "01",
			plan: PLAN_PATH,
			session: "issue-a",
		});
		const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
		const issue = await fs.readFile(issuePath, "utf8");
		await fs.writeFile(issuePath, issue.replace("status: in_progress", "status: completed"));

		await command(workspace, "sync-plan", { plan: PLAN_PATH });

		const state = JSON.parse(await fs.readFile(path.join(workspace, ".loop"), "utf8"));
		assert.equal(state.plans[PLAN_PATH].issues["01"].status, "completed");
		const spec = await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8");
		assert.match(spec, /^status: completed$/m);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("阻塞 Issue 释放租约并可由新会话恢复", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		await readyPlan(workspace);
		await command(workspace, "claim-issue", {
			issue: "01",
			plan: PLAN_PATH,
			session: "issue-a",
		});
		await command(workspace, "block-issue", {
			issue: "01",
			plan: PLAN_PATH,
			reason: "缺少测试环境",
			"release-condition": "测试环境可用",
			session: "issue-a",
		});
		const resumed = await command(workspace, "resume-issue", {
			issue: "01",
			plan: PLAN_PATH,
			session: "issue-b",
		});
		assert.equal(resumed.next_skill, "/implement");
		const issue = await fs.readFile(
			path.join(workspace, PLAN_PATH, "01-订单能力.md"),
			"utf8",
		);
		assert.match(issue, /^status: in_progress$/m);
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});

test("CLI 可脱离工作区 package 配置直接运行", async () => {
	const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
	try {
		const { stdout } = await execFileAsync(process.execPath, [
			FLOW_PATH,
			"init",
			"--plan",
			PLAN_PATH,
			"--route",
			"issues",
			"--session",
			"cli-session",
			"--workspace",
			workspace,
		]);
		const result = JSON.parse(stdout);
		assert.equal(result.next_skill, "/to-issues");
		assert.equal(result.success, true);
		await fs.access(path.join(workspace, ".loop"));
	} finally {
		await fs.rm(workspace, { force: true, recursive: true });
	}
});
