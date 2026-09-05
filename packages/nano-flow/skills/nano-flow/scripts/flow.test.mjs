import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";
import {
  addDeliveryEvidence,
  cleanupWorkspaces,
  command,
  createWorkspace,
  issuePath,
  PLAN_PATH,
  readyIssuePlan,
  recordIssue,
  recordPlan,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const acquire = (workspace, options = {}, now) =>
  command(workspace, "acquire", { plan: PLAN_PATH, ...options }, now);
const status = (workspace, options = {}, now) =>
  command(workspace, "status", { plan: PLAN_PATH, ...options }, now);
const afterSeconds = (seconds) => () => new Date(TEST_NOW.getTime() + seconds * 1000);

test("直接交付只需三个 skill receipt，完成后不会自动重开", async () => {
  const workspace = await createWorkspace();
  const entered = await acquire(workspace);
  assert.equal(typeof entered.session, "string");
  assert.ok(entered.session.length > 0);
  assert.equal(entered.plan, PLAN_PATH);
  assert.equal(entered.issue, null);
  assert.equal(entered.mode, "manual");
  assert.equal(entered.state, "owned");
  assert.equal(entered.next.skill, "/questing");
  assert.deepEqual(entered.next.results, ["completed"]);
  const planning = await recordPlan(workspace, entered.session, "questing", "completed");
  assert.equal(planning.next.skill, "/to-issues");
  assert.deepEqual(planning.next.results, ["completed", "skipped"]);
  const delivery = await recordPlan(workspace, entered.session, "to-issues", "skipped");
  assert.equal(delivery.next.skill, "/code-delivery");
  const completed = await recordPlan(workspace, entered.session, "code-delivery", "completed");
  assert.equal(completed.state, "completed");
  assert.equal(completed.next, null);
  assert.equal(completed.lease, null);
  assert.deepEqual(
    completed.receipts.map(({ step }) => step),
    ["/questing", "/to-issues", "/code-delivery"],
  );
  const reopened = await acquire(workspace);
  assert.equal(reopened.state, "completed");
  assert.equal(reopened.receipts.length, 3);
});

test("status 只读展示下一步，不授予租约或修改文件", async () => {
  const workspace = await createWorkspace();
  await acquire(workspace, { session: "owner" });
  const before = await fs.readFile(statePath(workspace), "utf8");
  const outsider = await status(workspace, { session: "outsider" });
  assert.equal(outsider.state, "busy");
  assert.equal(outsider.next.skill, "/questing");
  assert.equal((await status(workspace, { session: "owner" })).state, "owned");
  assert.equal(await fs.readFile(statePath(workspace), "utf8"), before);
  await assert.rejects(recordPlan(workspace, "outsider", "questing", "completed"));
});

test("步骤乱序、重复及缺少证据均不推进", async () => {
  const workspace = await createWorkspace();
  await acquire(workspace, { session: "owner" });
  await assert.rejects(recordPlan(workspace, "owner", "to-issues", "skipped"));
  await assert.rejects(recordPlan(workspace, "owner", "questing", "skipped"));
  await assert.rejects(recordPlan(workspace, "owner", "questing", "completed", { evidence: [] }));
  assert.equal((await status(workspace)).receipts.length, 0);
  await recordPlan(workspace, "owner", "questing", "completed");
  await assert.rejects(recordPlan(workspace, "owner", "questing", "completed"));
  const current = await status(workspace);
  assert.equal(current.next.skill, "/to-issues");
  assert.equal(current.receipts.length, 1);
});

test("同 session 续租，过期接管拒绝旧 owner 并保留步骤", async () => {
  const workspace = await createWorkspace();
  const initial = await acquire(workspace, { session: "first", "lease-seconds": "30" });
  const renewed = await acquire(
    workspace,
    { session: "first", "lease-seconds": "30" },
    afterSeconds(20),
  );
  assert.ok(Date.parse(renewed.lease.expires_at) > Date.parse(initial.lease.expires_at));
  await assert.rejects(acquire(workspace, { session: "second" }, afterSeconds(40)));
  const taken = await acquire(workspace, { session: "second" }, afterSeconds(51));
  assert.equal(taken.state, "owned");
  assert.equal(taken.next.skill, "/questing");
  await assert.rejects(
    command(
      workspace,
      "report",
      {
        plan: PLAN_PATH,
        session: "first",
        step: "/questing",
        result: "completed",
        evidence: ["spec"],
      },
      afterSeconds(52),
    ),
  );
});

test("暂停不需要步骤或证据，恢复保留 receipt 和下一步", async () => {
  const workspace = await createWorkspace();
  await acquire(workspace, { session: "first" });
  await recordPlan(workspace, "first", "questing", "completed");
  const paused = await command(workspace, "report", {
    plan: PLAN_PATH,
    session: "first",
    result: "paused",
  });
  assert.equal(paused.state, "available");
  assert.equal(paused.lease, null);
  assert.equal(paused.receipts.length, 1);
  const resumed = await acquire(workspace, { session: "second" });
  assert.equal(resumed.state, "owned");
  assert.equal(resumed.next.skill, "/to-issues");
  assert.equal(resumed.receipts.length, 1);
});

test("有效步骤登记自动续租，后续工作无需单独 heartbeat", async () => {
  const workspace = await createWorkspace();
  await acquire(workspace, { session: "worker", "lease-seconds": "30" });
  const next = await command(
    workspace,
    "report",
    {
      plan: PLAN_PATH,
      session: "worker",
      step: "/questing",
      result: "completed",
      evidence: ["确认后的设计"],
      "lease-seconds": "30",
    },
    afterSeconds(20),
  );
  assert.equal(next.next.skill, "/to-issues");
  assert.equal(Date.parse(next.lease.expires_at), TEST_NOW.getTime() + 50000);
  assert.equal((await status(workspace, { session: "worker" }, afterSeconds(40))).state, "owned");
  await assert.rejects(acquire(workspace, { session: "other" }, afterSeconds(40)));
});

test("跨日接管 Issue 保留执行状态和已有 Plan receipt", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await acquire(workspace, { issue: "01", session: "yesterday" });
  const resumed = await acquire(workspace, { issue: "01", session: "today" }, afterSeconds(86400));
  assert.equal(resumed.next.skill, "/code-delivery");
  assert.equal(resumed.state, "owned");
  assert.equal(resumed.receipts.length, 2);
  assert.equal(resumed.issues[0].status, "in_progress");
  await assert.rejects(
    command(
      workspace,
      "report",
      {
        plan: PLAN_PATH,
        issue: "01",
        session: "yesterday",
        result: "paused",
      },
      afterSeconds(86401),
    ),
  );
});

test("跨日读取同一运行态，模式持续保存且不允许原地切换", async () => {
  const workspace = await createWorkspace();
  await acquire(workspace, { session: "first", mode: "auto" });
  await recordPlan(workspace, "first", "questing", "completed");
  const tomorrow = afterSeconds(86400);
  const current = await status(workspace, {}, tomorrow);
  assert.equal(current.state, "available");
  assert.equal(current.mode, "auto");
  assert.equal(current.next.skill, "/to-issues");
  const resumed = await acquire(workspace, { session: "second" }, tomorrow);
  assert.equal(resumed.mode, "auto");
  const before = await fs.readFile(statePath(workspace), "utf8");
  await assert.rejects(acquire(workspace, { session: "second", mode: "manual" }, tomorrow));
  assert.equal(await fs.readFile(statePath(workspace), "utf8"), before);
  assert.equal((await status(workspace, {}, tomorrow)).mode, "auto");
});

test("Issue 集合从文档生成 frontier，完成依赖才允许领取下游", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: ["01"] },
  ]);
  const hub = await readyIssuePlan(workspace);
  assert.equal(hub.state, "issues");
  assert.equal(hub.next, null);
  assert.equal(hub.lease, null);
  assert.deepEqual(
    hub.issues.map(({ id, ready }) => [id, ready]),
    [
      ["01", true],
      ["02", false],
    ],
  );
  assert.equal((await acquire(workspace)).state, "issues");
  await assert.rejects(acquire(workspace, { issue: "02", session: "worker" }));
  const first = await acquire(workspace, { issue: "01", session: "worker" });
  assert.equal(first.next.skill, "/code-delivery");
  assert.equal(first.state, "owned");
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: in_progress/);
  await addDeliveryEvidence(workspace, "01");
  const finished = await recordIssue(workspace, "01", "worker", "code-delivery", "completed");
  assert.equal(finished.state, "completed");
  assert.equal(finished.lease, null);
  assert.equal(finished.receipts.filter(({ issue }) => issue === "01").length, 1);
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: completed/);
  assert.match(
    await fs.readFile(path.join(workspace, PLAN_PATH, "spec.md"), "utf8"),
    /\| 01 \| .* \| completed \|/,
  );
  assert.equal((await acquire(workspace, { issue: "02", session: "worker" })).state, "owned");
  await addDeliveryEvidence(workspace, "02");
  await recordIssue(workspace, "02", "worker", "code-delivery", "completed");
  assert.equal((await status(workspace)).state, "completed");
});

test("独立 Issue 可以并行，但一个 session 只能持有一个有效 Issue 租约", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: [] },
  ]);
  await readyIssuePlan(workspace);
  await acquire(workspace, { issue: "01", session: "worker-a" });
  await assert.rejects(acquire(workspace, { issue: "01", session: "worker-b" }));
  await assert.rejects(acquire(workspace, { issue: "02", session: "worker-a" }));
  assert.equal((await acquire(workspace, { issue: "02", session: "worker-b" })).state, "owned");
  const current = await status(workspace);
  assert.deepEqual(
    current.issues.map(({ status: execution }) => execution),
    ["in_progress", "in_progress"],
  );
});

test("同时抢占一个 Issue 仅一个调用成功", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  const attempts = await Promise.allSettled([
    acquire(workspace, { issue: "01", session: "worker-a" }),
    acquire(workspace, { issue: "01", session: "worker-b" }),
  ]);
  assert.equal(attempts.filter(({ status: outcome }) => outcome === "fulfilled").length, 1);
  assert.equal(attempts.filter(({ status: outcome }) => outcome === "rejected").length, 1);
});

test("Issue 暂停保持 in_progress，释放 session 后可领取其他 Issue", async () => {
  const workspace = await createWorkspace([
    { id: "01", dependencies: [] },
    { id: "02", dependencies: [] },
  ]);
  await readyIssuePlan(workspace);
  await acquire(workspace, { issue: "01", session: "worker" });
  const paused = await command(workspace, "report", {
    plan: PLAN_PATH,
    issue: "01",
    session: "worker",
    result: "paused",
  });
  assert.equal(paused.state, "available");
  assert.equal(paused.next.skill, "/code-delivery");
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: in_progress/);
  assert.equal((await acquire(workspace, { issue: "02", session: "worker" })).state, "owned");
});

test("Issue 阻塞释放租约，解除障碍必须提供新证据", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await acquire(workspace, { issue: "01", session: "worker" });
  const blocked = await command(workspace, "report", {
    plan: PLAN_PATH,
    issue: "01",
    session: "worker",
    result: "blocked",
    reason: "缺少接口契约",
    "release-condition": "接口契约确认",
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.lease, null);
  const document = await fs.readFile(issuePath(workspace, "01"), "utf8");
  assert.match(document, /status: blocked/);
  assert.match(document, /缺少接口契约/);
  assert.match(document, /接口契约确认/);
  await assert.rejects(acquire(workspace, { issue: "01", session: "next" }));
  const resumed = await acquire(workspace, {
    issue: "01",
    session: "next",
    evidence: ["docs/api.md 已确认"],
  });
  assert.equal(resumed.state, "owned");
  assert.equal(resumed.next.skill, "/code-delivery");
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: in_progress/);
});

test("Issue 完成前需要文档交付物与验证证据，失败后仍可补充再登记", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await acquire(workspace, { issue: "01", session: "worker" });
  const before = await fs.readFile(statePath(workspace), "utf8");
  await assert.rejects(recordIssue(workspace, "01", "worker", "code-delivery", "completed"));
  assert.equal(await fs.readFile(statePath(workspace), "utf8"), before);
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: in_progress/);
  await addDeliveryEvidence(workspace, "01");
  assert.equal(
    (await recordIssue(workspace, "01", "worker", "code-delivery", "completed")).state,
    "completed",
  );
});

test("文档导入 completed 无需伪造 receipt，也不可重新领取", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await addDeliveryEvidence(workspace, "01");
  const file = issuePath(workspace, "01");
  const content = await fs.readFile(file, "utf8");
  await fs.writeFile(file, content.replace("status: pending", "status: completed"));
  const imported = await status(workspace, { issue: "01" });
  assert.equal(imported.state, "completed");
  assert.equal(imported.next, null);
  assert.deepEqual(
    imported.receipts.filter(({ issue }) => issue === "01"),
    [],
  );
  assert.equal((await status(workspace)).state, "completed");
  assert.equal((await acquire(workspace, { issue: "01" })).state, "completed");
  assert.match(await fs.readFile(file, "utf8"), /status: completed/);
});
