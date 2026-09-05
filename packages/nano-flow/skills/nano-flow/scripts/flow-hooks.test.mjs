import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "vitest";

import { executeFlow } from "./flow.mjs";
import {
  cleanupWorkspaces,
  createWorkspace,
  PLAN_PATH,
  TEST_NOW,
} from "./testing/flow-workspace.mjs";

afterEach(cleanupWorkspaces);

test.each(["manual", "auto"])(
  "hooks 在 %s 模式同时匹配 skill 与 mode，并按声明顺序拼接",
  async (mode) => {
    const workspace = await createWorkspace();
    const hooks = {
      schema_version: 1,
      hooks: [
        { match: "all", message: "default mode" },
        { match: ["questing"], mode: "auto", message: "auto story" },
        { match: "all", mode: "all", message: "explicit all" },
        { match: ["questing"], mode: "manual", message: "manual story" },
        { match: ["code-delivery"], mode, message: "other skill" },
        { match: "all", mode, message: "selected mode" },
      ],
    };
    const invoke = (command, options) =>
      executeFlow({
        command,
        hooks,
        now: () => new Date(TEST_NOW),
        options: { plan: PLAN_PATH, session: "owner", ...options },
        workspace,
      });

    const entered = await invoke("enter-plan", {
      entry: "/questing",
      mode,
      skill: "/nano-flow",
    });
    assert.equal(
      entered.message,
      mode === "auto"
        ? "default mode\nauto story\nexplicit all\nselected mode"
        : "default mode\nexplicit all\nmanual story\nselected mode",
    );

    const next = await invoke("record-plan", {
      evidence: ["story-completed"],
      result: "completed",
      skill: "/questing",
    });
    assert.equal(next.next_skill, "/to-issues");
    assert.equal(next.message, "default mode\nexplicit all\nselected mode");
  },
);

test.each(["manual", "auto"])("%s 模式没有匹配 hook 时不注入默认提示", async (mode) => {
  const workspace = await createWorkspace();
  const oppositeMode = mode === "manual" ? "auto" : "manual";
  for (const hooks of [[], [{ match: "all", mode: oppositeMode, message: "other mode" }]]) {
    const entered = await executeFlow({
      command: "enter-plan",
      hooks: { schema_version: 1, hooks },
      now: () => new Date(TEST_NOW),
      options: {
        entry: "/questing",
        mode,
        plan: PLAN_PATH,
        session: "owner",
        skill: "/nano-flow",
      },
      workspace,
    });
    assert.equal(Object.hasOwn(entered, "message"), false);
  }
});

test("mode hook 可由配置应用到 code-delivery，并随 Plan 模式切换", async () => {
  const workspace = await createWorkspace();
  const hooks = {
    schema_version: 1,
    hooks: [
      { match: ["code-delivery"], mode: "manual", message: "manual delivery" },
      { match: ["code-delivery"], mode: "auto", message: "auto delivery" },
    ],
  };
  const invoke = (command, options) =>
    executeFlow({
      command,
      hooks,
      now: () => new Date(TEST_NOW),
      options: { plan: PLAN_PATH, session: "owner", ...options },
      workspace,
    });

  await invoke("enter-plan", { entry: "/questing", skill: "/nano-flow" });
  await invoke("enter-plan", {
    entry: "/questing",
    mode: "auto",
    skill: "/nano-flow",
  });
  const switched = await invoke("enter-plan", {
    entry: "/questing",
    mode: "manual",
    skill: "/nano-flow",
  });
  assert.equal(Object.hasOwn(switched, "message"), false);
  await invoke("record-plan", {
    evidence: ["domain-completed"],
    result: "completed",
    skill: "/questing",
  });
  const delivery = await invoke("record-plan", {
    evidence: ["issues-skipped"],
    result: "skipped",
    skill: "/to-issues",
  });
  assert.equal(delivery.message, "manual delivery");
  const commit = await invoke("record-plan", {
    evidence: ["delivery-started"],
    result: "started",
    skill: "/code-delivery",
  });
  assert.equal(commit.next_action, "commit");
  assert.equal(Object.hasOwn(commit, "message"), false);
});

test.each([null, "", "turbo", "AUTO", 0, false, ["auto"], {}])(
  "非法 hook mode %j 在创建 Flow 状态前拒绝",
  async (mode) => {
    const workspace = await createWorkspace();
    await assert.rejects(
      executeFlow({
        command: "enter-plan",
        hooks: {
          schema_version: 1,
          hooks: [{ match: "all", mode, message: "invalid mode" }],
        },
        options: { entry: "/questing", plan: PLAN_PATH, skill: "/nano-flow" },
        workspace,
      }),
      /Hook 1 的 mode 必须是 all \| manual \| auto/,
    );
    await assert.rejects(fs.access(path.join(workspace, ".flow", "state")));
  },
);
