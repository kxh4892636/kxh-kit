import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { isRecord } from "./boundary.js";

export const AGENT_STATUS = {
  blocked: "blocked",
  done: "done",
  idle: "idle",
  unknown: "unknown",
  working: "working",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export interface AgentInfo {
  agent_status: AgentStatus;
  pane_id: string;
  revision: number;
  state_change_seq: number;
  tab_id: string;
  terminal_id: string;
  workspace_id: string;
}

export interface AgentRead {
  revision: number;
  text: string;
}

type ReadSource = "detection" | "recent_unwrapped";

export type AgentListEntry = { agent: AgentInfo; ok: true } | { index: number; ok: false };

export interface HerdrPort {
  getAgent(target: string): Promise<AgentInfo>;
  listAgents(): Promise<AgentListEntry[]>;
  promptAgent(target: string, text: string): Promise<void>;
  readLatest(target: string): Promise<AgentRead>;
  sendPaneInput(paneId: string, text: string, keys: string[]): Promise<void>;
}

interface SocketSuccess {
  id: string;
  result: unknown;
}

const readString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Herdr response is missing ${key}`);
  return value;
};

const readNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Herdr response has invalid ${key}`);
  }
  return value;
};

const parseAgent = (value: unknown): AgentInfo => {
  if (!isRecord(value)) throw new Error("Herdr response has invalid agent");
  const status = readString(value, "agent_status");
  if (!Object.values(AGENT_STATUS).includes(status as AgentStatus)) {
    throw new Error("Herdr response has invalid agent_status");
  }
  return {
    agent_status: status as AgentStatus,
    pane_id: readString(value, "pane_id"),
    revision: readNumber(value, "revision"),
    state_change_seq: readNumber(value, "state_change_seq"),
    tab_id: readString(value, "tab_id"),
    terminal_id: readString(value, "terminal_id"),
    workspace_id: readString(value, "workspace_id"),
  };
};

export class HerdrSocket implements HerdrPort {
  readonly #socketPath: string;
  readonly #timeoutMs: number;

  public constructor(socketPath: string, timeoutMs = 5_000) {
    this.#socketPath = socketPath;
    this.#timeoutMs = timeoutMs;
  }

  public async listAgents(): Promise<AgentListEntry[]> {
    const result = await this.#request("agent.list", {});
    if (!isRecord(result) || result["type"] !== "agent_list" || !Array.isArray(result["agents"])) {
      throw new Error("Herdr response has invalid agent_list result");
    }
    return result["agents"].map((value: unknown, index: number): AgentListEntry => {
      try {
        return { agent: parseAgent(value), ok: true };
      } catch {
        return { index, ok: false };
      }
    });
  }

  public async getAgent(target: string): Promise<AgentInfo> {
    const result = await this.#request("agent.get", { target });
    if (!isRecord(result) || result["type"] !== "agent_info") {
      throw new Error("Herdr response has invalid agent_info result");
    }
    return parseAgent(result["agent"]);
  }

  public async isPluginEnabled(pluginId: string): Promise<boolean> {
    const result = await this.#request("plugin.list", { plugin_id: pluginId });
    if (
      !isRecord(result) ||
      result["type"] !== "plugin_list" ||
      !Array.isArray(result["plugins"])
    ) {
      throw new Error("Herdr response has invalid plugin_list result");
    }
    return result["plugins"].some((value: unknown): boolean => {
      if (!isRecord(value)) throw new Error("Herdr response has invalid plugin");
      const enabled = value["enabled"];
      if (typeof enabled !== "boolean")
        throw new Error("Herdr response has invalid plugin enabled");
      return readString(value, "plugin_id") === pluginId && enabled;
    });
  }

  public async readLatest(target: string): Promise<AgentRead> {
    return await this.#readAgent(target, "recent_unwrapped");
  }

  async #readAgent(target: string, source: ReadSource): Promise<AgentRead> {
    const result = await this.#request("agent.read", {
      format: "text",
      source,
      strip_ansi: true,
      target,
    });
    if (!isRecord(result) || result["type"] !== "pane_read" || !isRecord(result["read"])) {
      throw new Error("Herdr response has invalid pane_read result");
    }
    return {
      revision: readNumber(result["read"], "revision"),
      text: readString(result["read"], "text"),
    };
  }

  public async promptAgent(target: string, text: string): Promise<void> {
    const result = await this.#request("agent.prompt", { target, text });
    if (!isRecord(result) || result["type"] !== "agent_prompted") {
      throw new Error("Herdr response has invalid agent_prompted result");
    }
  }

  public async sendPaneInput(paneId: string, text: string, keys: string[]): Promise<void> {
    const result = await this.#request("pane.send_input", { keys, pane_id: paneId, text });
    if (!isRecord(result) || result["type"] !== "ok") {
      throw new Error("Herdr response has invalid pane.send_input result");
    }
  }

  async #request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = `limit-resume:${randomUUID()}`;
    const request = `${JSON.stringify({ id, method, params })}\n`;
    return await new Promise<unknown>((resolve, reject): void => {
      const socket = createConnection(this.#socketPath);
      let buffered = "";
      let settled = false;
      const finish = (error: Error | undefined, result?: unknown): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error === undefined) resolve(result);
        else reject(error);
      };
      socket.setEncoding("utf8");
      socket.setTimeout(this.#timeoutMs, (): void => {
        finish(new Error(`Herdr request timed out: ${method}`));
      });
      socket.on("connect", (): void => {
        socket.write(request);
      });
      socket.on("error", (error: Error): void => finish(error));
      socket.on("close", (): void => {
        finish(new Error(`Herdr connection closed before response: ${method}`));
      });
      socket.on("data", (chunk: string): void => {
        buffered += chunk;
        const newlineIndex = buffered.indexOf("\n");
        if (newlineIndex < 0) return;
        try {
          const response = JSON.parse(buffered.slice(0, newlineIndex)) as unknown;
          finish(undefined, parseResponse(response, id));
        } catch (error: unknown) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}

const parseResponse = (value: unknown, id: string): unknown => {
  if (!isRecord(value) || value["id"] !== id) throw new Error("Herdr response id mismatch");
  if ("error" in value) {
    if (!isRecord(value["error"])) throw new Error("Herdr response has invalid error");
    const code = readString(value["error"], "code");
    const message = readString(value["error"], "message");
    throw new Error(`${code}: ${message}`);
  }
  if (!("result" in value)) throw new Error("Herdr response is missing result");
  return (value as unknown as SocketSuccess).result;
};
