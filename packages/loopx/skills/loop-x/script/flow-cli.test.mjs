import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test, vi } from "vitest";

import { runFlowCli } from "./flow.mjs";
import { cleanupWorkspaces, createWorkspace, PLAN_PATH } from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

test("CLI wrapper renders help, parses repeated evidence, and returns JSON errors", async () => {
  const workspace = await createWorkspace();
  const wrongCwd = path.join(workspace, "wrong-cwd");
  const help = [];
  assert.equal(await runFlowCli({ argumentsList: [], stdout: (message) => help.push(message) }), 0);
  assert.ok(help[0].includes("flow.mjs enter-plan"));
  assert.equal(help[0].includes("flow.mjs init"), false);

  const entered = [];
  assert.equal(
    await runFlowCli({
      argumentsList: [
        "enter-plan",
        "--workspace",
        workspace,
        "--plan",
        PLAN_PATH,
        "--skill",
        "/loop-x",
        "--entry",
        "/to-story",
        "--session",
        "cli-session",
      ],
      cwd: wrongCwd,
      stdout: (message) => entered.push(message),
    }),
    0,
  );
  assert.equal(JSON.parse(entered[0]).success, true);

  const recorded = [];
  assert.equal(
    await runFlowCli({
      argumentsList: [
        "record-plan",
        "--workspace",
        workspace,
        "--plan",
        PLAN_PATH,
        "--session",
        "cli-session",
        "--skill",
        "/to-story",
        "--result",
        "completed",
        "--evidence",
        "first",
        "--evidence",
        "second",
      ],
      cwd: wrongCwd,
      stdout: (message) => recorded.push(message),
    }),
    0,
  );
  assert.equal(JSON.parse(recorded[0]).success, true);

  const status = [];
  assert.equal(
    await runFlowCli({
      argumentsList: ["status", "--workspace", workspace, "--plan", PLAN_PATH],
      cwd: wrongCwd,
      stdout: (message) => status.push(message),
    }),
    0,
  );
  assert.deepEqual(JSON.parse(status[0]).plan.receipts[0].evidence, ["first", "second"]);
  assert.ok(
    (await fs.readdir(path.join(workspace, ".flow", "state"))).some((name) =>
      name.endsWith("-state.json"),
    ),
  );
  await assert.rejects(fs.access(path.join(wrongCwd, ".flow")));

  for (const [argumentsList, error] of [
    [["unknown"], "未知命令 unknown"],
    [["enter-plan", "positional"], "无法识别参数 positional"],
    [["enter-plan", "--plan"], "--plan 缺少值"],
    [["enter-plan", "--plan", "--skill", "/to-story"], "--plan 缺少值"],
  ]) {
    const stderr = [];
    assert.equal(await runFlowCli({ argumentsList, stderr: (message) => stderr.push(message) }), 1);
    assert.deepEqual(JSON.parse(stderr[0]), { error, success: false });
  }
});

test("CLI wrapper supports explicit help aliases and default dependency callbacks", async () => {
  for (const alias of ["help", "--help", "-h"]) {
    const output = [];
    assert.equal(
      await runFlowCli({ argumentsList: [alias], stdout: (message) => output.push(message) }),
      0,
    );
    assert.match(output[0], /flow\.mjs enter-plan/);
  }
  const originalArgv = process.argv;
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  process.argv = [process.execPath, "vitest", "unknown-default-command"];
  try {
    assert.equal(await runFlowCli({}), 1);
    assert.deepEqual(JSON.parse(stderr.mock.calls[0][0]), {
      error: "未知命令 unknown-default-command",
      success: false,
    });
    process.argv = [process.execPath, "vitest", "--help"];
    assert.equal(await runFlowCli({}), 0);
    assert.match(stdout.mock.calls[0][0], /^用法:/u);
  } finally {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  }
});
