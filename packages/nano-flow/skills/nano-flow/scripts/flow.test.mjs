import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";

import { executeFlow } from "./flow.mjs";
import {
  addDeliveryEvidence,
  cleanupWorkspaces,
  command,
  createWorkspace,
  PLAN_PATH,
  readyIssuePlan,
  recordIssue,
  recordPlan,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

const execFileAsync = promisify(execFile);
const FLOW_PATH = fileURLToPath(new URL("./flow.mjs", import.meta.url));
const DEFAULT_HOOK_MESSAGE =
  "当前 skill 执行结束后, 询问用户当前 skill 是否完成 + 是否进入下一个 skill, 用户同意后, 执行 flow.mjs, 然后自动调用下一个 skill(无须用户确认).";
const AUTO_HOOK_MESSAGE = "当前 skill 内部确认及其执行结束后, 无需用户确认, 自动调用下一个 skill";
const AUTO_QUESTING_HOOK_MESSAGE =
  "当前 skill 明确要求的人工澄清及其产物确认照常执行；其余内部确认及执行结束后的推进无需用户确认，自动调用下一个 skill。";
const ADMISSION_HOOK_MESSAGE =
  "任何准入判断前先完整读取 `<nano-flow-skill-root-dir>/extensions/QUESTIONS.md` 和 `<nano-flow-skill-root-dir>/extensions/workflows/README.md`，以用户输入和当前上下文作为已有答案，选择并询问全部相关问题。问题集未清空时结论为 `not ready`。基线首次建立或实质漂移时，向用户提交简短基线卡并等待确认；仍适用的既有确认直接复用。";
const DELIVERY_WORKFLOW_MESSAGE =
  "交付过程中遇到 block 卡点， 请优先在 `<nano-flow-skill-root-dir>/extensions/workflows/README.md` 和对应业务域 workflow 中寻找可能的解决方法.";
const CODE_DELIVERY_HOOK_MESSAGE = `${ADMISSION_HOOK_MESSAGE}\n${DELIVERY_WORKFLOW_MESSAGE}`;

afterEach(cleanupWorkspaces);

test("questing 只登记一次完成结果，随后进入 to-issues", async () => {
  const workspace = await createWorkspace();
  const entered = await command(workspace, "enter-plan", {
    entry: "/questing",
    plan: PLAN_PATH,
    skill: "/nano-flow",
  });
  assert.equal(entered.next_skill, "/questing");
  assert.equal(Object.hasOwn(entered, "next_branch"), false);
  assert.equal(entered.message, DEFAULT_HOOK_MESSAGE);
  const next = await recordPlan(workspace, entered.session, "questing", "completed");
  assert.equal(next.next_skill, "/to-issues");
  assert.equal(next.message, DEFAULT_HOOK_MESSAGE);
  await assert.rejects(
    recordPlan(workspace, entered.session, "questing", "completed"),
    /期望 \/to-issues/,
  );
  const status = await command(workspace, "status", { plan: PLAN_PATH });
  assert.equal(status.plan.receipts.length, 1);
  assert.equal(status.plan.receipts[0].step, "/questing");
});

test("主流程可从 questing 开始并跳过 to-issues", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "direct-session",
      skill: "/nano-flow",
    });
    assert.deepEqual(entered, {
      message: DEFAULT_HOOK_MESSAGE,
      next_action: null,
      next_skill: "/questing",
      phase: "planning",
      plan: PLAN_PATH,
      revision: 1,
      session: "direct-session",
    });

    assert.deepEqual(await recordPlan(workspace, entered.session, "questing", "completed"), {
      message: DEFAULT_HOOK_MESSAGE,
      next_action: null,
      next_skill: "/to-issues",
      phase: "planning",
      plan: PLAN_PATH,
      revision: 2,
    });
    const delivery = await recordPlan(workspace, entered.session, "to-issues", "skipped");
    assert.deepEqual(delivery, {
      message: CODE_DELIVERY_HOOK_MESSAGE,
      next_action: null,
      next_skill: "/code-delivery",
      phase: "delivering_direct",
      plan: PLAN_PATH,
      revision: 3,
    });
    const commit = await recordPlan(workspace, entered.session, "code-delivery", "started");
    assert.deepEqual(commit, {
      next_action: "commit",
      next_skill: null,
      phase: "delivering_direct",
      plan: PLAN_PATH,
      revision: 4,
    });
    const completed = await recordPlan(workspace, entered.session, "commit", "committed");
    assert.deepEqual(completed, {
      next_action: null,
      next_skill: null,
      phase: "completed",
      plan: PLAN_PATH,
      revision: 5,
    });
    const status = await command(workspace, "status", { plan: PLAN_PATH });
    assert.deepEqual(status.plan, {
      cursor: 2,
      issues: {},
      lease: null,
      phase: "completed",
      receipts: [
        {
          evidence: ["questing-completed"],
          kind: "skill",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "completed",
          step: "/questing",
        },
        {
          evidence: ["to-issues-skipped"],
          kind: "skill",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "skipped",
          step: "/to-issues",
        },
        {
          evidence: ["code-delivery-started"],
          kind: "skill",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "started",
          step: "/code-delivery",
        },
        {
          evidence: ["commit-committed"],
          kind: "action",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "committed",
          step: "commit",
        },
      ],
    });
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("to-issues 完成后可领取 Issue 进入 code-delivery", async () => {
  const workspace = await createWorkspace();
  try {
    const ready = await readyIssuePlan(workspace);
    assert.deepEqual(ready, {
      next_action: null,
      next_skill: null,
      phase: "delivering_issues",
      plan: PLAN_PATH,
      revision: 3,
    });
    await assert.rejects(
      recordPlan(workspace, "plan-session", "code-delivery", "started"),
      /当前阶段 delivering_issues 不接受 record-plan/,
    );

    const claimed = await command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "issue-session",
    });
    assert.deepEqual(claimed, {
      issue: "01",
      message: CODE_DELIVERY_HOOK_MESSAGE,
      next_action: null,
      next_skill: "/code-delivery",
      plan: PLAN_PATH,
      revision: 4,
      session: "issue-session",
    });
    assert.deepEqual(
      await recordIssue(workspace, "01", "issue-session", "code-delivery", "started"),
      {
        issue: "01",
        next_action: "commit",
        next_skill: null,
        phase: "delivering_issues",
        plan: PLAN_PATH,
        revision: 5,
        status: "active",
      },
    );
    await addDeliveryEvidence(workspace, "01");
    const completed = await recordIssue(workspace, "01", "issue-session", "commit", "committed");
    assert.deepEqual(completed, {
      issue: "01",
      next_action: null,
      next_skill: null,
      phase: "completed",
      plan: PLAN_PATH,
      revision: 6,
      status: "completed",
    });
    const status = await command(workspace, "status", { plan: PLAN_PATH });
    assert.deepEqual(status.plan, {
      cursor: 0,
      issues: {
        "01": {
          cursor: 2,
          lease: null,
          receipts: [
            {
              evidence: ["code-delivery-started"],
              kind: "skill",
              reason: null,
              recorded_at: TEST_NOW.toISOString(),
              result: "started",
              step: "/code-delivery",
            },
            {
              evidence: ["commit-committed"],
              kind: "action",
              reason: null,
              recorded_at: TEST_NOW.toISOString(),
              result: "committed",
              step: "commit",
            },
          ],
          status: "completed",
        },
      },
      lease: null,
      phase: "completed",
      receipts: [
        {
          evidence: ["questing-completed"],
          kind: "skill",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "completed",
          step: "/questing",
        },
        {
          evidence: ["to-issues-completed"],
          kind: "skill",
          reason: null,
          recorded_at: TEST_NOW.toISOString(),
          result: "completed",
          step: "/to-issues",
        },
      ],
    });
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("hooks 对同一 skill 按声明顺序拼接且只附加到 next_skill", async () => {
  const workspace = await createWorkspace();
  const hooks = {
    hooks: [
      { match: "all", message: "global" },
      { match: ["questing"], message: "discovery" },
      { match: ["questing"], message: "story" },
    ],
    schema_version: 1,
  };
  try {
    const entered = await executeFlow({
      command: "enter-plan",
      hooks,
      now: () => new Date(TEST_NOW),
      options: {
        entry: "/questing",
        plan: PLAN_PATH,
        session: "hook-session",
        skill: "/nano-flow",
      },
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
        skill: "/questing",
      },
      workspace,
    });
    assert.equal(story.message, "global");
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("无匹配 hook 时不暴露空 message 字段", async () => {
  const workspace = await createWorkspace();
  const hooks = {
    hooks: [{ match: ["questing"], message: "story only" }],
    schema_version: 1,
  };
  const now = () => new Date(TEST_NOW);
  const record = (skill, result) =>
    executeFlow({
      command: "record-plan",
      hooks,
      now,
      options: {
        evidence: [`${skill}-${result}`],
        plan: PLAN_PATH,
        result,
        session: "owner",
        skill,
      },
      workspace,
    });
  try {
    await executeFlow({
      command: "enter-plan",
      hooks,
      now,
      options: {
        entry: "/questing",
        plan: PLAN_PATH,
        session: "owner",
        skill: "/nano-flow",
      },
      workspace,
    });
    await record("/questing", "completed");
    assert.deepEqual(await record("/to-issues", "skipped"), {
      next_action: null,
      next_skill: "/code-delivery",
      phase: "delivering_direct",
      plan: PLAN_PATH,
      revision: 3,
    });
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("auto 模式的规划 hook 与 code-delivery 准入 hook 按配置分别注入", async () => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry: "/questing",
      mode: "auto",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/nano-flow",
    });
    assert.equal(entered.message, AUTO_QUESTING_HOOK_MESSAGE);
    const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
    assert.equal(state.plans[PLAN_PATH].mode, "auto");

    const story = await recordPlan(workspace, "owner", "questing", "completed");
    assert.equal(story.message, AUTO_HOOK_MESSAGE);
    const delivered = await recordPlan(workspace, "owner", "to-issues", "skipped");
    assert.equal(delivered.message, CODE_DELIVERY_HOOK_MESSAGE);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("--mode 随 Plan 持久化、可切换且拒绝非法值", async () => {
  const workspace = await createWorkspace();
  try {
    await assert.rejects(
      command(workspace, "enter-plan", {
        entry: "/questing",
        mode: "turbo",
        plan: PLAN_PATH,
        skill: "/nano-flow",
      }),
      /--mode 必须是 manual \| auto/,
    );

    const entered = await command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/nano-flow",
    });
    assert.equal(entered.message, DEFAULT_HOOK_MESSAGE);

    const switched = await command(workspace, "enter-plan", {
      entry: "/questing",
      mode: "auto",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/nano-flow",
    });
    assert.equal(switched.message, AUTO_QUESTING_HOOK_MESSAGE);
    assert.equal(switched.revision, entered.revision + 1);

    const kept = await command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "owner",
      skill: "/nano-flow",
    });
    assert.equal(kept.message, AUTO_QUESTING_HOOK_MESSAGE);
    assert.equal(kept.revision, switched.revision);
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test("to-issues 只接受 completed 或 skipped", async () => {
  const workspace = await createWorkspace();
  try {
    await command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "decision-session",
      skill: "/nano-flow",
    });
    await recordPlan(workspace, "decision-session", "questing", "completed");
    await assert.rejects(
      recordPlan(workspace, "decision-session", "to-issues", "started"),
      /result 必须是 completed \| skipped/,
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});

test.each(["/questing"])("nano-flow 只从主流程入口 %s 初始化", async (entry) => {
  const workspace = await createWorkspace();
  try {
    const entered = await command(workspace, "enter-plan", {
      entry,
      plan: PLAN_PATH,
      skill: "/nano-flow",
    });
    assert.equal(entered.next_skill, "/questing");
    assert.match(entered.session, /^[0-9a-f-]{36}$/);
    const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
    assert.equal(state.schema_version, 6);
    assert.equal(state.plans[PLAN_PATH].cursor, 0);
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
        skill: "/nano-flow",
      }),
      /--entry 必须是 \/questing/,
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
  const options = { entry: "/questing", plan: PLAN_PATH, session: "owner", skill: "/nano-flow" };
  const entered = await command(workspace, "enter-plan", options);
  assert.equal((await command(workspace, "enter-plan", options)).revision, entered.revision);
  await recordPlan(workspace, "owner", "questing", "completed");
  await assert.rejects(command(workspace, "enter-plan", options), /当前期望 \/to-issues/);
});

test("Plan 租约可释放并由新会话恢复当前主流程步骤", async () => {
  const workspace = await createWorkspace();
  try {
    await command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "first",
      skill: "/nano-flow",
    });
    await recordPlan(workspace, "first", "questing", "completed");
    await command(workspace, "release-plan", { plan: PLAN_PATH, session: "first" });
    const resumed = await command(workspace, "claim-plan", {
      plan: PLAN_PATH,
      session: "second",
    });
    assert.equal(resumed.next_skill, "/to-issues");
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

test("CLI 可脱离工作区 package 配置直接运行", async () => {
  const workspace = await createWorkspace();
  try {
    const enteredDirectly = await execFileAsync(
      process.execPath,
      [
        FLOW_PATH,
        "enter-plan",
        "--plan",
        PLAN_PATH,
        "--skill",
        "/nano-flow",
        "--entry",
        "/questing",
        "--session",
        "cli",
      ],
      { cwd: workspace },
    );
    assert.equal(JSON.parse(enteredDirectly.stdout).next_skill, "/questing");

    const nfWorkspace = await createWorkspace();
    try {
      const entered = await execFileAsync(
        process.execPath,
        [
          FLOW_PATH,
          "enter-plan",
          "--plan",
          PLAN_PATH,
          "--skill",
          "/nano-flow",
          "--entry",
          "/questing",
        ],
        { cwd: nfWorkspace },
      );
      assert.equal(JSON.parse(entered.stdout).next_skill, "/questing");
    } finally {
      await fs.rm(nfWorkspace, { force: true, recursive: true });
    }
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
});
