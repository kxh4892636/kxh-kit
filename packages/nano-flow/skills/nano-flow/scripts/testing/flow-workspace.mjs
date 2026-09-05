import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { executeFlow } from "../flow.mjs";

export const PLAN_PATH = "docs/orders/plans/active/2026-08-22-订单流转";
export const TEST_NOW = new Date(2026, 7, 27, 12);

const workspaces = new Set();

const issueDocument = (issue) => `---
status: ${issue.status ?? "pending"}
blocked_by: ${JSON.stringify(issue.dependencies)}
---

# Issue ${issue.id} 订单能力

中文交付内容。
`;

export const specDocument = (issues, status = "pending") => `---
status: ${status}
---

# 订单流转

## Issue

| # | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
${issues
  .map(
    (issue) =>
      `| ${issue.id} | [Issue ${issue.id}](${issue.id}-订单能力.md) | ${issue.status ?? "pending"} | ${issue.dependencies.length === 0 ? "—" : issue.dependencies.join(", ")} | /code-delivery |`,
  )
  .join("\n")}
`;

export const createWorkspace = async (issues = [{ dependencies: [], id: "01" }]) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "loop-flow-"));
  workspaces.add(workspace);
  const planPath = path.join(workspace, PLAN_PATH);
  await fs.mkdir(planPath, { recursive: true });
  await fs.writeFile(path.join(planPath, "spec.md"), specDocument(issues));
  await Promise.all(
    issues.map((issue) =>
      fs.writeFile(path.join(planPath, `${issue.id}-订单能力.md`), issueDocument(issue)),
    ),
  );
  return workspace;
};

export const cleanupWorkspaces = async () => {
  await Promise.all(
    [...workspaces].map((workspace) => fs.rm(workspace, { force: true, recursive: true })),
  );
  workspaces.clear();
};

export const statePath = (workspace) =>
  path.join(workspace, ".flow", "state", "2026-08-27-state.json");

export const command = async (
  workspace,
  commandName,
  options = {},
  now = () => new Date(TEST_NOW),
) => executeFlow({ command: commandName, now, options, workspace });

export const recordPlan = (workspace, session, step, result, extra = {}) =>
  command(workspace, "record-plan", {
    ...(step === "commit" ? { action: "commit" } : { skill: `/${step}` }),
    evidence: [`${step}-${result}`],
    plan: PLAN_PATH,
    result,
    session,
    ...extra,
  });

export const recordIssue = (workspace, issue, session, step, result) =>
  command(workspace, "record-issue", {
    ...(step === "commit" ? { action: "commit" } : { skill: `/${step}` }),
    evidence: [`${step}-${result}`],
    issue,
    plan: PLAN_PATH,
    result,
    session,
  });

export const readyIssuePlan = async (workspace, session = "plan-session") => {
  await command(workspace, "enter-plan", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session,
    skill: "/nano-flow",
  });
  await recordPlan(workspace, session, "to-story", "completed");
  await recordPlan(workspace, session, "quest-with-domain", "completed");
  return recordPlan(workspace, session, "to-issues", "completed");
};

export const addDeliveryEvidence = async (workspace, issueId) => {
  const issuePath = path.join(workspace, PLAN_PATH, `${issueId}-订单能力.md`);
  const content = await fs.readFile(issuePath, "utf8");
  await fs.writeFile(
    issuePath,
    `${content.trimEnd()}\n\n## 交付记录\n\n- 交付物: 订单能力。\n- 验证证据: 测试通过。\n`,
  );
};
