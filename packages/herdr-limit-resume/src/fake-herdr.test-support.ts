import { randomUUID } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";

export interface SocketRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface FakeAgent {
  agent: string;
  agent_status: "blocked" | "done" | "idle" | "unknown" | "working";
  focused: boolean;
  pane_id: string;
  revision: number;
  state_change_seq: number;
  tab_id: string;
  terminal_id: string;
  workspace_id: string;
}

type FakeReadSource = "detection" | "recent_unwrapped";
type FakeReadText = string | Partial<Record<FakeReadSource, string>>;

const servers: Server[] = [];

export const closeFakeHerdrServers = async (): Promise<void> => {
  await Promise.all(servers.splice(0).map(closeServer));
};

export const fakeAgent = {
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

export const responseFor =
  (
    targetAgent: FakeAgent,
    readText: FakeReadText = "Please retry: HTTP 429 RATE LIMIT reached",
    readRevision = targetAgent.revision,
  ): ((request: SocketRequest) => Record<string, unknown>) =>
  (request: SocketRequest): Record<string, unknown> => {
    if (request.method === "agent.list") {
      return { agents: [targetAgent], type: "agent_list" };
    }
    if (request.method === "agent.read") {
      const source = readSourceFor(request);
      return {
        read: {
          format: "text",
          pane_id: targetAgent.pane_id,
          revision: readRevision,
          source,
          tab_id: targetAgent.tab_id,
          text: textForSource(readText, source),
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
    if (request.method === "pane.send_input") return { type: "ok" };
    throw new Error(`Unexpected method: ${request.method}`);
  };

const readSourceFor = (request: SocketRequest): FakeReadSource => {
  const source = request.params["source"];
  if (source === "detection" || source === "recent_unwrapped") return source;
  throw new Error(`Unexpected read source: ${String(source)}`);
};

const textForSource = (readText: FakeReadText, source: FakeReadSource): string => {
  if (typeof readText === "string") return readText;
  return readText[source] ?? "";
};

export const listen = async (
  onRequest: (request: SocketRequest) => Record<string, unknown>,
): Promise<{ requests: SocketRequest[]; socketPath: string }> => {
  const socketPath =
    process.platform === "win32"
      ? `\\\\.\\pipe\\herdr-limit-resume-${randomUUID()}`
      : join("/tmp", `hlr-${randomUUID().slice(0, 8)}.sock`);
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
  servers.push(server);
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
