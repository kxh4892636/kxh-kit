import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";

import {
  cleanupWorkspaces,
  command,
  createWorkspace,
  PLAN_PATH,
  readyIssuePlan,
  specDocument,
  statePath,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const enterPlan = (workspace, options = {}) =>
  command(workspace, "enter-plan", { skill: "/nano-flow", ...options });

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
  await readyIssuePlan(completed);
  await assert.rejects(
    command(completed, "claim-issue", { plan: PLAN_PATH, issue: "01", session: "x" }),
    /当前状态 completed 不可领取/,
  );

  const missingDependency = await createWorkspace([{ id: "01", dependencies: ["99"] }]);
  await readyIssuePlan(missingDependency);
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

test("rejects entering or recording an exhausted planning phase", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await assert.rejects(
    command(workspace, "enter-plan", {
      skill: "/quest-with-domain",
      plan: PLAN_PATH,
      session: "plan-session",
    }),
    /当前期望 无后续 skill/,
  );

  const state = JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  state.plans[PLAN_PATH].phase = "planning";
  state.plans[PLAN_PATH].cursor = 4;
  state.plans[PLAN_PATH].lease = {
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
  await enterPlan(workspace, {
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
  assert.equal(plan.phase, "planning");
});
