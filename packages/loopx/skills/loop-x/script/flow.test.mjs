import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { executeFlow } from "./flow.mjs";
import { verifyContract } from "./testing/script-contracts.mjs";

const execFileAsync = promisify(execFile);
const FLOW_PATH = fileURLToPath(new URL("./flow.mjs", import.meta.url));
const PLAN_PATH = "docs/orders/plans/active/2026-08-22-订单流转";
const TEST_NOW = new Date();
const DEFAULT_HOOK_MESSAGE = "请携带当前 Flow context 执行，并在完成后返回主流程登记真实结果。";

const statePath = (workspace, date = TEST_NOW) => {
  const prefix = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
  return path.join(workspace, ".flow", "state", `${prefix}-state.json`);
};

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

/code-delivery
`;

const specDocument = (issueDefinitions) => `---
status: pending
---

# 订单流转

## 问题

需要订单能力。

## 方案

按 Issue 交付。

## Issue

| # | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
${issueDefinitions
  .map(
    (issue) =>
      `| ${issue.id} | [Issue ${issue.id}](${issue.id}-订单能力.md) | pending | ${issue.dependencies.length === 0 ? "—" : issue.dependencies.join(", ")} | /code-delivery |`,
  )
  .join("\n")}
`;

const createWorkspace = async (issueDefinitions = [{ dependencies: [], id: "01" }]) => {
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

const command = async (workspace, commandName, options) => {
  try {
    const result = await executeFlow({
      command: commandName,
      now: () => new Date(TEST_NOW),
      options,
      workspace,
    });
    verifyContract("flowCore", { ok: true, result }, workspace);
    return result;
  } catch (error) {
    verifyContract(
      "flowCore",
      { ok: false, error: { name: error?.name, message: error?.message } },
      workspace,
    );
    throw error;
  }
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

const recordIssue = (workspace, issue, session, step, result) =>
  command(workspace, "record-issue", {
    ...(step === "commit" ? { action: "commit" } : { skill: `/${step}` }),
    evidence: [`${step}-${result}`],
    issue,
    plan: PLAN_PATH,
    result,
    session,
  });

const readyIssuePlan = async (workspace, session = "plan-session") => {
  await command(workspace, "init", { entry: "/to-story", plan: PLAN_PATH, session });
  await recordPlan(workspace, session, "to-story", "completed");
  await recordPlan(workspace, session, "quest-with-domain", "completed");
  await recordPlan(workspace, session, "to-issues", "completed");
  return recordPlan(workspace, session, "dev-gate", "ready");
};

const addDeliveryEvidence = async (workspace, issueId) => {
  const issuePath = path.join(workspace, PLAN_PATH, `${issueId}-订单能力.md`);
  const content = await fs.readFile(issuePath, "utf8");
  await fs.writeFile(
    issuePath,
    `${content.trimEnd()}\n\n## 交付记录\n\n- 交付物: 订单能力。\n- 验证证据: 测试通过。\n`,
  );
};

test("主流程从 to-story 开始且不再强制 questing", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry: "/to-story",
      plan: PLAN_PATH,
      skill: "/loop-x",
    });
    assert.equal(entered.next_skill, "/to-story");
    assert.equal(entered.message, DEFAULT_HOOK_MESSAGE);

    const story = await recordPlan(workspace, entered.session, "to-story", "completed");
    assert.equal(story.next_skill, "/quest-with-domain");
    assert.equal(story.message, DEFAULT_HOOK_MESSAGE);
    await assert.rejects(
      recordPlan(workspace, entered.session, "questing", "completed"),
      /期望 \/quest-with-domain/,
    );

    const quested = await recordPlan(workspace, entered.session, "quest-with-domain", "completed");
    assert.equal(quested.next_skill, "/to-issues");
    assert.equal(quested.message, DEFAULT_HOOK_MESSAGE);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("主流程可从 quest-with-domain 开始并跳过 to-issues", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      skill: "/quest-with-domain",
    });
    assert.equal(entered.next_skill, "/quest-with-domain");

    assert.equal(
      (await recordPlan(workspace, entered.session, "quest-with-domain", "completed")).next_skill,
      "/to-issues",
    );
    assert.equal(
      (await recordPlan(workspace, entered.session, "to-issues", "skipped")).next_skill,
      "/dev-gate",
    );
    const delivery = await recordPlan(workspace, entered.session, "dev-gate", "ready");
    assert.equal(delivery.phase, "delivering_direct");
    assert.equal(delivery.next_skill, "/code-delivery");
    assert.equal(delivery.message, DEFAULT_HOOK_MESSAGE);
    const commit = await recordPlan(workspace, entered.session, "code-delivery", "started");
    assert.equal(commit.next_action, "commit");
    assert.equal("message" in commit, false);
    const completed = await recordPlan(workspace, entered.session, "commit", "committed");
    assert.equal(completed.phase, "completed");
    assert.equal(completed.next_skill, null);
    assert.equal("message" in completed, false);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("to-issues 完成后 dev-gate 转入 Issue 级 code-delivery", async () => {
  const workspace = await createWorkspace();
  try {
    const ready = await readyIssuePlan(workspace);
    assert.equal(ready.phase, "delivering_issues");
    assert.equal(ready.next_skill, null);
    assert.equal("message" in ready, false);
    await assert.rejects(
      recordPlan(workspace, "plan-session", "code-delivery", "started"),
      /当前阶段 delivering_issues 不接受 record-plan/,
    );

    const claimed = await command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "issue-session",
    });
    assert.equal(claimed.next_skill, "/code-delivery");
    assert.equal(claimed.message, DEFAULT_HOOK_MESSAGE);
    assert.equal(
      (await recordIssue(workspace, "01", "issue-session", "code-delivery", "started")).next_action,
      "commit",
    );
    await addDeliveryEvidence(workspace, "01");
    const completed = await recordIssue(workspace, "01", "issue-session", "commit", "committed");
    assert.equal(completed.status, "completed");
    assert.equal(completed.phase, "completed");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("hooks 对同一 skill 按声明顺序拼接且只附加到 next_skill", async () => {
  const workspace = await createWorkspace();
  const hooks = {
    hooks: [
      { match: "all", message: "global" },
      { match: ["to-story", "quest-with-domain"], message: "discovery" },
      { match: ["to-story"], message: "story" },
    ],
    schema_version: 1,
  };
  try {
    const entered = await executeFlow({
      command: "init",
      hooks,
      now: () => new Date(TEST_NOW),
      options: { entry: "/to-story", plan: PLAN_PATH, session: "hook-session" },
      workspace,
    });
    assert.equal(entered.message, "global\ndiscovery\nstory");

    const story = await executeFlow({
      command: "record-plan",
      hooks,
      now: () => new Date(TEST_NOW),
      options: {
        evidence: ["story-completed"],
        plan: PLAN_PATH,
        result: "completed",
        session: "hook-session",
        skill: "/to-story",
      },
      workspace,
    });
    assert.equal(story.message, "global\ndiscovery");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("to-issues 只接受 completed 或 skipped", async () => {
  const workspace = await createWorkspace();
  try {
    await command(workspace, "init", {
      entry: "/quest-with-domain",
      plan: PLAN_PATH,
      session: "decision-session",
    });
    await recordPlan(workspace, "decision-session", "quest-with-domain", "completed");
    await assert.rejects(
      recordPlan(workspace, "decision-session", "to-issues", "started"),
      /result 必须是 completed \| skipped/,
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test.each(["/to-story", "/quest-with-domain"])("loop-x 只从主流程入口 %s 初始化", async (entry) => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry,
      plan: PLAN_PATH,
      skill: "/loop-x",
    });
    assert.equal(entered.next_skill, entry);
    assert.match(entered.session, /^[0-9a-f-]{36}$/);
    const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
    assert.equal(state.schema_version, 5);
    assert.equal(state.plans[PLAN_PATH].cursor, entry === "/to-story" ? 0 : 1);
    assert.equal(state.plans[PLAN_PATH].phase, "planning");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("to-issues 不再是入口", async () => {
  const workspace = await createWorkspace();
  try {
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/to-issues",
        plan: PLAN_PATH,
        skill: "/loop-x",
      }),
      /--entry 必须是 \/to-story \| \/quest-with-domain/,
    );
    await assert.rejects(
      command(workspace, "enter-plan", { plan: PLAN_PATH, skill: "/to-issues" }),
      /--skill 必须是/,
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("已有 Flow 只能从当前入口接续", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry: "/to-story",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/loop-x",
    });
    const repeated = await command(workspace, "enter-plan", {
      entry: "/to-story",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/loop-x",
    });
    assert.equal(repeated.revision, entered.revision);

    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/quest-with-domain",
        plan: PLAN_PATH,
        session: "owner",
        skill: "/loop-x",
      }),
      /当前期望 \/to-story/,
    );
    await recordPlan(workspace, "owner", "to-story", "completed");
    assert.equal(
      (
        await command(workspace, "enter-plan", {
          entry: "/quest-with-domain",
          plan: PLAN_PATH,
          session: "owner",
          skill: "/loop-x",
        })
      ).next_skill,
      "/quest-with-domain",
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("Plan 租约可释放并由新会话恢复当前主流程步骤", async () => {
  const workspace = await createWorkspace();
  try {
    await command(workspace, "init", {
      entry: "/to-story",
      plan: PLAN_PATH,
      session: "first",
    });
    await recordPlan(workspace, "first", "to-story", "completed");
    await command(workspace, "release-plan", { plan: PLAN_PATH, session: "first" });
    const resumed = await command(workspace, "claim-plan", {
      plan: PLAN_PATH,
      session: "second",
    });
    assert.equal(resumed.next_skill, "/quest-with-domain");
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
    await readyIssuePlan(workspace);
    const [first, second] = await Promise.all([
      command(workspace, "claim-issue", {
        issue: "01",
        plan: PLAN_PATH,
        session: "first",
      }),
      command(workspace, "claim-issue", {
        issue: "02",
        plan: PLAN_PATH,
        session: "second",
      }),
    ]);
    assert.equal(first.next_skill, "/code-delivery");
    assert.equal(second.next_skill, "/code-delivery");
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
    await readyIssuePlan(workspace);
    await assert.rejects(
      command(workspace, "claim-issue", { issue: "02", plan: PLAN_PATH }),
      /直接依赖 01 尚未 completed/,
    );
    await command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "first",
    });
    await recordIssue(workspace, "01", "first", "code-delivery", "started");
    await addDeliveryEvidence(workspace, "01");
    await recordIssue(workspace, "01", "first", "commit", "committed");
    assert.equal(
      (await command(workspace, "status", { plan: PLAN_PATH })).plan.phase,
      "delivering_issues",
    );
    assert.equal(
      (await command(workspace, "claim-issue", { issue: "02", plan: PLAN_PATH })).next_skill,
      "/code-delivery",
    );
    const second = await command(workspace, "status", { plan: PLAN_PATH });
    const secondSession = second.plan.issues["02"].lease.owner_session;
    await recordIssue(workspace, "02", secondSession, "code-delivery", "started");
    await addDeliveryEvidence(workspace, "02");
    assert.equal(
      (await recordIssue(workspace, "02", secondSession, "commit", "committed")).phase,
      "completed",
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("阻塞 Issue 释放租约并可恢复", async () => {
  const workspace = await createWorkspace();
  try {
    await readyIssuePlan(workspace);
    await command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "first",
    });
    const blocked = await command(workspace, "block-issue", {
      issue: "01",
      plan: PLAN_PATH,
      reason: "依赖不可用",
      "release-condition": "依赖恢复",
      session: "first",
    });
    assert.equal(blocked.status, "blocked");
    const resumed = await command(workspace, "resume-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "second",
    });
    assert.equal(resumed.next_skill, "/code-delivery");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("sync-plan 从 Issue 文档恢复完成状态", async () => {
  const workspace = await createWorkspace();
  try {
    await readyIssuePlan(workspace);
    const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
    const issue = await fs.readFile(issuePath, "utf8");
    await fs.writeFile(issuePath, issue.replace("status: pending", "status: completed"));
    await command(workspace, "sync-plan", { plan: PLAN_PATH });
    const status = await command(workspace, "status", { plan: PLAN_PATH });
    assert.equal(status.plan.issues["01"].status, "completed");
    assert.equal(status.plan.phase, "completed");

    await fs.writeFile(issuePath, issue);
    await command(workspace, "sync-plan", { plan: PLAN_PATH });
    const reopened = await command(workspace, "status", { plan: PLAN_PATH });
    assert.equal(reopened.plan.issues["01"], undefined);
    assert.equal(reopened.plan.phase, "delivering_issues");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("完成后的无 Issue Flow 可从同一入口重新开始", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      skill: "/quest-with-domain",
    });
    await recordPlan(workspace, entered.session, "quest-with-domain", "completed");
    await recordPlan(workspace, entered.session, "to-issues", "skipped");
    await recordPlan(workspace, entered.session, "dev-gate", "ready");
    await recordPlan(workspace, entered.session, "code-delivery", "started");
    await recordPlan(workspace, entered.session, "commit", "committed");

    const restarted = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      skill: "/quest-with-domain",
    });
    assert.equal(restarted.next_skill, "/quest-with-domain");
    assert.notEqual(restarted.session, entered.session);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("CLI 可脱离工作区 package 配置直接运行", async () => {
  const workspace = await createWorkspace();
  try {
    const initialized = await execFileAsync(
      process.execPath,
      [FLOW_PATH, "init", "--plan", PLAN_PATH, "--entry", "/quest-with-domain", "--session", "cli"],
      { cwd: workspace },
    );
    assert.equal(JSON.parse(initialized.stdout).next_skill, "/quest-with-domain");

    const loopxWorkspace = await createWorkspace();
    try {
      const entered = await execFileAsync(
        process.execPath,
        [
          FLOW_PATH,
          "enter-plan",
          "--plan",
          PLAN_PATH,
          "--skill",
          "/loop-x",
          "--entry",
          "/to-story",
        ],
        { cwd: loopxWorkspace },
      );
      assert.equal(JSON.parse(entered.stdout).next_skill, "/to-story");
    } finally {
      await fs.rm(loopxWorkspace, { force: true, recursive: true });
    }
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});
