import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";
import { executeFlow, runFlowCli } from "./flow.mjs";
import { verifyContract } from "./testing/script-contracts.mjs";

const PLAN_PATH = "docs/orders/plans/active/2026-08-22-订单流转";
const TEST_NOW = new Date(2026, 7, 27, 12);
const workspaces = [];

const issueDocument = (id, dependencies = [], status = "pending", body = "") => `---
status: ${status}
blocked_by: ${JSON.stringify(dependencies)}
---

# Issue ${id} 订单能力

中文交付内容。
${body}
`;

const specDocument = (issues, status = "pending") => `---
status: ${status}
---

# 订单流转

## Issue

| # | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
${issues
  .map(
    (issue) =>
      `| ${issue.id} | [Issue ${issue.id}](${issue.id}-订单能力.md) | ${issue.status ?? "pending"} | ${issue.dependencies.length === 0 ? "—" : issue.dependencies.join(", ")} | /implement |`,
  )
  .join("\n")}
`;

const createWorkspace = async (issues = [{ id: "01", dependencies: [] }]) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "loop-flow-boundary-"));
  workspaces.push(workspace);
  const planRoot = path.join(workspace, PLAN_PATH);
  await fs.mkdir(planRoot, { recursive: true });
  await fs.writeFile(path.join(planRoot, "spec.md"), specDocument(issues));
  for (const issue of issues) {
    await fs.writeFile(
      path.join(planRoot, `${issue.id}-订单能力.md`),
      issueDocument(issue.id, issue.dependencies, issue.status),
    );
  }
  return workspace;
};

const command = async (workspace, commandName, options = {}, now = () => new Date(TEST_NOW)) => {
  try {
    const result = await executeFlow({
      command: commandName,
      options,
      workspace,
      now,
    });
    verifyContract("flowBoundary", { ok: true, result }, workspace);
    return result;
  } catch (error) {
    verifyContract(
      "flowBoundary",
      { ok: false, error: { name: error?.name, message: error?.message } },
      workspace,
    );
    throw error;
  }
};

const recordPlan = (workspace, session, skill, result, extra = {}) =>
  command(workspace, "record-plan", {
    evidence: [`${skill}-${result}`],
    plan: PLAN_PATH,
    result,
    session,
    skill: `/${skill}`,
    ...extra,
  });

const readyPlan = async (workspace, session = "plan-session") => {
  await command(workspace, "init", { entry: "/to-story", plan: PLAN_PATH, session });
  await recordPlan(workspace, session, "to-story", "completed");
  await recordPlan(workspace, session, "grill-with-docs", "completed");
  await recordPlan(workspace, session, "to-issues", "completed");
  return recordPlan(workspace, session, "dev-gate", "ready");
};

const statePath = (workspace, date = TEST_NOW) => {
  const prefix = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
  return path.join(workspace, ".flow", "state", `${prefix}-state.json`);
};

const shiftedDate = (days) => new Date(new Date(TEST_NOW).setDate(TEST_NOW.getDate() + days));

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => fs.rm(workspace, { force: true, recursive: true })),
  );
});

test("状态文件使用本地日期前缀且不读取旧 state.json", async () => {
  const workspace = await createWorkspace();
  const stateDirectory = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateDirectory, { recursive: true });
  await fs.writeFile(
    path.join(stateDirectory, "state.json"),
    `${JSON.stringify({ plans: { legacy: {} }, revision: 99, schema_version: 4 })}\n`,
  );

  const initialized = await command(workspace, "init", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "dated-state-session",
  });

  assert.equal(initialized.revision, 1);
  const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  assert.deepEqual(Object.keys(state.plans), [PLAN_PATH]);
});

test("状态事务只清理三十天窗口之前的日期状态文件", async () => {
  const workspace = await createWorkspace();
  const stateDirectory = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateDirectory, { recursive: true });
  const expiredState = path.basename(statePath(workspace, shiftedDate(-30)));
  const oldestRetainedState = path.basename(statePath(workspace, shiftedDate(-29)));
  const recentState = path.basename(statePath(workspace, shiftedDate(-10)));
  const futureState = path.basename(statePath(workspace, shiftedDate(1)));
  for (const name of [expiredState, oldestRetainedState, recentState, futureState, "notes.json"]) {
    await fs.writeFile(path.join(stateDirectory, name), "{}\n");
  }

  await command(workspace, "init", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "retention-session",
  });

  const retainedNames = await fs.readdir(stateDirectory);
  assert.ok(!retainedNames.includes(expiredState));
  assert.ok(!retainedNames.includes(futureState));
  assert.ok(retainedNames.includes(oldestRetainedState));
  assert.ok(retainedNames.includes(recentState));
  assert.ok(retainedNames.includes(path.basename(statePath(workspace))));
  assert.ok(retainedNames.includes("notes.json"));
});

test("CLI wrapper renders help, parses repeated evidence, and returns JSON errors", async () => {
  const workspace = await createWorkspace();
  const help = [];
  assert.equal(await runFlowCli({ argumentsList: [], stdout: (message) => help.push(message) }), 0);
  assert.ok(help[0].includes("flow.mjs init"));

  const stdout = [];
  assert.equal(
    await runFlowCli({
      argumentsList: [
        "init",
        "--workspace",
        workspace,
        "--plan",
        PLAN_PATH,
        "--entry",
        "/to-story",
        "--session",
        "cli-session",
        "--evidence",
        "first",
        "--evidence",
        "second",
      ],
      stdout: (message) => stdout.push(message),
    }),
    0,
  );
  assert.equal(JSON.parse(stdout[0]).success, true);

  for (const argumentsList of [["unknown"], ["init", "positional"], ["init", "--plan"]]) {
    const stderr = [];
    assert.equal(await runFlowCli({ argumentsList, stderr: (message) => stderr.push(message) }), 1);
    assert.equal(JSON.parse(stderr[0]).success, false);
  }
});

test.each([
  ["缺少 option", {}, "缺少 --plan"],
  ["非法 entry", { entry: "/invalid", plan: PLAN_PATH, session: "s" }, "--entry 必须是"],
  [
    "过短 lease",
    { entry: "/to-story", plan: PLAN_PATH, session: "s", "lease-seconds": "29" },
    "--lease-seconds",
  ],
  [
    "过长 lease",
    { entry: "/to-story", plan: PLAN_PATH, session: "s", "lease-seconds": "86401" },
    "--lease-seconds",
  ],
  [
    "非整数 lease",
    { entry: "/to-story", plan: PLAN_PATH, session: "s", "lease-seconds": "30.5" },
    "--lease-seconds",
  ],
  [
    "工作区外 plan",
    { entry: "/to-story", plan: "../outside", session: "s" },
    "--plan 必须位于工作区内",
  ],
])("init 拒绝%s", async (_name, options, expected) => {
  const workspace = await createWorkspace();
  await assert.rejects(command(workspace, "init", options), new RegExp(expected));
});

test("init applies default and boundary leases, rejects duplicates, and exposes status", async () => {
  const workspace = await createWorkspace();
  const now = () => new Date("2026-08-27T00:00:00.000Z");
  const initialized = await command(
    workspace,
    "init",
    { entry: "/to-story", plan: PLAN_PATH, session: "session", "lease-seconds": "30" },
    now,
  );
  assert.equal(initialized.session, "session");
  await assert.rejects(
    command(workspace, "init", { entry: "/to-story", plan: PLAN_PATH, session: "other" }, now),
    /已经初始化/,
  );
  assert.ok((await command(workspace, "status")).plans[PLAN_PATH]);
  assert.equal((await command(workspace, "status", { plan: PLAN_PATH })).plan.plan_path, PLAN_PATH);
  await assert.rejects(command(workspace, "status", { plan: "missing" }), /尚未初始化/);
});

test.each([
  ["null", null],
  ["empty", {}],
  ["unsupported schema", { schema_version: 99, revision: 0, plans: {} }],
  ["legacy schema", { schema_version: 3, revision: 0, plans: {} }],
  ["fractional revision", { schema_version: 4, revision: 0.5, plans: {} }],
  ["null plans", { schema_version: 4, revision: 0, plans: null }],
  ["array plans", { schema_version: 4, revision: 0, plans: [] }],
])("rejects invalid persisted state: %s", async (_name, state) => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow", "state"), { recursive: true });
  await fs.writeFile(statePath(workspace), JSON.stringify(state));
  await assert.rejects(command(workspace, "status"), /格式无效或版本不受支持/);
});

test("reports malformed JSON and removes a stale state lock", async () => {
  const workspace = await createWorkspace();
  const stateRoot = path.join(workspace, ".flow", "state");
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(statePath(workspace), "{");
  await assert.rejects(command(workspace, "status"), /解析 .*state.json 失败/);

  await fs.writeFile(
    statePath(workspace),
    JSON.stringify({ schema_version: 4, revision: 0, plans: {} }),
  );
  const lockPath = path.join(stateRoot, "state.lock");
  await fs.writeFile(lockPath, JSON.stringify({ nonce: "stale" }));
  const stale = new Date("2026-08-26T00:00:00.000Z");
  await fs.utimes(lockPath, stale, stale);
  assert.deepEqual(
    (await command(workspace, "status", {}, () => new Date("2026-08-27T00:00:00.000Z"))).plans,
    {},
  );
});

test("enter-plan validates initiators, entries, sessions, and completed Flow reuse", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(
    command(workspace, "enter-plan", { skill: "/invalid", plan: PLAN_PATH }),
    /--skill 必须是/,
  );
  await assert.rejects(
    command(workspace, "enter-plan", { skill: "/loop-x", entry: "/invalid", plan: PLAN_PATH }),
    /--entry 必须是/,
  );
  await assert.rejects(
    command(workspace, "enter-plan", {
      skill: "/grill-with-docs",
      entry: "/to-story",
      plan: PLAN_PATH,
    }),
    /只有 \/loop-x 可以指定 --entry/,
  );
  await assert.rejects(command(workspace, "enter-plan", { skill: "/to-issues" }), /--skill 必须是/);

  const entered = await command(workspace, "enter-plan", {
    skill: "/loop-x",
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "owner",
  });
  assert.equal(entered.next_skill, "/to-story");
  await assert.rejects(
    command(workspace, "enter-plan", { skill: "/to-story", plan: PLAN_PATH, session: "other" }),
    /资源由会话 owner 持有/,
  );
  assert.equal(
    (
      await command(workspace, "enter-plan", {
        skill: "/to-story",
        plan: PLAN_PATH,
        session: "owner",
      })
    ).session,
    "owner",
  );
});

test("record-plan rejects wrong order, result, evidence, lease, and exhausted Flow", async () => {
  const workspace = await createWorkspace();
  await command(workspace, "init", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "owner",
  });
  await assert.rejects(
    recordPlan(workspace, "other", "to-story", "completed"),
    /资源由会话 owner 持有/,
  );
  await assert.rejects(recordPlan(workspace, "owner", "dev-gate", "ready"), /步骤顺序错误/);
  await assert.rejects(
    recordPlan(workspace, "owner", "to-story", "invalid"),
    /result 必须是 completed/,
  );
  await assert.rejects(
    command(workspace, "record-plan", {
      plan: PLAN_PATH,
      result: "completed",
      session: "owner",
      skill: "/to-story",
    }),
    /至少需要一个 --evidence/,
  );

  await recordPlan(workspace, "owner", "to-story", "completed");
  await recordPlan(workspace, "owner", "grill-with-docs", "completed");
  await recordPlan(workspace, "owner", "to-issues", "completed");
  await recordPlan(workspace, "owner", "dev-gate", "ready");
  await assert.rejects(recordPlan(workspace, "owner", "dev-gate", "ready"), /租约不存在或已经过期/);
});

test("lease commands heartbeat, release, reclaim, and enforce owners", async () => {
  const workspace = await createWorkspace();
  await command(workspace, "init", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "owner",
  });
  await assert.rejects(
    command(workspace, "heartbeat-plan", { plan: PLAN_PATH, session: "other" }),
    /资源由会话 owner 持有/,
  );
  assert.equal(
    (await command(workspace, "heartbeat-plan", { plan: PLAN_PATH, session: "owner" })).status,
    "active",
  );
  await command(workspace, "release-plan", { plan: PLAN_PATH, session: "owner" });
  assert.equal(
    (await command(workspace, "claim-plan", { plan: PLAN_PATH, session: "new-owner" })).status,
    "active",
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
  await command(workspace, "init", {
    entry: "/to-story",
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
    /尚未通过 \/dev-gate/,
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
      skill: "/implement",
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
  assert.equal(claimed.next_skill, "/implement");
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
  const issueContent = await fs.readFile(path.join(workspace, PLAN_PATH, "01-订单能力.md"), "utf8");
  assert.equal(issueContent.match(/^## 阻塞记录$/gm)?.length, 1);

  await command(workspace, "resume-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "delivery",
  });
  await command(workspace, "record-issue", {
    plan: PLAN_PATH,
    issue: "01",
    session: "delivery",
    skill: "/implement",
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
  assert.equal((await command(workspace, "sync-plan", { plan: PLAN_PATH })).synced, true);

  const status = (await command(workspace, "status", { plan: PLAN_PATH })).plan;
  assert.equal(status.issues["01"], undefined);
  assert.equal(status.issues["02"].status, "completed");
  assert.equal(status.issues["03"].status, "blocked");
  assert.equal(status.issues["04"].status, "paused");
});

test("unknown commands and sync without runtime return deterministic results", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(command(workspace, "unknown"), /未知命令 unknown/);
  assert.equal((await command(workspace, "sync-plan", { plan: PLAN_PATH })).synced, true);
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
    skill: "/grill-with-docs",
    plan: "2026-08-27-main-flow",
  });
  const session = entered.session;
  const plan = "2026-08-27-main-flow";
  await recordPlan(workspace, session, "grill-with-docs", "completed", { plan });
  await recordPlan(workspace, session, "to-issues", "skipped", { plan });
  await recordPlan(workspace, session, "dev-gate", "ready", { plan });
  await recordPlan(workspace, session, "implement", "started", { plan });
  await command(workspace, "record-plan", {
    action: "commit",
    evidence: ["abc"],
    plan,
    result: "committed",
    session,
  });
  assert.equal((await command(workspace, "status", { plan })).plan.setup.status, "completed");
  const restarted = await command(workspace, "enter-plan", { skill: "/grill-with-docs", plan });
  assert.equal(restarted.next_skill, "/grill-with-docs");
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
    skill: "/implement",
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
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "again" }),
    /已完成/,
  );
  await assert.rejects(
    command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "99", session: "again" }),
    /不存在 Issue 99/,
  );
});

test("covers issue heartbeat, release, and missing runtime lease commands", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await assert.rejects(
    command(workspace, "heartbeat-issue", { plan: PLAN_PATH, issue: "01", session: "none" }),
    /没有运行态/,
  );
  await command(workspace, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "owner" });
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
    "/implement",
  );
});

test("CLI wrapper supports explicit help aliases and default dependency callbacks", async () => {
  for (const alias of ["help", "--help", "-h"]) {
    const output = [];
    assert.equal(
      await runFlowCli({ argumentsList: [alias], stdout: (message) => output.push(message) }),
      0,
    );
    assert.match(output[0], /flow\.mjs init/);
  }
  const originalArgv = process.argv;
  process.argv = [process.execPath, "vitest", "unknown-default-command"];
  try {
    assert.equal(await runFlowCli({}), 1);
  } finally {
    process.argv = originalArgv;
  }
});

test("reports a non-missing state read failure", async () => {
  const workspace = await createWorkspace();
  await fs.mkdir(statePath(workspace), { recursive: true });
  await assert.rejects(command(workspace, "status"), /读取 .*state.json 失败/);
});

test("rejects flow issue frontmatter with missing fields", async () => {
  const missingDependency = await createWorkspace();
  const issuePath = path.join(missingDependency, PLAN_PATH, "01-订单能力.md");
  await fs.writeFile(issuePath, "---\nstatus: pending\n---\n\n中文\n");
  await assert.rejects(
    command(missingDependency, "sync-plan", { plan: PLAN_PATH }),
    /blocked_by 不是有效 JSON/,
  );

  const missingSpecStatus = await createWorkspace();
  await fs.writeFile(
    path.join(missingSpecStatus, PLAN_PATH, "spec.md"),
    specDocument([{ id: "01", dependencies: [] }]).replace("status: pending", "other: value"),
  );
  await assert.rejects(
    command(missingSpecStatus, "sync-plan", { plan: PLAN_PATH }),
    /spec.md 缺少 status/,
  );
});

test("rejects completed issues and dependencies absent from the plan", async () => {
  const completed = await createWorkspace([{ id: "01", dependencies: [], status: "completed" }]);
  await readyPlan(completed);
  await assert.rejects(
    command(completed, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "x" }),
    /当前状态 completed 不可领取/,
  );

  const missingDependency = await createWorkspace([{ id: "01", dependencies: ["99"] }]);
  await readyPlan(missingDependency);
  await assert.rejects(
    command(missingDependency, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "x" }),
    /直接依赖 99 尚未 completed/,
  );
});

test("rejects record and block operations without their runtime subjects", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(
    command(workspace, "record-plan", {
      plan: PLAN_PATH,
      session: "x",
      skill: "/to-issues",
      result: "started",
      evidence: ["x"],
    }),
    /尚未初始化/,
  );
  await assert.rejects(
    command(workspace, "block-issue", {
      plan: PLAN_PATH,
      issue: "01",
      session: "x",
      reason: "x",
      "release-condition": "y",
    }),
    /未被领取/,
  );
});

test("rejects entering or recording an exhausted setup", async () => {
  const workspace = await createWorkspace();
  await readyPlan(workspace);
  await assert.rejects(
    command(workspace, "enter-plan", {
      skill: "/grill-with-docs",
      plan: PLAN_PATH,
      session: "plan-session",
    }),
    /当前期望 无后续 skill/,
  );

  const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  state.plans[PLAN_PATH].setup.status = "active";
  state.plans[PLAN_PATH].setup.lease = {
    owner_session: "owner",
    expires_at: "2999-01-01T00:00:00.000Z",
  };
  await fs.writeFile(statePath(workspace), JSON.stringify(state));
  await assert.rejects(
    command(workspace, "record-plan", {
      plan: PLAN_PATH,
      session: "owner",
      action: "commit",
      result: "committed",
      evidence: ["x"],
    }),
    /没有待执行 skill/,
  );
});

test("sync creates completed and blocked runtime defaults", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [], status: "completed" },
    { id: "02", dependencies: [], status: "blocked" },
  ]);
  await command(workspace, "init", {
    entry: "/to-story",
    plan: PLAN_PATH,
    session: "owner",
  });
  await command(workspace, "sync-plan", { plan: PLAN_PATH });
  const plan = (await command(workspace, "status", { plan: PLAN_PATH })).plan;
  assert.deepEqual(plan.issues["01"].receipts, []);
  assert.equal(plan.issues["01"].status, "completed");
  assert.deepEqual(plan.issues["02"].receipts, []);
  assert.equal(plan.issues["02"].cursor, 0);
  assert.equal(plan.issues["02"].status, "blocked");
});
