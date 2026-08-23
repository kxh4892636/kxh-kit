import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { JsonValue } from "../../cli/types";

export interface FakeRequest {
  readonly action: string;
  readonly key?: string;
  readonly params?: Readonly<Record<string, JsonValue>>;
  readonly version: number;
}

export interface FakeResponse {
  readonly body?: unknown;
  readonly error?: string;
  readonly result?: JsonValue;
  readonly status?: number;
}

export interface FakeAnkiConnect {
  readonly url: string;
  readonly requests: FakeRequest[];
  readonly close: () => Promise<void>;
}

const parseRequest = (body: string): FakeRequest => {
  const value: unknown = JSON.parse(body);
  if (
    typeof value !== "object" ||
    value === null ||
    !("action" in value) ||
    typeof value.action !== "string" ||
    !("version" in value) ||
    typeof value.version !== "number"
  ) {
    throw new Error("Invalid fake AnkiConnect request");
  }
  return value as FakeRequest;
};

export const startFakeAnkiConnect = (
  respond: (request: FakeRequest, attempt: number) => FakeResponse | Promise<FakeResponse>,
): Promise<FakeAnkiConnect> =>
  new Promise(
    (resolve: (value: FakeAnkiConnect) => void, reject: (reason?: unknown) => void): void => {
      const requests: FakeRequest[] = [];
      let attempts = 0;
      const server: Server = createServer(
        (request: IncomingMessage, response: ServerResponse): void => {
          let body = "";
          request.on("data", (chunk: Buffer): void => void (body += chunk.toString("utf8")));
          request.on("end", (): void => {
            try {
              const parsed = parseRequest(body);
              requests.push(parsed);
              attempts += 1;
              void Promise.resolve(respond(parsed, attempts))
                .then((output: FakeResponse): void => {
                  response.statusCode = output.status ?? 200;
                  response.setHeader("Content-Type", "application/json");
                  response.end(
                    JSON.stringify(
                      output.body ?? { result: output.result ?? null, error: output.error ?? null },
                    ),
                  );
                })
                .catch((error: unknown): void => {
                  response.statusCode = 500;
                  response.end(JSON.stringify({ result: null, error: String(error) }));
                });
            } catch (error) {
              response.statusCode = 400;
              response.end(JSON.stringify({ result: null, error: String(error) }));
            }
          });
        },
      );
      server.on("error", (error: Error): void => reject(error));
      server.listen(0, "127.0.0.1", (): void => {
        const address = server.address() as AddressInfo;
        resolve({
          url: `http://127.0.0.1:${address.port}`,
          requests,
          close: async (): Promise<void> =>
            new Promise((done: () => void, fail: (reason?: unknown) => void): void => {
              server.close((error?: Error): void => {
                if (error === undefined) done();
                else fail(error);
              });
            }),
        });
      });
    },
  );
