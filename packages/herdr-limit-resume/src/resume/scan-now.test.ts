import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  closeFakeHerdrServers,
  fakeAgent as agent,
  type FakeAgent,
  listen,
  responseFor,
  type SocketRequest,
} from "../fake-herdr.test-support.js";
import { runScanNow } from "./scan-now.js";

const resources: Array<() => Promise<void>> = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    resources.splice(0).map(async (close: () => Promise<void>): Promise<void> => close()),
  );
  await closeFakeHerdrServers();
});

test("a done rate-limit stall is resumed once across all workspaces", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const { requests, socketPath } = await listen(responseFor(agent));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 0, resumed: 1, scanned: 1, skipped: 0 });
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toEqual([
    {
      id: expect.any(String) as string,
      method: "agent.prompt",
      params: { target: agent.pane_id, text: "go on" },
    },
  ]);
});

test("an accepted input with unchanged state records its region hash", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const { socketPath } = await listen(responseFor(agent));

  await runScanNow({ socketPath, stateDir });

  const diagnosticName = (await readdir(stateDir)).find((name: string): boolean =>
    name.endsWith(".jsonl"),
  );
  const diagnostic = await readFile(join(stateDir, diagnosticName ?? "missing"), "utf8");
  expect(diagnostic).toContain('"reason":"state_unchanged_after_send"');
  expect(diagnostic).toMatch(/"region_hash":"[a-f0-9]{64}"/u);
  expect(diagnostic).not.toContain("Please retry");
});

test("an idle rate-limit stall is resumed through the prompt interface", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const idleAgent: FakeAgent = {
    ...agent,
    agent_status: "idle",
    pane_id: "w3:p1",
    tab_id: "w3:t1",
    terminal_id: "term_idle",
    workspace_id: "w3",
  };
  const { requests, socketPath } = await listen(responseFor(idleAgent));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.resumed).toBe(1);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "agent.prompt")).toBe(
    true,
  );
});

test("the same terminal and message region are not resumed twice", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const { requests, socketPath } = await listen(responseFor(agent));

  await runScanNow({ socketPath, stateDir });
  const second = await runScanNow({ socketPath, stateDir });

  expect(second.resumed).toBe(0);
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test("a done to idle transition does not resume the same stall twice", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  let listCount = 0;
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      listCount += 1;
      return {
        agents: [{ ...agent, agent_status: listCount === 1 ? "done" : "idle" }],
        type: "agent_list",
      };
    }
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  await runScanNow({ socketPath, stateDir });
  const second = await runScanNow({ socketPath, stateDir });

  expect(second.resumed).toBe(0);
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test("a malformed agent response is isolated and diagnosed without terminal text", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const malformedRead = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.read") return { type: "unexpected" };
    return responseFor(agent)(request);
  };
  const { socketPath } = await listen(malformedRead);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 1, resumed: 0, scanned: 1, skipped: 0 });
  const diagnosticName = (await readdir(stateDir)).find((name: string): boolean =>
    name.endsWith(".jsonl"),
  );
  expect(diagnosticName).toBeDefined();
  const diagnostic = await readFile(join(stateDir, diagnosticName ?? "missing"), "utf8");
  expect(diagnostic).toContain('"result":"failed"');
  expect(diagnostic).not.toContain("Please retry");
});

test("a malformed list entry does not stop another agent", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      return { agents: [{ pane_id: "malformed" }, agent], type: "agent_list" };
    }
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 1, resumed: 1, scanned: 1, skipped: 0 });
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test("Herdr error text is not persisted in diagnostics", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.read") {
      return { __error: "secret terminal output: 429 limit" };
    }
    return responseFor(agent)(request);
  };
  const { socketPath } = await listen(responder);

  await runScanNow({ socketPath, stateDir });

  const diagnosticName = (await readdir(stateDir)).find((name: string): boolean =>
    name.endsWith(".jsonl"),
  );
  const diagnostic = await readFile(join(stateDir, diagnosticName ?? "missing"), "utf8");
  expect(diagnostic).toContain('"reason":"agent_operation_failed"');
  expect(diagnostic).not.toContain("secret terminal output");
});

test("the latest region is exactly 233 Unicode code points", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const message = `old output ${"🙂".repeat(10)} 429\nLiMiT ${"🙂".repeat(223)}`;
  const { requests, socketPath } = await listen(responseFor(agent, message));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.resumed).toBe(1);
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test("rate-limit tokens outside the latest 233 characters do not resume", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const message = `429 limit ${"x".repeat(234)}`;
  const { requests, socketPath } = await listen(responseFor(agent, message));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.skipped).toBe(1);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "agent.prompt")).toBe(
    false,
  );
});

test("an abort observed immediately before delivery suppresses input", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const controller = new AbortController();
  let getCount = 0;
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.get") {
      getCount += 1;
      if (getCount === 2) controller.abort();
    }
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ signal: controller.signal, socketPath, stateDir });

  expect(result.resumed).toBe(0);
  expect(
    requests.some((request: SocketRequest): boolean => request.method === "agent.prompt"),
  ).toBe(false);
});

test("a changed terminal revision prevents stale input", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const staleAgent = { ...agent, revision: agent.revision + 1 };
  const staleResponder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.get") return { agent: staleAgent, type: "agent_info" };
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(staleResponder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.skipped).toBe(1);
  expect(requests.some(({ method }: SocketRequest): boolean => method === "agent.prompt")).toBe(
    false,
  );
});

test("a candidate status transition with the same state sequence remains promptable", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.get") {
      return { agent: { ...agent, agent_status: "idle" }, type: "agent_info" };
    }
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.resumed).toBe(1);
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test.each([
  ["terminal identity", { terminal_id: "term_replaced" }],
  ["state change sequence", { state_change_seq: agent.state_change_seq + 1 }],
] as const)(
  "a changed %s prevents stale input",
  async (_label: string, change: Partial<FakeAgent>): Promise<void> => {
    const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
    resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
    const staleResponder = (request: SocketRequest): Record<string, unknown> => {
      if (request.method === "agent.get") {
        return { agent: { ...agent, ...change }, type: "agent_info" };
      }
      return responseFor(agent)(request);
    };
    const { requests, socketPath } = await listen(staleResponder);

    const result = await runScanNow({ socketPath, stateDir });

    expect(result.skipped).toBe(1);
    expect(requests.some(({ method }: SocketRequest): boolean => method === "agent.prompt")).toBe(
      false,
    );
  },
);

test("working activity allows the same rate-limit text to form a new stall", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  let listCount = 0;
  let currentAgent: FakeAgent = agent;
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      listCount += 1;
      currentAgent = { ...agent, agent_status: listCount === 2 ? "working" : "done" };
      return {
        agents: [currentAgent],
        type: "agent_list",
      };
    }
    return responseFor(currentAgent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  await runScanNow({ socketPath, stateDir });
  await runScanNow({ socketPath, stateDir });
  await runScanNow({ socketPath, stateDir });

  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(2);
});

test("one agent failure does not stop another workspace from resuming", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const brokenAgent: FakeAgent = {
    ...agent,
    pane_id: "w1:p1",
    tab_id: "w1:t1",
    terminal_id: "term_broken",
    workspace_id: "w1",
  };
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      return { agents: [brokenAgent, agent], type: "agent_list" };
    }
    if (request.method === "agent.read" && request.params["target"] === brokenAgent.pane_id) {
      return { type: "unexpected" };
    }
    const target = request.params["target"] === brokenAgent.pane_id ? brokenAgent : agent;
    return responseFor(target)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 1, resumed: 1, scanned: 2, skipped: 0 });
  expect(
    requests.filter(({ method }: SocketRequest): boolean => method === "agent.prompt"),
  ).toHaveLength(1);
});

test.each([
  ["Herdr error", { __error: "upstream failed" }],
  ["disconnect", { __disconnect: true }],
  ["timeout", { __noResponse: true }],
] as const)(
  "%s is isolated as an agent failure",
  async (_label: string, socketFailure: Record<string, unknown>): Promise<void> => {
    const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
    resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
    const responder = (request: SocketRequest): Record<string, unknown> => {
      if (request.method === "agent.read") return socketFailure;
      return responseFor(agent)(request);
    };
    const { socketPath } = await listen(responder);

    const result = await runScanNow({ requestTimeoutMs: 25, socketPath, stateDir });

    expect(result.failed).toBe(1);
    expect(result.resumed).toBe(0);
  },
);
