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
  recordPlan,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const snapshot = async (workspace) =>
  Promise.all(
    [
      statePath(workspace),
      path.join(workspace, PLAN_PATH, "spec.md"),
      path.join(workspace, PLAN_PATH, "01-订单能力.md"),
    ].map((file) => fs.readFile(file, "utf8")),
  );

test("stable state survives midnight and leaves daily files untouched", async () => {
  const workspace = await createWorkspace();
  const legacyRoot = path.join(workspace, ".flow", "state");
  await fs.mkdir(legacyRoot, { recursive: true });
  const legacy = path.join(legacyRoot, "2026-08-27-state.json");
  await fs.writeFile(legacy, "legacy data");
  await command(workspace, "acquire", { plan: PLAN_PATH, session: "old" });
  await recordPlan(workspace, "old", "questing", "completed");
  const tomorrow = () => new Date(TEST_NOW.getTime() + 86_400_000);
  const resumed = await command(
    workspace,
    "acquire",
    { plan: PLAN_PATH, session: "new" },
    tomorrow,
  );
  assert.equal(resumed.next.skill, "/to-issues");
  assert.equal(resumed.receipts.length, 1);
  assert.equal(await fs.readFile(legacy, "utf8"), "legacy data");
  assert.equal(statePath(workspace), path.join(workspace, ".flow", "state.json"));
});

test.each(["29", "86401", "30.5", "NaN"])(
  "invalid lease %s leaves files unchanged on Issue acquire",
  async (lease) => {
    const workspace = await createWorkspace();
    await readyIssuePlan(workspace);
    const before = await snapshot(workspace);
    await assert.rejects(
      command(workspace, "acquire", {
        plan: PLAN_PATH,
        issue: "01",
        session: "owner",
        "lease-seconds": lease,
      }),
      /lease-seconds/,
    );
    assert.deepEqual(await snapshot(workspace), before);
  },
);

test.each([
  { step: "/to-issues", result: "completed", evidence: ["out of order"] },
  { step: "/questing", result: "completed" },
  { step: "/questing", result: "completed", evidence: [" "] },
  { step: "/questing", result: "skipped", evidence: ["invalid result"] },
  { step: "/code-delivery", result: "started", evidence: ["removed step"] },
])("invalid report does not mutate state or documents: %j", async (options) => {
  const workspace = await createWorkspace();
  await command(workspace, "acquire", { plan: PLAN_PATH, session: "owner" });
  const before = await snapshot(workspace);
  await assert.rejects(
    command(workspace, "report", { plan: PLAN_PATH, session: "owner", ...options }),
  );
  assert.deepEqual(await snapshot(workspace), before);
});

test("missing spec row fails before Issue acquisition changes any file", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await fs.writeFile(
    path.join(workspace, PLAN_PATH, "spec.md"),
    "---\nstatus: pending\n---\n\n# Missing table\n",
  );
  const before = await snapshot(workspace);
  await assert.rejects(
    command(workspace, "acquire", { plan: PLAN_PATH, issue: "01", session: "owner" }),
    /Issue 表|01/,
  );
  assert.deepEqual(await snapshot(workspace), before);
});

test("status reads Issue facts without repairing the spec", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  const issue = path.join(workspace, PLAN_PATH, "01-订单能力.md");
  await fs.writeFile(
    issue,
    (await fs.readFile(issue, "utf8")).replace("status: pending", "status: completed"),
  );
  const before = await snapshot(workspace);
  const result = await command(workspace, "status", { plan: PLAN_PATH });
  assert.equal(result.state, "completed");
  assert.equal(result.issues[0].status, "completed");
  assert.deepEqual(await snapshot(workspace), before);
});

test.each(["../outside", "../../elsewhere"])(
  "workspace traversal is rejected: %s",
  async (plan) => {
    const workspace = await createWorkspace();
    await assert.rejects(command(workspace, "acquire", { plan }), /工作区/);
    await assert.rejects(fs.access(statePath(workspace)));
  },
);

test.each([
  "plain text",
  "---\nblocked_by: []\n---\n",
  "---\nstatus: pending\nblocked_by: nope\n---\n",
  "---\nstatus: pending\nblocked_by: [1]\n---\n",
])("invalid Issue documents fail before Issue delivery: %j", async (content) => {
  const workspace = await createWorkspace();
  await command(workspace, "acquire", { plan: PLAN_PATH, session: "owner" });
  await recordPlan(workspace, "owner", "questing", "completed");
  await fs.writeFile(path.join(workspace, PLAN_PATH, "01-订单能力.md"), content);
  const before = await snapshot(workspace);
  await assert.rejects(recordPlan(workspace, "owner", "to-issues", "completed"));
  assert.deepEqual(await snapshot(workspace), before);
});
