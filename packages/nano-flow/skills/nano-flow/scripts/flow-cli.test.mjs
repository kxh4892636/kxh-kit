import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";

import { runFlowCli } from "./flow.mjs";
import {
  cleanupWorkspaces,
  createWorkspace,
  PLAN_PATH,
  statePath,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

const invoke = async (argumentsList, cwd) => {
  const output = [];
  const errors = [];
  const code = await runFlowCli({
    argumentsList,
    cwd,
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
  });
  return { code, output, errors };
};

test.each([[], ["help"], ["--help"], ["-h"]].map((args) => ({ args })))(
  "help exposes three commands: $args",
  async ({ args }) => {
    const result = await invoke(args);
    assert.equal(result.code, 0);
    for (const name of ["status", "acquire", "report"])
      assert.match(result.output[0], new RegExp(name));
    assert.match(result.output[0], /\/dev-gate/);
    assert.match(result.output[0], /ready/);
    assert.doesNotMatch(result.output[0], /enter-plan|record-plan|claim-issue|sync-plan/);
  },
);

test("CLI uses workspace override and preserves repeated evidence", async () => {
  const workspace = await createWorkspace();
  const wrongCwd = path.join(workspace, "wrong-cwd");
  const scope = ["--workspace", workspace, "--plan", PLAN_PATH];
  const acquired = await invoke(["acquire", ...scope, "--session", "cli-session"], wrongCwd);
  assert.equal(acquired.code, 0, acquired.errors.join("\n"));
  assert.equal(JSON.parse(acquired.output[0]).next.skill, "/questing");
  const reported = await invoke(
    [
      "report",
      ...scope,
      "--session",
      "cli-session",
      "--step",
      "/questing",
      "--result",
      "completed",
      "--evidence",
      "first",
      "--evidence",
      "second",
    ],
    wrongCwd,
  );
  assert.equal(reported.code, 0, reported.errors.join("\n"));
  const status = await invoke(["status", ...scope], wrongCwd);
  assert.equal(status.code, 0);
  const body = JSON.parse(status.output[0]);
  assert.equal(body.success, true);
  assert.deepEqual(body.receipts[0].evidence, ["first", "second"]);
  await fs.access(statePath(workspace));
  await assert.rejects(fs.access(path.join(wrongCwd, ".flow")));
});

test.each(
  [
    ["unknown"],
    ["enter-plan"],
    ["acquire", "positional"],
    ["acquire", "--plan"],
    ["acquire", "--plan", "--session", "owner"],
    ["acquire", "--plan", PLAN_PATH, "--unknown", "value"],
    ["acquire", "--plan", PLAN_PATH, "--plan", PLAN_PATH],
    ["acquire", "--plan", PLAN_PATH, "--session", "one", "--session", "two"],
    ["status", "--plan", PLAN_PATH, "--lease-seconds", "30"],
  ].map((args) => ({ args })),
)("CLI rejects malformed options without creating state: $args", async ({ args }) => {
  const workspace = await createWorkspace();
  const result = await invoke(args, workspace);
  assert.equal(result.code, 1);
  assert.equal(result.output.length, 0);
  const error = JSON.parse(result.errors[0]);
  assert.equal(error.success, false);
  assert.ok(error.error.length > 0);
  await assert.rejects(fs.access(statePath(workspace)));
});
