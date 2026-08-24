import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  closeFakeHerdrServers,
  fakeAgent,
  type FakeAgent,
  listen,
  responseFor,
  type SocketRequest,
} from "./fake-herdr.test-support.js";
import { runScanNow } from "./scan-now.js";

const stateDirs: string[] = [];

afterEach(async (): Promise<void> => {
  await closeFakeHerdrServers();
  await Promise.all(
    stateDirs.splice(0).map(async (stateDir: string): Promise<void> => {
      await rm(stateDir, { force: true, recursive: true });
    }),
  );
});

const createStateDir = async (): Promise<string> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  stateDirs.push(stateDir);
  return stateDir;
};

const blockedAgent = {
  ...fakeAgent,
  agent_status: "blocked",
  terminal_id: "term_blocked",
} as const;

test("a blocked stall is resumed with one atomic pane input request", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(responseFor(blockedAgent));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 0, resumed: 1, scanned: 1, skipped: 0 });
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "pane.send_input"),
  ).toEqual([
    {
      id: expect.any(String) as string,
      method: "pane.send_input",
      params: { keys: ["enter"], pane_id: blockedAgent.pane_id, text: "go on" },
    },
  ]);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "agent.prompt")).toBe(
    false,
  );
});

test.each(["codex", "claude", "gemini", "custom-recognized-agent"])(
  "agent label %s cannot exclude a blocked candidate",
  async (agentLabel: string): Promise<void> => {
    const stateDir = await createStateDir();
    const target: FakeAgent = { ...blockedAgent, agent: agentLabel };
    const { requests, socketPath } = await listen(responseFor(target));

    const result = await runScanNow({ socketPath, stateDir });

    expect(result.resumed).toBe(1);
    expect(
      requests.filter(({ method }: SocketRequest): boolean => method === "pane.send_input"),
    ).toHaveLength(1);
  },
);

test.each([
  ["terminal", { terminal_id: "term_replaced" }],
  ["status", { agent_status: "idle" }],
  ["state sequence", { state_change_seq: blockedAgent.state_change_seq + 1 }],
  ["read revision", { revision: blockedAgent.revision + 1 }],
] as const)(
  "changed %s prevents blocked pane input",
  async (_label: string, change: Partial<FakeAgent>): Promise<void> => {
    const stateDir = await createStateDir();
    const responder = (request: SocketRequest): Record<string, unknown> => {
      if (request.method === "agent.get") {
        return { agent: { ...blockedAgent, ...change }, type: "agent_info" };
      }
      return responseFor(blockedAgent)(request);
    };
    const { requests, socketPath } = await listen(responder);

    const result = await runScanNow({ socketPath, stateDir });

    expect(result.skipped).toBe(1);
    expect(
      requests.some(({ method }: SocketRequest): boolean => method === "pane.send_input"),
    ).toBe(false);
  },
);

test("a blocked candidate without both tokens receives no input", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const { requests, socketPath } = await listen(
    responseFor(blockedAgent, "HTTP 429 without the other token"),
  );

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.skipped).toBe(1);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "pane.send_input")).toBe(
    false,
  );
});

test("idle and done candidates never use the blocked input path", async (): Promise<void> => {
  const stateDir = await createStateDir();
  const idleAgent: FakeAgent = { ...fakeAgent, agent_status: "idle", terminal_id: "idle" };
  const doneAgent: FakeAgent = { ...fakeAgent, pane_id: "w2:p2", terminal_id: "done" };
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      return {
        agents: [idleAgent, doneAgent],
        type: "agent_list",
      };
    }
    const target = request.params["target"] === "w2:p2" ? doneAgent : idleAgent;
    return responseFor(target)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.resumed).toBe(2);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "pane.send_input")).toBe(
    false,
  );
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(2);
});

test.each([
  ["Herdr error", { __error: "upstream failed" }],
  ["disconnect", { __disconnect: true }],
  ["timeout", { __noResponse: true }],
] as const)(
  "%s does not dedupe a failed blocked send",
  async (_label: string, failure: Record<string, unknown>): Promise<void> => {
    const stateDir = await createStateDir();
    let shouldFail = true;
    const responder = (request: SocketRequest): Record<string, unknown> => {
      if (request.method === "pane.send_input" && shouldFail) {
        shouldFail = false;
        return failure;
      }
      return responseFor(blockedAgent)(request);
    };
    const { requests, socketPath } = await listen(responder);

    const first = await runScanNow({ requestTimeoutMs: 25, socketPath, stateDir });
    const second = await runScanNow({ requestTimeoutMs: 25, socketPath, stateDir });

    expect(first).toEqual({ failed: 1, resumed: 0, scanned: 1, skipped: 0 });
    expect(second.resumed).toBe(1);
    expect(
      requests.filter(({ method }: SocketRequest): boolean => method === "pane.send_input"),
    ).toHaveLength(2);
  },
);
