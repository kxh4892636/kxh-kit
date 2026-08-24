import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { runScanNow } from "./scan-now.js";

interface SocketRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface FakeAgent {
  agent: string;
  agent_status: "done" | "idle" | "working";
  focused: boolean;
  pane_id: string;
  revision: number;
  state_change_seq: number;
  tab_id: string;
  terminal_id: string;
  workspace_id: string;
}

const resources: Array<() => Promise<void>> = [];

afterEach(async (): Promise<void> => {
  await Promise.all(resources.splice(0).map(async (close): Promise<void> => close()));
});

const agent = {
  agent: "codex",
  agent_status: "done",
  focused: false,
  pane_id: "w2:p1",
  revision: 7,
  state_change_seq: 14,
  tab_id: "w2:t1",
  terminal_id: "term_done",
  workspace_id: "w2",
} as const;

const responseFor =
  (targetAgent: FakeAgent, detectionText = "Please retry: HTTP 429 RATE LIMIT reached") =>
  (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      return { agents: [targetAgent], type: "agent_list" };
    }
    if (request.method === "agent.read") {
      return {
        read: {
          format: "text",
          pane_id: targetAgent.pane_id,
          revision: targetAgent.revision,
          source: "detection",
          tab_id: targetAgent.tab_id,
          text: detectionText,
          truncated: false,
          workspace_id: targetAgent.workspace_id,
        },
        type: "pane_read",
      };
    }
    if (request.method === "agent.get") {
      return { agent: targetAgent, type: "agent_info" };
    }
    if (request.method === "agent.prompt") {
      return { agent: { ...targetAgent, agent_status: "working" }, type: "agent_prompted" };
    }
    throw new Error(`Unexpected method: ${request.method}`);
  };

const listen = async (
  onRequest: (request: SocketRequest) => Record<string, unknown>,
): Promise<{ requests: SocketRequest[]; socketPath: string }> => {
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\herdr-limit-resume-${randomUUID()}`
      : join(tmpdir(), `herdr-limit-resume-${randomUUID()}.sock`);
  const requests: SocketRequest[] = [];
  const server = createServer((socket: Socket): void => {
    let buffered = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string): void => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const request = JSON.parse(line) as SocketRequest;
        requests.push(request);
        const result = onRequest(request);
        if (result["__disconnect"] === true) {
          socket.destroy();
          continue;
        }
        if (result["__noResponse"] === true) continue;
        if (typeof result["__error"] === "string") {
          socket.write(
            `${JSON.stringify({ error: { code: "test_error", message: result["__error"] }, id: request.id })}\n`,
          );
          continue;
        }
        socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
      }
    });
  });
  await new Promise<void>((resolve, reject): void => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  resources.push(async (): Promise<void> => closeServer(server));
  return { requests, socketPath };
};

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject): void => {
    server.close((error?: Error): void => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
};

test("a done rate-limit stall is resumed once across all workspaces", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const { requests, socketPath } = await listen(responseFor(agent));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 0, resumed: 1, scanned: 1, skipped: 0 });
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toEqual([
    {
      id: expect.any(String) as string,
      method: "agent.prompt",
      params: { target: agent.pane_id, text: "go on" },
    },
  ]);
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
  expect(requests.some(({ method }): boolean => method === "agent.prompt")).toBe(true);
});

test("the same terminal and message region are not resumed twice", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const { requests, socketPath } = await listen(responseFor(agent));

  await runScanNow({ socketPath, stateDir });
  const second = await runScanNow({ socketPath, stateDir });

  expect(second.resumed).toBe(0);
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
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
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
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
  const diagnosticName = (await readdir(stateDir)).find((name): boolean => name.endsWith(".jsonl"));
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
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
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

  const diagnosticName = (await readdir(stateDir)).find((name): boolean => name.endsWith(".jsonl"));
  const diagnostic = await readFile(join(stateDir, diagnosticName ?? "missing"), "utf8");
  expect(diagnostic).toContain('"reason":"agent_operation_failed"');
  expect(diagnostic).not.toContain("secret terminal output");
});

test("the latest region is exactly 55 Unicode code points", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const message = `old output ${"🙂".repeat(10)} 429\nLiMiT ${"🙂".repeat(45)}`;
  const { requests, socketPath } = await listen(responseFor(agent, message));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.resumed).toBe(1);
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
});

test("rate-limit tokens outside the latest 55 characters do not resume", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  const message = `429 limit ${"x".repeat(56)}`;
  const { requests, socketPath } = await listen(responseFor(agent, message));

  const result = await runScanNow({ socketPath, stateDir });

  expect(result.skipped).toBe(1);
  expect(requests.some(({ method }): boolean => method === "agent.prompt")).toBe(false);
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
  expect(requests.some(({ method }): boolean => method === "agent.prompt")).toBe(false);
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
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
});

test.each([
  ["terminal identity", { terminal_id: "term_replaced" }],
  ["state change sequence", { state_change_seq: agent.state_change_seq + 1 }],
] as const)("a changed %s prevents stale input", async (_label, change): Promise<void> => {
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
  expect(requests.some(({ method }): boolean => method === "agent.prompt")).toBe(false);
});

test("working activity allows the same rate-limit text to form a new stall", async (): Promise<void> => {
  const stateDir = await mkdtemp(join(tmpdir(), "herdr-limit-resume-state-"));
  resources.push(async (): Promise<void> => rm(stateDir, { force: true, recursive: true }));
  let listCount = 0;
  const responder = (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      listCount += 1;
      return {
        agents: [{ ...agent, agent_status: listCount === 2 ? "working" : "done" }],
        type: "agent_list",
      };
    }
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  await runScanNow({ socketPath, stateDir });
  await runScanNow({ socketPath, stateDir });
  await runScanNow({ socketPath, stateDir });

  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(2);
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
    return responseFor(agent)(request);
  };
  const { requests, socketPath } = await listen(responder);

  const result = await runScanNow({ socketPath, stateDir });

  expect(result).toEqual({ failed: 1, resumed: 1, scanned: 2, skipped: 0 });
  expect(requests.filter(({ method }): boolean => method === "agent.prompt")).toHaveLength(1);
});

test.each([
  ["Herdr error", { __error: "upstream failed" }],
  ["disconnect", { __disconnect: true }],
  ["timeout", { __noResponse: true }],
] as const)("%s is isolated as an agent failure", async (_label, socketFailure): Promise<void> => {
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
});
