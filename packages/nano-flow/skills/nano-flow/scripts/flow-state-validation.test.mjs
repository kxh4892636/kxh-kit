import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";

import {
  cleanupWorkspaces,
  command,
  createWorkspace,
  PLAN_PATH,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const writeState = async (workspace, state) => {
  await fs.mkdir(path.dirname(statePath(workspace)), { recursive: true });
  await fs.writeFile(statePath(workspace), JSON.stringify(state));
};
const validPlan = () => ({ mode: "manual", receipts: [], leases: {} });
const stateWith = (plan) => ({ schema_version: 8, plans: { [PLAN_PATH]: plan } });
const receipt = () => ({
  issue: null,
  step: "/questing",
  result: "completed",
  evidence: ["story.md"],
  recorded_at: TEST_NOW.toISOString(),
});

test.each([
  null,
  { schema_version: 6, plans: {} },
  { schema_version: 7, plans: {} },
  { schema_version: 99, plans: {} },
  { schema_version: 8, plans: null },
  { schema_version: 8, plans: [] },
  { schema_version: 8, plans: 1 },
])("invalid or obsolete schema is rejected without overwriting: %j", async (state) => {
  const workspace = await createWorkspace();
  await writeState(workspace, state);
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }), /状态|版本|schema/);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath(workspace), "utf8")), state);
});

test.each([
  null,
  { ...validPlan(), mode: "turbo" },
  { ...validPlan(), receipts: 1 },
  { ...validPlan(), leases: null },
  { ...validPlan(), leases: [] },
  { ...validPlan(), leases: { plan: { owner_session: "owner", expires_at: "invalid" } } },
  { ...validPlan(), receipts: [{ ...receipt(), evidence: [] }] },
  { ...validPlan(), receipts: [{ ...receipt(), step: "/unknown" }] },
  { ...validPlan(), receipts: [{ ...receipt(), result: "started" }] },
  { ...validPlan(), receipts: [{ ...receipt(), result: "ready" }] },
  { ...validPlan(), receipts: [{ ...receipt(), step: "/to-issues" }] },
  { ...validPlan(), receipts: [receipt(), receipt()] },
])("invalid Plan or receipt chain is rejected: %j", async (plan) => {
  const workspace = await createWorkspace();
  const state = stateWith(plan);
  await writeState(workspace, state);
  await assert.rejects(command(workspace, "status", { plan: PLAN_PATH }));
  assert.deepEqual(JSON.parse(await fs.readFile(statePath(workspace), "utf8")), state);
});

test.each([
  { step: "/code-delivery", result: "completed", issue: null },
  { step: "/code-delivery", result: "completed", issue: "01" },
  { step: "/dev-gate", result: "completed", issue: null },
  { step: "/dev-gate", result: "skipped", issue: null },
])("stored receipts cannot bypass admission: %j", async (invalid) => {
  const workspace = await createWorkspace();
  const state = stateWith({
    ...validPlan(),
    receipts: [receipt(), { ...receipt(), step: "/to-issues" }, { ...receipt(), ...invalid }],
  });
  await writeState(workspace, state);
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }), /receipt/);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath(workspace), "utf8")), state);
});

test("malformed JSON and state read failures surface through the public interface", async () => {
  const malformed = await createWorkspace();
  await fs.mkdir(path.dirname(statePath(malformed)), { recursive: true });
  await fs.writeFile(statePath(malformed), "{");
  await assert.rejects(command(malformed, "status", { plan: PLAN_PATH }), /解析|JSON/);
  assert.equal(await fs.readFile(statePath(malformed), "utf8"), "{");
  const unreadable = await createWorkspace();
  await fs.mkdir(statePath(unreadable), { recursive: true });
  await assert.rejects(
    command(unreadable, "status", { plan: PLAN_PATH }),
    /读取|directory|EISDIR|非法/i,
  );
});

test("status without runtime stays read only and reports missing initialization", async () => {
  const workspace = await createWorkspace();
  await assert.rejects(command(workspace, "status", { plan: PLAN_PATH }), /尚未初始化/);
  await assert.rejects(fs.access(statePath(workspace)));
});
