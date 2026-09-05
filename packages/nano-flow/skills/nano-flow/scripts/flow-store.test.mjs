import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, test, vi } from "vitest";
import {
  addDeliveryEvidence,
  cleanupWorkspaces,
  command,
  createWorkspace,
  issuePath,
  PLAN_PATH,
  readyIssuePlan,
  recordIssue,
  statePath,
} from "./testing/flow-workspace.mjs";

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupWorkspaces();
});

const interruptedCompletion = async (workspace) => {
  await readyIssuePlan(workspace);
  await command(workspace, "acquire", { plan: PLAN_PATH, issue: "01", session: "owner" });
  await addDeliveryEvidence(workspace, "01");
  const rename = fs.rename.bind(fs);
  const failure = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    if (to === statePath(workspace)) throw new Error("模拟磁盘写入中断");
    return rename(from, to);
  });
  await assert.rejects(
    recordIssue(workspace, "01", "owner", "code-delivery", "completed"),
    /模拟磁盘写入中断/,
  );
  failure.mockRestore();
};

test("interrupted completion resumes its existing receipt without redoing delivery", async () => {
  const workspace = await createWorkspace();
  await interruptedCompletion(workspace);
  const pending = path.join(workspace, ".flow/pending.json");
  const intent = await fs.readFile(pending, "utf8");
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /status: completed/);
  await assert.rejects(command(workspace, "status", { plan: PLAN_PATH }), /acquire.*恢复/);
  assert.equal(await fs.readFile(pending, "utf8"), intent);
  const recovered = await command(workspace, "acquire", {
    plan: PLAN_PATH,
    issue: "01",
    session: "new",
  });
  assert.equal(recovered.state, "completed");
  assert.equal(recovered.receipts.filter((item) => item.issue === "01").length, 1);
  assert.deepEqual(recovered.receipts.at(-1).evidence, ["code-delivery-completed"]);
  await assert.rejects(fs.access(pending), { code: "ENOENT" });
  assert.equal((await command(workspace, "status", { plan: PLAN_PATH })).state, "completed");
});

test("recovery keeps external edits and the intent until the conflict is resolved", async () => {
  const workspace = await createWorkspace();
  await interruptedCompletion(workspace);
  const pending = path.join(workspace, ".flow/pending.json");
  const intent = await fs.readFile(pending, "utf8");
  const before = await fs.readFile(statePath(workspace), "utf8");
  const delivered = await fs.readFile(issuePath(workspace, "01"), "utf8");
  await fs.appendFile(issuePath(workspace, "01"), "\n外部新增内容\n");
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }), /恢复冲突/);
  assert.match(await fs.readFile(issuePath(workspace, "01"), "utf8"), /外部新增内容/);
  assert.equal(await fs.readFile(statePath(workspace), "utf8"), before);
  assert.equal(await fs.readFile(pending, "utf8"), intent);
  // 模拟用户核对后恢复为已提交的内容，重试只补全未完成文件。
  await fs.writeFile(issuePath(workspace, "01"), delivered);
  assert.equal((await command(workspace, "acquire", { plan: PLAN_PATH })).state, "completed");
});

test("a failed intent write never changes the target files", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  const before = await fs.readFile(statePath(workspace), "utf8");
  const issueBefore = await fs.readFile(issuePath(workspace, "01"), "utf8");
  const rename = fs.rename.bind(fs);
  const failure = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    if (to.endsWith("pending.json")) throw new Error("无法写入意图");
    return rename(from, to);
  });
  await assert.rejects(
    command(workspace, "acquire", { plan: PLAN_PATH, issue: "01" }),
    /无法写入意图/,
  );
  failure.mockRestore();
  assert.equal(await fs.readFile(statePath(workspace), "utf8"), before);
  assert.equal(await fs.readFile(issuePath(workspace, "01"), "utf8"), issueBefore);
  assert.deepEqual((await fs.readdir(path.join(workspace, ".flow"))).sort(), [
    "locks",
    "state.json",
  ]);
  assert.deepEqual(await fs.readdir(path.join(workspace, ".flow/locks")), []);
});

test("a crashed process lock can be reclaimed", async () => {
  const workspace = await createWorkspace();
  const pid = Number(
    execFileSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
      encoding: "utf8",
    }),
  );
  await fs.mkdir(path.join(workspace, ".flow/locks"), { recursive: true });
  await fs.writeFile(path.join(workspace, `.flow/locks/${pid}-abcd.lock`), "1");
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      command(workspace, "acquire", { plan: PLAN_PATH, session: `s${i}` }),
    ),
  );
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 4);
  assert.deepEqual(await fs.readdir(path.join(workspace, ".flow/locks")), []);
});

test("a live owner's lock is respected even when old", async () => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow/locks"), { recursive: true });
  const lock = path.join(workspace, `.flow/locks/${process.pid}-abcd.lock`);
  await fs.writeFile(lock, "1");
  const old = new Date(Date.now() - 60000);
  await fs.utimes(lock, old, old);
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }), /写锁超时/);
  assert.equal(await fs.readFile(lock, "utf8"), "1");
}, 10000);

test.each([
  "not JSON",
  "null",
  "[]",
  '[{"path":"../outside","before":null,"after":"x"}]',
  '[{"path":".flow/pending.json","before":null,"after":"x"}]',
  '[{"path":".flow/state.lock","before":null,"after":"x"}]',
  '[{"path":1}]',
])("invalid recovery record is retained: %s", async (content) => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow"));
  const journal = path.join(workspace, ".flow/pending.json");
  await fs.writeFile(journal, content);
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }));
  assert.equal(await fs.readFile(journal, "utf8"), content);
  await assert.rejects(fs.access(statePath(workspace)), { code: "ENOENT" });
});

test("Issue paths through an external junction are rejected without touching the target", async () => {
  const workspace = await createWorkspace();
  const outside = await createWorkspace();
  const junction = path.join(workspace, "linked");
  await fs.symlink(path.join(outside, PLAN_PATH), junction, "junction");
  await assert.rejects(
    command(workspace, "acquire", { plan: "linked", session: "owner" }),
    /工作区内/,
  );
  await assert.rejects(fs.access(statePath(workspace)), { code: "ENOENT" });
  assert.match(await fs.readFile(issuePath(outside, "01"), "utf8"), /status: pending/);
});

test("aliases share the same Flow identity and cannot acquire a second lease", async () => {
  const workspace = await createWorkspace();
  await readyIssuePlan(workspace);
  await command(workspace, "acquire", { plan: PLAN_PATH, issue: "01", session: "owner" });
  await fs.symlink(path.join(workspace, PLAN_PATH), path.join(workspace, "alias"), "junction");
  for (const alias of [
    "alias",
    ...(process.platform === "win32" ? [PLAN_PATH.toUpperCase()] : []),
  ]) {
    await assert.rejects(
      command(workspace, "acquire", { plan: alias, issue: "01", session: "other" }),
      /持有/,
    );
    const status = await command(workspace, "status", {
      plan: alias,
      issue: "01",
      session: "owner",
    });
    assert.equal(status.plan, PLAN_PATH);
    assert.equal(status.state, "owned");
  }
});

test("recovery detects an external edit made between two target writes", async () => {
  const workspace = await createWorkspace();
  await fs.mkdir(path.join(workspace, ".flow"));
  await fs.writeFile(path.join(workspace, "a"), "before");
  await fs.writeFile(path.join(workspace, "b"), "before");
  const journal = path.join(workspace, ".flow/pending.json");
  await fs.writeFile(
    journal,
    JSON.stringify(["a", "b"].map((file) => ({ path: file, before: "before", after: "after" }))),
  );
  const rename = fs.rename.bind(fs);
  const edit = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    await rename(from, to);
    if (to === path.join(workspace, "a")) await fs.writeFile(path.join(workspace, "b"), "external");
  });
  await assert.rejects(command(workspace, "acquire", { plan: PLAN_PATH }), /恢复冲突/);
  edit.mockRestore();
  assert.equal(await fs.readFile(path.join(workspace, "b"), "utf8"), "external");
  await fs.access(journal);
});
