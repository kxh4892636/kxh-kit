import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import {
  closeFakeHerdrServers,
  fakeAgent,
  type FakeAgent,
  listen,
  responseFor,
  type SocketRequest,
} from "../fake-herdr.test-support.js";
import { runAgentStatusEvent } from "./event-handler.js";
import type { ResumeResult } from "./resume-agent.js";
import { runScanNow } from "./scan-now.js";
import { TerminalLease } from "../terminal-lease.js";

const stateDirs: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async (): Promise<void> => {
  await closeFakeHerdrServers();
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

const createStateDir = async (): Promise<string> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-event-"));
  stateDirs.push(stateDir);
  return stateDir;
};

const eventJson = (target: FakeAgent): string =>
  JSON.stringify({
    data: {
      agent: target.agent,
      agent_status: target.agent_status,
      pane_id: target.pane_id,
      type: "pane_agent_status_changed",
      workspace_id: target.workspace_id,
    },
    event: "pane.agent_status_changed",
  });

test("the manifest wires agent status events to the event handler", async (): Promise<void> => {
  const manifest = await readFile(new URL("../../herdr-plugin.toml", import.meta.url), "utf8");

  expect(manifest).toContain('on = "pane.agent_status_changed"');
  expect(manifest).toContain('command = ["node", "dist/main.mjs", "handle-event"]');
});

test.each([
  ["done", "agent.prompt"],
  ["idle", "agent.prompt"],
  ["blocked", "pane.send_input"],
] as const)(
  "a matching %s event uses %s",
  async (status: string, method: string): Promise<void> => {
    const stateDir = await createStateDir();
    const target: FakeAgent = { ...fakeAgent, agent_status: status as FakeAgent["agent_status"] };
    const { requests, socketPath } = await listen(responseFor(target));

    const result = await runAgentStatusEvent({
      eventJson: eventJson(target),
      socketPath,
      stateDir,
    });

    expect(result.resumed).toBe(1);
    expect(
      requests.filter((request: SocketRequest): boolean => request.method === method),
    ).toHaveLength(1);
  },
);

test.each([
  "{}",
  '{"event":"pane.agent_status_changed","data":{}}',
  '{"event":"pane.closed","data":{"pane_id":"w2:p1","agent_status":"done"}}',
  "not-json",
])("malformed or unrelated event %s does not call Herdr", async (raw: string): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(responseFor(fakeAgent));

  const result = await runAgentStatusEvent({ eventJson: raw, socketPath, stateDir });

  expect(result).toEqual({ failed: 0, resumed: 0, scanned: 0, skipped: 1 });
  expect(requests).toHaveLength(0);
});

test("a stale candidate event cannot resume an authoritative working agent", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const workingAgent: FakeAgent = { ...fakeAgent, agent_status: "working" };
  const { requests, socketPath } = await listen(responseFor(workingAgent));

  const result = await runAgentStatusEvent({
    eventJson: eventJson(fakeAgent),
    socketPath,
    stateDir,
  });

  expect(result.resumed).toBe(0);
  expect(
    requests.some((request: SocketRequest): boolean => request.method.includes("prompt")),
  ).toBe(false);
});

test.each(["working", "unknown"] as const)(
  "%s activity clears the prior stall so a later stall can resume",
  async (activeStatus: "unknown" | "working"): Promise<void> => {
    const stateDir = await createStateDir();
    let current: FakeAgent = fakeAgent;
    const responder = (request: SocketRequest): Record<string, unknown> =>
      responseFor(current)(request);
    const { requests, socketPath } = await listen(responder);

    const first = await runAgentStatusEvent({
      eventJson: eventJson(fakeAgent),
      socketPath,
      stateDir,
    });
    current = { ...fakeAgent, agent_status: activeStatus };
    const active = await runAgentStatusEvent({
      eventJson: eventJson(current),
      socketPath,
      stateDir,
    });
    current = fakeAgent;
    const next = await runAgentStatusEvent({
      eventJson: eventJson(fakeAgent),
      socketPath,
      stateDir,
    });

    expect([first.resumed, active.resumed, next.resumed]).toEqual([1, 0, 1]);
    expect(
      requests.filter((request: SocketRequest): boolean => request.method === "agent.prompt"),
    ).toHaveLength(2);
  },
);

test.each([
  ["terminal", { terminal_id: "replacement" }],
  ["state sequence", { state_change_seq: fakeAgent.state_change_seq + 1 }],
  ["read revision", { revision: fakeAgent.revision + 1 }],
] as const)(
  "a changed %s during event handling prevents input",
  async (_label: string, change: Partial<FakeAgent>): Promise<void> => {
    const stateDir = await createStateDir();
    let getCount = 0;
    const responder = (request: SocketRequest): Record<string, unknown> => {
      if (request.method === "agent.get") {
        getCount += 1;
        const changed = change.terminal_id === undefined ? getCount >= 3 : getCount >= 2;
        return { agent: changed ? { ...fakeAgent, ...change } : fakeAgent, type: "agent_info" };
      }
      return responseFor(fakeAgent)(request);
    };
    const { requests, socketPath } = await listen(responder);

    const result = await runAgentStatusEvent({
      eventJson: eventJson(fakeAgent),
      socketPath,
      stateDir,
    });

    expect(result.skipped).toBe(1);
    expect(
      requests.some(
        (request: SocketRequest): boolean =>
          request.method === "agent.prompt" || request.method === "pane.send_input",
      ),
    ).toBe(false);
  },
);

test("concurrent duplicate handlers send at most once", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(responseFor(fakeAgent));
  const options = { eventJson: eventJson(fakeAgent), socketPath, stateDir };

  const results = await Promise.all([runAgentStatusEvent(options), runAgentStatusEvent(options)]);

  expect(
    results.reduce((total: number, result: ResumeResult): number => total + result.resumed, 0),
  ).toBe(1);
  expect(
    requests.filter((request: SocketRequest): boolean => request.method === "agent.prompt"),
  ).toHaveLength(1);
});

test("a manual scan and event handler share the same terminal lock", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(responseFor(fakeAgent));

  const results = await Promise.all([
    runScanNow({ socketPath, stateDir }),
    runAgentStatusEvent({ eventJson: eventJson(fakeAgent), socketPath, stateDir }),
  ]);

  expect(
    results.reduce((total: number, result: ResumeResult): number => total + result.resumed, 0),
  ).toBe(1);
  expect(
    requests.filter((request: SocketRequest): boolean => request.method === "agent.prompt"),
  ).toHaveLength(1);
});

test("two independent handler processes send at most once", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(responseFor(fakeAgent));
  const mainPath = fileURLToPath(new URL("../../dist/main.mjs", import.meta.url));
  const environment = {
    ...process.env,
    HERDR_PLUGIN_EVENT_JSON: eventJson(fakeAgent),
    HERDR_PLUGIN_STATE_DIR: stateDir,
    HERDR_SOCKET_PATH: socketPath,
  };

  await Promise.all([
    execFileAsync(process.execPath, [mainPath, "handle-event"], { env: environment }),
    execFileAsync(process.execPath, [mainPath, "handle-event"], { env: environment }),
  ]);

  expect(
    requests.filter((request: SocketRequest): boolean => request.method === "agent.prompt"),
  ).toHaveLength(1);
});

test("a stale terminal lease can be replaced without its old owner deleting the new lease", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const first = await TerminalLease.tryAcquire({
    leaseMs: 10,
    now: (): number => 100,
    socketPath: "session",
    stateDir,
    terminalId: "terminal",
  });
  const contenders = await Promise.all([
    TerminalLease.tryAcquire({
      leaseMs: 10,
      now: (): number => 121,
      socketPath: "session",
      stateDir,
      terminalId: "terminal",
    }),
    TerminalLease.tryAcquire({
      leaseMs: 10,
      now: (): number => 121,
      socketPath: "session",
      stateDir,
      terminalId: "terminal",
    }),
  ]);
  const replacements = contenders.filter(
    (lease: TerminalLease | null): lease is TerminalLease => lease !== null,
  );

  expect(first).not.toBeNull();
  expect(replacements).toHaveLength(1);
  await first?.release();
  expect(
    await TerminalLease.tryAcquire({
      leaseMs: 10,
      now: (): number => 122,
      socketPath: "session",
      stateDir,
      terminalId: "terminal",
    }),
  ).toBeNull();
  await replacements[0]?.release();
});
