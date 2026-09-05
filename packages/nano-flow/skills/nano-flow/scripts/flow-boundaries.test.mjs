import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";

import { executeFlow } from "./flow.mjs";
import {
  cleanupWorkspaces,
  command,
  createWorkspace,
  PLAN_PATH,
  readyIssuePlan as readyPlan,
  recordPlan,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const enterPlan = (workspace, options = {}, now) =>
  command(workspace, "enter-plan", { skill: "/nano-flow", ...options }, now);

test("状态文件使用本地日期前缀且不读取旧 state.json", async () => {
  const workspace = await createWorkspace();
  const stateDirectory = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateDirectory, { recursive: true });
  await fs.writeFile(
    path.join(stateDirectory, "state.json"),
    `${JSON.stringify({ plans: { legacy: {} }, revision: 99, schema_version: 4 })}\n`,
  );

  const initialized = await enterPlan(workspace, {
    entry: "/questing",
    plan: PLAN_PATH,
    session: "dated-state-session",
  });

  assert.equal(initialized.revision, 1);
  const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  assert.deepEqual(Object.keys(state.plans), [PLAN_PATH]);
});

test.each([
  ["null config", null, /格式无效或版本不受支持/],
  ["unsupported schema", { hooks: [], schema_version: 2 }, /格式无效或版本不受支持/],
  ["null hook", { hooks: [null], schema_version: 1 }, /Hook 1 格式无效/],
  ["empty match", { hooks: [{ match: [], message: "x" }], schema_version: 1 }, /match 必须/],
  [
    "unknown skill",
    { hooks: [{ match: ["unknown"], message: "x" }], schema_version: 1 },
    /match 必须/,
  ],
  ["empty message", { hooks: [{ match: "all", message: "" }], schema_version: 1 }, /message 必须/],
  [
    "multiline message",
    { hooks: [{ match: "all", message: "two\nlines" }], schema_version: 1 },
    /message 必须/,
  ],
])("invalid hooks fail before creating Flow state: %s", async (_name, hooks, expected) => {
  const workspace = await createWorkspace();
  await assert.rejects(
    executeFlow({
      command: "enter-plan",
      hooks,
      options: {
        entry: "/questing",
        plan: PLAN_PATH,
        session: "invalid-hook",
        skill: "/nano-flow",
      },
      workspace,
    }),
    expected,
  );
  await assert.rejects(fs.access(path.join(workspace, ".flow", "state")));
});

test("状态事务只清理三十天窗口之前的日期状态文件", async () => {
  const workspace = await createWorkspace();
  const stateDirectory = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateDirectory, { recursive: true });
  const expiredState = "2026-07-28-state.json";
  const oldestRetainedState = "2026-07-29-state.json";
  const recentState = "2026-08-17-state.json";
  const futureState = "2026-08-28-state.json";
  for (const name of [expiredState, oldestRetainedState, recentState, futureState, "notes.json"]) {
    await fs.writeFile(path.join(stateDirectory, name), "{}\n");
  }

  await enterPlan(workspace, {
    entry: "/questing",
    plan: PLAN_PATH,
    session: "retention-session",
  });

  const retainedNames = await fs.readdir(stateDirectory);
  assert.ok(!retainedNames.includes(expiredState));
  assert.ok(!retainedNames.includes(futureState));
  assert.ok(retainedNames.includes(oldestRetainedState));
  assert.ok(retainedNames.includes(recentState));
  assert.ok(retainedNames.includes("2026-08-27-state.json"));
  assert.ok(retainedNames.includes("notes.json"));
});

test.each([
  ["缺少 plan", { entry: "/questing", session: "s" }, "提供 --plan"],
  ["非法 entry", { entry: "/invalid", plan: PLAN_PATH, session: "s" }, "--entry 必须是"],
  [
    "过短 lease",
    { entry: "/questing", plan: PLAN_PATH, session: "s", "lease-seconds": "29" },
    "--lease-seconds",
  ],
  [
    "过长 lease",
    { entry: "/questing", plan: PLAN_PATH, session: "s", "lease-seconds": "86401" },
    "--lease-seconds",
  ],
  [
    "非整数 lease",
    { entry: "/questing", plan: PLAN_PATH, session: "s", "lease-seconds": "30.5" },
    "--lease-seconds",
  ],
  [
    "工作区外 plan",
    { entry: "/questing", plan: "../outside", session: "s" },
    "--plan 必须位于工作区内",
  ],
])("enter-plan 拒绝%s", async (_name, options, expected) => {
  const workspace = await createWorkspace();
  await assert.rejects(enterPlan(workspace, options), new RegExp(expected));
});

test("enter-plan applies default and boundary leases, rejects competing owners, and exposes phase", async () => {
  const workspace = await createWorkspace();
  const now = () => new Date(TEST_NOW);
  const initialized = await enterPlan(
    workspace,
    { entry: "/questing", plan: PLAN_PATH, session: "session", "lease-seconds": "30" },
    now,
  );
  assert.equal(initialized.session, "session");
  await assert.rejects(
    enterPlan(workspace, { entry: "/questing", plan: PLAN_PATH, session: "other" }, now),
    /资源由会话 session 持有/,
  );
  const plan = (await command(workspace, "status", { plan: PLAN_PATH })).plan;
  assert.deepEqual(Object.keys(plan).sort(), ["cursor", "issues", "lease", "phase", "receipts"]);
  assert.equal(plan.phase, "planning");
  assert.equal(Date.parse(plan.lease.expires_at) - TEST_NOW.getTime(), 30_000);

  await enterPlan(workspace, {
    entry: "/questing",
    plan: "default-plan",
    session: "default-session",
  });
  const defaultPlan = (await command(workspace, "status", { plan: "default-plan" })).plan;
  assert.equal(Date.parse(defaultPlan.lease.expires_at) - TEST_NOW.getTime(), 1_800_000);

  await enterPlan(workspace, {
    entry: "/questing",
    plan: "maximum-plan",
    session: "maximum-session",
    "lease-seconds": "86400",
  });
  const maximumPlan = (await command(workspace, "status", { plan: "maximum-plan" })).plan;
  assert.equal(Date.parse(maximumPlan.lease.expires_at) - TEST_NOW.getTime(), 86_400_000);
  await assert.rejects(command(workspace, "status", { plan: "missing" }), /尚未初始化/);
});

test.each([
  ["null", null],
  ["unsupported schema", { schema_version: 99, revision: 0, plans: {} }],
  ["fractional revision", { schema_version: 5, revision: 0.5, plans: {} }],
  ["null plans", { schema_version: 5, revision: 0, plans: null }],
  ["array plans", { schema_version: 5, revision: 0, plans: [] }],
  ["scalar plans", { schema_version: 5, revision: 0, plans: 1 }],
])("rejects invalid persisted state: %s", async (_name, state) => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow", "state"), { recursive: true });
  await fs.writeFile(statePath(workspace), JSON.stringify(state));
  await assert.rejects(command(workspace, "status"), {
    message: "Flow 状态格式无效或版本不受支持",
  });
});

const validPersistedPlan = () => ({
  cursor: 0,
  issues: {},
  lease: null,
  phase: "planning",
  receipts: [],
});

test.each([
  ["null", () => null],
  ["invalid phase", () => ({ ...validPersistedPlan(), phase: "unknown" })],
  ["fractional cursor", () => ({ ...validPersistedPlan(), cursor: 0.5 })],
  ["negative cursor", () => ({ ...validPersistedPlan(), cursor: -1 })],
  ["scalar receipts", () => ({ ...validPersistedPlan(), receipts: 1 })],
  ["null issues", () => ({ ...validPersistedPlan(), issues: null })],
  ["scalar issues", () => ({ ...validPersistedPlan(), issues: 1 })],
  ["array issues", () => ({ ...validPersistedPlan(), issues: [] })],
  ["scalar lease", () => ({ ...validPersistedPlan(), lease: 1 })],
  ["array lease", () => ({ ...validPersistedPlan(), lease: [] })],
])("rejects one invalid persisted Plan field: %s", async (_name, makePlan) => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow", "state"), { recursive: true });
  await fs.writeFile(
    statePath(workspace),
    JSON.stringify({ plans: { [PLAN_PATH]: makePlan() }, revision: 0, schema_version: 5 }),
  );
  await assert.rejects(command(workspace, "status"), { message: "Flow Plan 状态格式无效" });
});

test("reports malformed JSON and removes a stale state lock", async () => {
  const workspace = await createWorkspace();
  const stateRoot = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(statePath(workspace), "{");
  await assert.rejects(command(workspace, "status"), /解析 .*state.json 失败/);

  await fs.writeFile(
    statePath(workspace),
    JSON.stringify({ schema_version: 5, revision: 0, plans: {} }),
  );
  const lockPath = path.join(stateRoot, "state.lock");
  await fs.writeFile(lockPath, JSON.stringify({ nonce: "stale" }));
  const stale = new Date("2026-08-26T00:00:00.000Z");
  await fs.utimes(lockPath, stale, stale);
  assert.deepEqual(
    await command(workspace, "status", {}, () => new Date("2026-08-27T00:00:00.000Z")),
    { plans: {}, revision: 0 },
  );
});

test("enter-plan validates initiators, entries, sessions, and completed Flow reuse", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(
    command(workspace, "enter-plan", { skill: "/invalid", plan: PLAN_PATH }),
    /--skill 必须是/,
  );
  await assert.rejects(
    command(workspace, "enter-plan", { skill: "/nano-flow", entry: "/invalid", plan: PLAN_PATH }),
    /--entry 必须是/,
  );
  await assert.rejects(
    command(workspace, "enter-plan", {
      skill: "/questing",
      entry: "/questing",
      plan: PLAN_PATH,
    }),
    /--skill 必须是 \/nano-flow/,
  );
  await assert.rejects(command(workspace, "enter-plan", { skill: "/to-issues" }), /--skill 必须是/);

  const entered = await command(workspace, "enter-plan", {
    skill: "/nano-flow",
    entry: "/questing",
    plan: PLAN_PATH,
    session: "owner",
  });
  assert.equal(entered.next_skill, "/questing");
  await assert.rejects(
    command(workspace, "enter-plan", {
      entry: "/questing",
      plan: PLAN_PATH,
      session: "other",
      skill: "/nano-flow",
    }),
    /资源由会话 owner 持有/,
  );
  assert.equal(
    (
      await command(workspace, "enter-plan", {
        entry: "/questing",
        plan: PLAN_PATH,
        session: "owner",
        skill: "/nano-flow",
      })
    ).session,
    "owner",
  );
  const reacquired = await command(
    workspace,
    "enter-plan",
    { entry: "/questing", plan: PLAN_PATH, skill: "/nano-flow" },
    () => new Date(TEST_NOW.getTime() + 1_801_000),
  );
  assert.notEqual(reacquired.session, "owner");
  assert.match(reacquired.session, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(
    { ...reacquired, session: "generated" },
    {
      message:
        "当前 skill 执行结束后, 询问用户当前 skill 是否完成 + 是否进入下一个 skill, 用户同意后, 执行 flow.mjs, 然后自动调用下一个 skill(无须用户确认).",
      next_action: null,
      next_skill: "/questing",
      phase: "planning",
      plan: PLAN_PATH,
      revision: 2,
      session: "generated",
    },
  );
});

test("record-plan rejects wrong order, result, evidence, lease, and exhausted Flow", async () => {
  const workspace = await createWorkspace();
  await enterPlan(workspace, {
    entry: "/questing",
    plan: PLAN_PATH,
    session: "owner",
  });
  await assert.rejects(
    recordPlan(workspace, "other", "questing", "completed"),
    /资源由会话 owner 持有/,
  );
  await assert.rejects(recordPlan(workspace, "owner", "code-delivery", "started"), /步骤顺序错误/);
  await assert.rejects(
    recordPlan(workspace, "owner", "questing", "invalid"),
    /result 必须是 completed/,
  );
  await assert.rejects(
    command(workspace, "record-plan", {
      plan: PLAN_PATH,
      result: "completed",
      session: "owner",
      skill: "/questing",
    }),
    /至少需要一个 --evidence/,
  );

  await recordPlan(workspace, "owner", "questing", "completed");
  await recordPlan(workspace, "owner", "to-issues", "completed");
  await assert.rejects(
    recordPlan(workspace, "owner", "code-delivery", "started"),
    /当前阶段 delivering_issues 不接受 record-plan/,
  );
});

test("lease commands heartbeat, release, reclaim, and enforce owners", async () => {
  const workspace = await createWorkspace();
  await enterPlan(workspace, {
    entry: "/questing",
    plan: PLAN_PATH,
    session: "owner",
  });
  await assert.rejects(
    command(workspace, "heartbeat-plan", { plan: PLAN_PATH, session: "other" }),
    /资源由会话 owner 持有/,
  );
  await assert.rejects(command(workspace, "release-plan", { plan: PLAN_PATH, session: "other" }), {
    message: "资源由会话 owner 持有",
  });
  assert.equal(
    (await command(workspace, "heartbeat-plan", { plan: PLAN_PATH, session: "owner" })).phase,
    "planning",
  );
  await command(workspace, "release-plan", { plan: PLAN_PATH, session: "owner" });
  assert.equal(
    (await command(workspace, "claim-plan", { plan: PLAN_PATH, session: "new-owner" })).phase,
    "planning",
  );
  await assert.rejects(
    command(workspace, "claim-plan", { plan: PLAN_PATH, session: "another" }),
    /资源由会话 new-owner 持有/,
  );
});

test("issue commands reject invalid IDs, unready plans, missing runtime, and incomplete dependencies", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: ["01"] },
  ]);
  await enterPlan(workspace, {
    entry: "/questing",
    plan: PLAN_PATH,
    session: "owner",
  });
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "1" }),
    /两位 Issue ID/,
  );
  for (const issue of ["x01", "01x"]) {
    await assert.rejects(
      executeFlow({
        command: "claim-issue",
        options: { plan: PLAN_PATH, issue },
        workspace,
      }),
      { message: "--issue 必须是两位 Issue ID" },
    );
  }
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01" }),
    /尚未进入 Issue 交付阶段/,
  );
  await readyPlan(workspace, "owner").catch(() => undefined);

  const fresh = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: ["01"] },
  ]);
  await readyPlan(fresh);
  await assert.rejects(
    command(fresh, "claim-issue", { plan: PLAN_PATH, issue: "02" }),
    /直接依赖 01 尚未 completed/,
  );
  await assert.rejects(
    command(fresh, "record-issue", {
      plan: PLAN_PATH,
      issue: "01",
      session: "none",
      skill: "/code-delivery",
      result: "started",
      evidence: ["x"],
    }),
    /未被领取/,
  );
});

test("issue lease can resume, block twice, release, and requires delivery evidence", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  const claimed = await command(workspace, "claim-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "issue-owner",
  });
  assert.equal(claimed.next_skill, "/code-delivery");
  assert.equal(
    (
      await command(workspace, "claim-issue", {
        plan: PLAN_PATH,
        issue: "01",
        session: "issue-owner",
      })
    ).session,
    "issue-owner",
  );
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "other" }),
    /由会话 issue-owner 持有/,
  );
  await assert.rejects(
    command(workspace, "block-issue", {
      plan: PLAN_PATH,
      issue: "01",
      session: "issue-owner",
      reason: "",
      "release-condition": "条件",
    }),
    /缺少 --reason/,
  );
  await command(workspace, "block-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "issue-owner",
    reason: "依赖缺失",
    "release-condition": "依赖恢复",
  });
  const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.appendFile(issuePath, "\n## 后续记录\n\n必须保留。\n");
  await command(workspace, "resume-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "resumed",
  });
  await command(workspace, "block-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "resumed",
    reason: "第二障碍",
    "release-condition": "第二条件",
  });
  const issueContent = await fs.readFile(issuePath, "utf8");
  assert.equal(issueContent.match(/^## 阻塞记录$/gm)?.length, 1);
  assert.equal(issueContent.includes("依赖缺失"), false);
  assert.equal(issueContent.includes("中文交付内容。\n\n\n## 阻塞记录"), false);
  assert.ok(
    issueContent.endsWith(
      "## 阻塞记录\n\n- 障碍: 第二障碍\n- 解除条件: 第二条件\n## 后续记录\n\n必须保留。\n",
    ),
  );

  await command(workspace, "resume-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "delivery",
  });
  await command(workspace, "record-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "delivery",
    skill: "/code-delivery",
    result: "started",
    evidence: ["code"],
  });
  await assert.rejects(
    command(workspace, "record-issue", {
      plan: PLAN_PATH,
      issue: "01",
      session: "delivery",
      action: "commit",
      result: "committed",
      evidence: ["commit"],
    }),
    /交付物与验证证据/,
  );
});

test.each([
  ["empty section", "## 交付记录\n\n"],
  ["only delivery", "## 交付记录\n\n- 交付物: code\n"],
  ["only evidence", "## 交付记录\n\n- 证据: test\n"],
  ["JSON metadata", '## 交付记录\n\n{"交付物":"code","证据":"test"}\n'],
  ["spaced JSON metadata", '## 交付记录\n\n  {"交付物":"code","证据":"test"}  \n'],
  ["malformed heading", "x## 交付记录\n\n- 交付物: code\n- 证据: test\n"],
])("delivery evidence rejects %s", async (_name, section) => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await command(workspace, "claim-issue", {
    issue: "01",
    plan: PLAN_PATH,
    session: "delivery",
  });
  await command(workspace, "record-issue", {
    evidence: ["code"],
    issue: "01",
    plan: PLAN_PATH,
    result: "started",
    session: "delivery",
    skill: "/code-delivery",
  });
  const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.appendFile(issuePath, `\n${section}`);
  await assert.rejects(
    command(workspace, "record-issue", {
      action: "commit",
      evidence: ["commit"],
      issue: "01",
      plan: PLAN_PATH,
      result: "committed",
      session: "delivery",
    }),
    { message: "Issue 01 完成前必须写入交付物与验证证据" },
  );
});

test("sync-plan reconciles pending, completed, blocked, and in-progress issue documents", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: [] },
    { id: "03", dependencies: [] },
    { id: "04", dependencies: [] },
  ]);
  await readyPlan(workspace);
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "one" });
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "02", session: "two" });
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "03", session: "three" });
  await command(workspace, "release-issue", { plan: PLAN_PATH, issue: "01", session: "one" });

  const planRoot = path.join(workspace, PLAN_PATH);
  const setStatus = async (id, status) => {
    const issuePath = path.join(planRoot, `${id}-订单能力.md`);
    const content = await fs.readFile(issuePath, "utf8");
    await fs.writeFile(issuePath, content.replace(/^status: .*$/m, `status: ${status}`));
  };
  await setStatus("01", "pending");
  await setStatus("02", "completed");
  await setStatus("03", "blocked");
  await setStatus("04", "in_progress");
  const firstSync = await command(workspace, "sync-plan", { plan: PLAN_PATH });
  assert.deepEqual(firstSync, {
    phase: "delivering_issues",
    plan: PLAN_PATH,
    revision: 8,
    synced: true,
  });
  assert.deepEqual(await command(workspace, "sync-plan", { plan: PLAN_PATH }), firstSync);

  const status = await command(workspace, "status", { plan: PLAN_PATH });
  assert.equal(status.revision, 8);
  assert.deepEqual(status.plan.issues, {
    "02": { cursor: 2, lease: null, receipts: [], status: "completed" },
    "03": { cursor: 0, lease: null, receipts: [], status: "blocked" },
    "04": { cursor: 0, lease: null, receipts: [], status: "paused" },
  });
  assert.equal(status.plan.phase, "delivering_issues");
});

test("sync-plan persists an isolated pending runtime removal", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await command(workspace, "claim-issue", { issue: "01", plan: PLAN_PATH, session: "owner" });
  await command(workspace, "release-issue", { issue: "01", plan: PLAN_PATH, session: "owner" });
  const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.writeFile(
    issuePath,
    (await fs.readFile(issuePath, "utf8")).replace("status: in_progress", "status: pending"),
  );
  assert.deepEqual(await command(workspace, "sync-plan", { plan: PLAN_PATH }), {
    phase: "delivering_issues",
    plan: PLAN_PATH,
    revision: 6,
    synced: true,
  });
  assert.deepEqual((await command(workspace, "status", { plan: PLAN_PATH })).plan.issues, {});
});

test("sync-plan persists an isolated completed runtime", async () => {
  const workspace = await createWorkspace([
    { dependencies: [], id: "01" },
    { dependencies: [], id: "02" },
  ]);
  await readyPlan(workspace);
  await command(workspace, "claim-issue", { issue: "01", plan: PLAN_PATH, session: "owner" });
  const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.writeFile(
    issuePath,
    (await fs.readFile(issuePath, "utf8")).replace("status: in_progress", "status: completed"),
  );
  assert.deepEqual(await command(workspace, "sync-plan", { plan: PLAN_PATH }), {
    phase: "delivering_issues",
    plan: PLAN_PATH,
    revision: 5,
    synced: true,
  });
  assert.equal(
    (await command(workspace, "status", { plan: PLAN_PATH })).plan.issues["01"].status,
    "completed",
  );
});

test("unknown commands and sync without runtime return deterministic results", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(command(workspace, "unknown"), /未知命令 unknown/);
  assert.deepEqual(await command(workspace, "sync-plan", { plan: PLAN_PATH }), {
    plan: PLAN_PATH,
    revision: 0,
    synced: true,
  });
});

test.each([
  ["missing frontmatter", "plain text", /缺少 YAML frontmatter/],
  ["missing status", "---\nblocked_by: []\n---\n", /status 无效/],
  ["bad dependency json", "---\nstatus: pending\nblocked_by: nope\n---\n", /不是有效 JSON/],
  ["bad dependency shape", "---\nstatus: pending\nblocked_by: [1]\n---\n", /必须是两位 Issue ID/],
  ["bad dependency id", '---\nstatus: pending\nblocked_by: ["1"]\n---\n', /必须是两位 Issue ID/],
])("rejects issue document boundary: %s", async (_name, content, expected) => {
  const workspace = await createWorkspace();
  await fs.writeFile(path.join(workspace, PLAN_PATH, "01-订单能力.md"), content);
  await assert.rejects(command(workspace, "sync-plan", { plan: PLAN_PATH }), expected);
});

test("rejects an empty plan and a spec without an issue row", async () => {
  const emptyWorkspace = await createWorkspace();
  await fs.rm(path.join(emptyWorkspace, PLAN_PATH, "01-订单能力.md"));
  await assert.rejects(
    command(emptyWorkspace, "sync-plan", { plan: PLAN_PATH }),
    /没有 Issue 文件/,
  );

  const missingRow = await createWorkspace();
  await fs.writeFile(
    path.join(missingRow, PLAN_PATH, "spec.md"),
    "---\nstatus: pending\n---\n\n# No table\n",
  );
  await assert.rejects(command(missingRow, "sync-plan", { plan: PLAN_PATH }), /Issue 表缺少 01/);
});

test("ignores issue-like names that are not exact Markdown files", async () => {
  const workspace = await createWorkspace();
  const planRoot = path.join(workspace, PLAN_PATH);
  await fs.writeFile(path.join(planRoot, "x01-invalid.md"), "invalid");
  await fs.writeFile(path.join(planRoot, "01-invalid.md.bak"), "invalid");
  await fs.mkdir(path.join(planRoot, "02-directory.md"));
  const result = await executeFlow({
    command: "sync-plan",
    options: { plan: PLAN_PATH },
    workspace,
  });
  assert.equal(result.synced, true);
});

test("reports plan enumeration failures through the public command", async () => {
  const workspace = await createWorkspace();
  const planRoot = path.join(workspace, PLAN_PATH);
  await fs.rm(planRoot, { recursive: true });
  await fs.writeFile(planRoot, "not a directory");
  await assert.rejects(
    executeFlow({ command: "sync-plan", options: { plan: PLAN_PATH }, workspace }),
    { message: new RegExp(`^枚举 Plan ${planRoot.replaceAll("\\", "\\\\")} 失败:`, "u") },
  );
});

test("derives completed and mixed plan statuses", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [], status: "completed" },
    { id: "02", dependencies: [], status: "completed" },
  ]);
  await command(workspace, "sync-plan", { plan: PLAN_PATH });
  assert.match(
    await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8"),
    /^status: completed$/m,
  );
  const issue = path.join(workspace, PLAN_PATH, "02-订单能力.md");
  await fs.writeFile(
    issue,
    (await fs.readFile(issue, "utf8")).replace("status: completed", "status: blocked"),
  );
  await command(workspace, "sync-plan", { plan: PLAN_PATH });
  assert.match(
    await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8"),
    /^status: in_progress$/m,
  );
});

test("completes and re-enters the main Flow with a generated session", async () => {
  const workspace = await createWorkspace();
  const entered = await command(workspace, "enter-plan", {
    entry: "/questing",
    plan: "2026-08-27-main-flow",
    skill: "/nano-flow",
  });
  const session = entered.session;
  const plan = "2026-08-27-main-flow";
  await recordPlan(workspace, session, "questing", "completed", { plan });
  await recordPlan(workspace, session, "to-issues", "skipped", { plan });
  await recordPlan(workspace, session, "code-delivery", "started", { plan });
  await command(workspace, "record-plan", {
    action: "commit",
    evidence: ["abc"],
    plan,
    result: "committed",
    session,
  });
  assert.equal((await command(workspace, "status", { plan })).plan.phase, "completed");
  const restarted = await command(workspace, "enter-plan", {
    entry: "/questing",
    plan,
    skill: "/nano-flow",
  });
  assert.equal(restarted.next_skill, "/questing");
  assert.notEqual(restarted.session, session);
});

test("completes an issue and rejects a second claim", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "issue" });
  await command(workspace, "record-issue", {
    evidence: ["code"],
    issue: "01",
    plan: PLAN_PATH,
    result: "started",
    session: "issue",
    skill: "/code-delivery",
  });
  const issuePath = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.appendFile(issuePath, "\n## 交付记录\n\n- 交付物: code\n- 证据: tests\n");
  await command(workspace, "record-issue", {
    action: "commit",
    evidence: ["abc"],
    issue: "01",
    plan: PLAN_PATH,
    result: "committed",
    session: "issue",
  });
  assert.equal((await command(workspace, "status", { plan: PLAN_PATH })).plan.phase, "completed");
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "again" }),
    /尚未进入 Issue 交付阶段/,
  );
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "99", session: "again" }),
    /尚未进入 Issue 交付阶段/,
  );
});

test("completed issue and issue-delivery Plan cannot be reclaimed", async () => {
  const workspace = await createWorkspace([
    { dependencies: [], id: "01" },
    { dependencies: [], id: "02" },
  ]);
  await readyPlan(workspace);
  await command(workspace, "claim-issue", {
    issue: "01",
    plan: PLAN_PATH,
    session: "owner",
  });
  await command(workspace, "record-issue", {
    evidence: ["code"],
    issue: "01",
    plan: PLAN_PATH,
    result: "started",
    session: "owner",
    skill: "/code-delivery",
  });
  await fs.appendFile(
    path.join(workspace, PLAN_PATH, "01-订单能力.md"),
    "\n## 交付记录\n\n- 交付物: code\n- 证据: tests\n",
  );
  await command(workspace, "record-issue", {
    action: "commit",
    evidence: ["commit"],
    issue: "01",
    plan: PLAN_PATH,
    result: "committed",
    session: "owner",
  });

  await assert.rejects(
    command(workspace, "claim-issue", {
      issue: "01",
      plan: PLAN_PATH,
      session: "again",
    }),
    { message: "Issue 01 已完成" },
  );
  await assert.rejects(command(workspace, "claim-plan", { plan: PLAN_PATH, session: "again" }), {
    message: "已完成的流程不可重新领取",
  });
});

test("covers issue heartbeat, release, and missing runtime lease commands", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await assert.rejects(
    command(workspace, "heartbeat-issue", { plan: PLAN_PATH, issue: "01", session: "none" }),
    /没有运行态/,
  );
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "owner" });
  await assert.rejects(
    command(workspace, "release-issue", { plan: PLAN_PATH, issue: "01", session: "other" }),
    { message: "资源由会话 owner 持有" },
  );
  assert.equal(
    (
      await command(workspace, "heartbeat-issue", {
        plan: PLAN_PATH,
        issue: "01",
        session: "owner",
      })
    ).status,
    "active",
  );
  assert.equal(
    (await command(workspace, "release-issue", { plan: PLAN_PATH, issue: "01", session: "owner" }))
      .status,
    "paused",
  );
  assert.equal(
    (await command(workspace, "resume-issue", { plan: PLAN_PATH, issue: "01", session: "new" }))
      .next_skill,
    "/code-delivery",
  );
});
