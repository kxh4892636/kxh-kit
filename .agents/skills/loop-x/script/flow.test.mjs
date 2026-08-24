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
  await completeRequiredPlanStep(workspace, session, "to-issues", "grill-with-docs");
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

const completeRequiredPlanStep = async (workspace, session, parent, child) => {
  await recordPlan(workspace, session, parent, "started");
  await recordPlan(workspace, session, child, "completed");
  return recordPlan(workspace, session, parent, "completed");
};

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
    const result = await completeRequiredPlanStep(workspace, "s1", "to-story", "grilling");
    assert.equal(result.next_skill, "/to-issues");
    const issues = await completeRequiredPlanStep(workspace, "s1", "to-issues", "grill-with-docs");
    assert.equal(issues.next_skill, "/dev-gate");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("story 路径强制 to-story 调用 grilling", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await command(workspace, "init", {
      plan: PLAN_PATH,
      route: "story",
      session: "story-session",
    });
    await assert.rejects(
      recordPlan(workspace, "story-session", "to-story", "completed"),
      /必须先登记 \/to-story=started/,
    );

    const started = await recordPlan(workspace, "story-session", "to-story", "started");
    assert.equal(started.next_skill, "/grilling");
    await assert.rejects(
      recordPlan(workspace, "story-session", "to-story", "completed"),
      /期望 \/grilling/,
    );

    const grilled = await recordPlan(workspace, "story-session", "grilling", "completed");
    assert.equal(grilled.next_skill, "/to-story");
    const completed = await recordPlan(workspace, "story-session", "to-story", "completed");
    assert.equal(completed.next_skill, "/to-issues");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("issues 路径强制 to-issues 调用 grill-with-docs", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await command(workspace, "init", {
      plan: PLAN_PATH,
      route: "issues",
      session: "issues-session",
    });

    const started = await recordPlan(workspace, "issues-session", "to-issues", "started");
    assert.equal(started.next_skill, "/grill-with-docs");
    const grilled = await recordPlan(workspace, "issues-session", "grill-with-docs", "completed");
    assert.equal(grilled.next_skill, "/to-issues");
    const completed = await recordPlan(workspace, "issues-session", "to-issues", "completed");
    assert.equal(completed.next_skill, "/dev-gate");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("Plan 恢复时返回未完成的 required child", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await command(workspace, "init", {
      plan: PLAN_PATH,
      route: "story",
      session: "first-session",
    });
    await recordPlan(workspace, "first-session", "to-story", "started");
    await command(workspace, "release-plan", {
      plan: PLAN_PATH,
      session: "first-session",
    });

    const resumed = await command(workspace, "claim-plan", {
      plan: PLAN_PATH,
      session: "second-session",
    });
    assert.equal(resumed.next_skill, "/grilling");
    const grilled = await recordPlan(workspace, "second-session", "grilling", "completed");
    assert.equal(grilled.next_skill, "/to-story");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("v1 状态迁移后保留已完成步骤并约束当前步骤", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    const stateDirectory = path.join(workspace, ".loop");
    await fs.mkdir(stateDirectory);
    await fs.writeFile(
      path.join(stateDirectory, "state.json"),
      `${JSON.stringify(
        {
          plans: {
            [PLAN_PATH]: {
              issues: {},
              plan_path: PLAN_PATH,
              route: "story",
              setup: {
                cursor: 1,
                lease: {
                  expires_at: "2999-01-01T00:00:00.000Z",
                  owner_session: "migration-session",
                },
                receipts: [
                  {
                    evidence: ["legacy-story.md"],
                    kind: "skill",
                    reason: null,
                    recorded_at: "2026-08-25T00:00:00.000Z",
                    result: "completed",
                    step: "/to-story",
                  },
                ],
                status: "active",
              },
            },
          },
          revision: 4,
          schema_version: 1,
        },
        null,
        2,
      )}\n`,
    );

    await command(workspace, "status", { plan: PLAN_PATH });
    const migrated = JSON.parse(await fs.readFile(path.join(stateDirectory, "state.json"), "utf8"));
    assert.equal(migrated.schema_version, 2);
    assert.equal(migrated.revision, 5);
    assert.equal(migrated.plans[PLAN_PATH].setup.cursor, 1);
    assert.equal(migrated.plans[PLAN_PATH].setup.receipts.length, 1);
    await assert.rejects(
      recordPlan(workspace, "migration-session", "to-issues", "completed"),
      /必须先登记 \/to-issues=started/,
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("直接进入 grill-with-docs 会初始化主路径", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    const entered = await command(workspace, "enter-plan", {
      skill: "/grill-with-docs",
    });
    assert.equal(entered.next_skill, "/grill-with-docs");
    assert.equal(entered.plan, ".");
    assert.equal(entered.route, "main");
    assert.match(entered.session, /^[0-9a-f-]{36}$/);
    const repeated = await command(workspace, "enter-plan", {
      plan: entered.plan,
      session: entered.session,
      skill: "/grill-with-docs",
    });
    assert.equal(repeated.revision, entered.revision);
    assert.equal(repeated.session, entered.session);
    const next = await command(workspace, "record-plan", {
      evidence: ["领域访谈完成"],
      plan: entered.plan,
      result: "completed",
      session: entered.session,
      skill: "/grill-with-docs",
    });
    assert.equal(next.next_skill, "/dev-gate");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

for (const { entry, plan, route } of [
  { entry: "/grill-with-docs", plan: ".", route: "main" },
  { entry: "/to-story", plan: PLAN_PATH, route: "story" },
  { entry: "/to-issues", plan: PLAN_PATH, route: "issues" },
]) {
  test(`loop-x 选择 ${entry} 会原子进入 ${route} 路径`, async () => {
    const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
    try {
      const entered = await command(workspace, "enter-plan", {
        entry,
        ...(plan === "." ? {} : { plan }),
        skill: "/loop-x",
      });
      assert.equal(entered.next_skill, entry);
      assert.equal(entered.plan, plan);
      assert.equal(entered.route, route);
      assert.match(entered.session, /^[0-9a-f-]{36}$/);
    } finally {
      await fs.rm(workspace, { force: true, recursive: true });
    }
  });
}

test("loop-x 必须选择规定的入口 skill", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await assert.rejects(command(workspace, "enter-plan", { skill: "/loop-x" }), /缺少 --entry/);
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/implement",
        skill: "/loop-x",
      }),
      /--entry 必须是 \/grill-with-docs \| \/to-story \| \/to-issues/,
    );
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/to-story",
        skill: "/loop-x",
      }),
      /\/to-story 进入流程前必须提供 --plan/,
    );
    await assert.rejects(fs.access(path.join(workspace, ".loop", "state.json")), {
      code: "ENOENT",
    });
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("固定入口 skill 不能代理选择其他入口", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/to-story",
        skill: "/grill-with-docs",
      }),
      /只有 \/loop-x 可以指定 --entry/,
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("loop-x 只能接入已有流程当前期待的入口", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    const entered = await command(workspace, "enter-plan", {
      entry: "/to-story",
      plan: PLAN_PATH,
      session: "loopx-session",
      skill: "/loop-x",
    });
    const repeated = await command(workspace, "enter-plan", {
      entry: "/to-story",
      plan: PLAN_PATH,
      session: entered.session,
      skill: "/loop-x",
    });
    assert.equal(repeated.revision, entered.revision);

    const statePath = path.join(workspace, ".loop", "state.json");
    const stateBeforeMismatch = await fs.readFile(statePath, "utf8");
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/to-issues",
        plan: PLAN_PATH,
        session: entered.session,
        skill: "/loop-x",
      }),
      /当前期望 \/to-story/,
    );
    assert.equal(await fs.readFile(statePath, "utf8"), stateBeforeMismatch);

    await completeRequiredPlanStep(workspace, entered.session, "to-story", "grilling");
    const advanced = await command(workspace, "enter-plan", {
      entry: "/to-issues",
      plan: PLAN_PATH,
      session: entered.session,
      skill: "/loop-x",
    });
    assert.equal(advanced.next_skill, "/to-issues");
    assert.equal(advanced.route, "story");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("直接入口可以初始化并接续 story 路径", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    const story = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      skill: "/to-story",
    });
    assert.equal(story.route, "story");
    await completeRequiredPlanStep(workspace, story.session, "to-story", "grilling");
    const issues = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      session: story.session,
      skill: "/to-issues",
    });
    assert.equal(issues.next_skill, "/to-issues");
    assert.equal(issues.route, "story");
    assert.equal(issues.session, story.session);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("直接进入 to-issues 会初始化 issues 路径", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    const entered = await command(workspace, "enter-plan", {
      plan: PLAN_PATH,
      skill: "/to-issues",
    });
    assert.equal(entered.next_skill, "/to-issues");
    assert.equal(entered.route, "issues");
    assert.match(entered.session, /^[0-9a-f-]{36}$/);
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
    const reviewed = await recordPlan(workspace, "main-session", "code-review", "reviewed");
    assert.equal(reviewed.next_action, "commit");
    const completed = await recordPlan(workspace, "main-session", "commit", "committed");
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

test("直接推进 to-issues 时领取命令生成 Issue session", async () => {
  const workspace = await createWorkspace([{ dependencies: [], id: "01" }]);
  try {
    await readyPlan(workspace);
    const claimed = await command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
    });
    assert.equal(claimed.next_skill, "/implement");
    assert.match(claimed.session, /^[0-9a-f-]{36}$/);
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
    const reviewed = await recordIssue(workspace, "01", "issue-a", "code-review", "reviewed");
    assert.equal(reviewed.next_skill, null);
    assert.equal(reviewed.next_action, "commit");
    await assert.rejects(
      recordIssue(workspace, "01", "issue-a", "commit", "committed"),
      /交付物与验证证据/,
    );
    await addDeliveryEvidence(workspace, "01");
    const result = await recordIssue(workspace, "01", "issue-a", "commit", "committed");
    assert.equal(result.status, "completed");
    const state = JSON.parse(
      await fs.readFile(path.join(workspace, ".loop", "state.json"), "utf8"),
    );
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

    const state = JSON.parse(
      await fs.readFile(path.join(workspace, ".loop", "state.json"), "utf8"),
    );
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
    const issue = await fs.readFile(path.join(workspace, PLAN_PATH, "01-订单能力.md"), "utf8");
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
    await fs.access(path.join(workspace, ".loop", "state.json"));

    const loopxWorkspace = path.join(workspace, "loopx-entry");
    await fs.mkdir(loopxWorkspace);
    const { stdout: loopxStdout } = await execFileAsync(process.execPath, [
      FLOW_PATH,
      "enter-plan",
      "--skill",
      "/loop-x",
      "--entry",
      "/to-issues",
      "--plan",
      PLAN_PATH,
      "--workspace",
      loopxWorkspace,
    ]);
    const loopxResult = JSON.parse(loopxStdout);
    assert.equal(loopxResult.next_skill, "/to-issues");
    assert.equal(loopxResult.route, "issues");
    assert.equal(loopxResult.success, true);
    await fs.access(path.join(loopxWorkspace, ".loop", "state.json"));
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});
