import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { afterEach, test } from "vitest";

import { executeFlow } from "./flow.mjs";
import {
  cleanupWorkspaces,
  createWorkspace,
  PLAN_PATH,
  statePath,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const invoke = (workspace, hooks, command, options = {}) =>
  executeFlow({
    command,
    hooks,
    now: () => new Date(TEST_NOW),
    options: { plan: PLAN_PATH, session: "owner", ...options },
    workspace,
  });

test.each(["manual", "auto"])(
  "%s hooks match skill and mode in declaration order",
  async (mode) => {
    const workspace = await createWorkspace();
    const hooks = {
      schema_version: 1,
      hooks: [
        { match: "all", message: "default" },
        { match: ["questing"], mode: "auto", message: "auto story" },
        { match: "all", mode: "all", message: "all" },
        { match: ["questing"], mode: "manual", message: "manual story" },
        { match: ["code-delivery"], mode, message: "delivery" },
        { match: ["dev-gate"], mode, message: "admission" },
        { match: "all", mode, message: "selected" },
      ],
    };
    const entered = await invoke(workspace, hooks, "acquire", { mode });
    const expected =
      mode === "auto"
        ? "default\nauto story\nall\nselected"
        : "default\nall\nmanual story\nselected";
    assert.equal(entered.next.message, expected);
    assert.equal(Object.hasOwn(entered, "message"), false);
    const status = await invoke(workspace, hooks, "status");
    assert.deepEqual(status.next, entered.next);
    const next = await invoke(workspace, hooks, "report", {
      evidence: ["story.md"],
      result: "completed",
      step: "/questing",
    });
    assert.equal(next.next.skill, "/to-issues");
    assert.equal(next.next.message, "default\nall\nselected");
    const gate = await invoke(workspace, hooks, "report", {
      evidence: ["small task"],
      result: "skipped",
      step: "/to-issues",
    });
    assert.equal(gate.next.skill, "/dev-gate");
    assert.equal(gate.next.message, "default\nall\nadmission\nselected");
    const delivery = await invoke(workspace, hooks, "report", {
      evidence: ["confirmed baseline"],
      result: "ready",
      step: "/dev-gate",
    });
    assert.equal(delivery.next.skill, "/code-delivery");
    assert.equal(delivery.next.message, "default\nall\ndelivery\nselected");
  },
);

test("mode is fixed for the Flow and completion has no next", async () => {
  const workspace = await createWorkspace();
  const hooks = {
    schema_version: 1,
    hooks: [
      { match: ["code-delivery"], mode: "manual", message: "manual delivery" },
      { match: ["code-delivery"], mode: "auto", message: "auto delivery" },
    ],
  };
  await invoke(workspace, hooks, "acquire", { mode: "auto" });
  await assert.rejects(invoke(workspace, hooks, "acquire", { mode: "manual" }), /模式.*固定/);
  await invoke(workspace, hooks, "report", {
    step: "/questing",
    result: "completed",
    evidence: ["story"],
  });
  await invoke(workspace, hooks, "report", {
    step: "/to-issues",
    result: "skipped",
    evidence: ["small task"],
  });
  const delivery = await invoke(workspace, hooks, "report", {
    step: "/dev-gate",
    result: "ready",
    evidence: ["confirmed baseline"],
  });
  assert.equal(delivery.next.message, "auto delivery");
  const finished = await invoke(workspace, hooks, "report", {
    step: "/code-delivery",
    result: "completed",
    evidence: ["commit and gates"],
  });
  assert.equal(finished.next, null);
  assert.equal(Object.hasOwn(finished, "message"), false);
});

test("unmatched hooks leave next.message absent", async () => {
  const workspace = await createWorkspace();
  for (const hooks of [[], [{ match: "all", mode: "auto", message: "auto only" }]]) {
    const result = await invoke(workspace, { schema_version: 1, hooks }, "acquire");
    assert.equal(Object.hasOwn(result.next, "message"), false);
  }
});

test.each([
  null,
  { schema_version: 2, hooks: [] },
  { schema_version: 1, hooks: [null] },
  { schema_version: 1, hooks: [{ match: [], message: "x" }] },
  { schema_version: 1, hooks: [{ match: ["unknown"], message: "x" }] },
  { schema_version: 1, hooks: [{ match: "all", message: "" }] },
  { schema_version: 1, hooks: [{ match: "all", message: "two\nlines" }] },
  ...[null, "", "turbo", "AUTO", 0, false, ["auto"], {}].map((mode) => ({
    schema_version: 1,
    hooks: [{ match: "all", mode, message: "x" }],
  })),
])("invalid hooks are rejected before state changes: %j", async (hooks) => {
  const workspace = await createWorkspace();
  await assert.rejects(invoke(workspace, hooks, "acquire"), /Hook/);
  await assert.rejects(fs.access(statePath(workspace)));
});
