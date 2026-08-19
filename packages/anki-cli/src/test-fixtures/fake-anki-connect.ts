import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeAnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
  key?: string;
}

export interface FakeResponderOutput {
  result?: unknown;
  error?: string;
  /** 直接以该 HTTP 状态响应(模拟 403/500 等), 与 result/error 互斥 */
  status?: number;
}

export type FakeResponder = (
  request: FakeAnkiConnectRequest,
  attempt: number,
) => FakeResponderOutput | Promise<FakeResponderOutput>;

export interface FakeAnkiConnect {
  url: string;
  requests: FakeAnkiConnectRequest[];
  close: () => Promise<void>;
}

// 假 AnkiConnect: 本地 HTTP 服务器, 记录收到的请求并按 responder 应答。
export const startFakeAnkiConnect = (responder: FakeResponder): Promise<FakeAnkiConnect> =>
  new Promise((resolve, reject) => {
    const requests: FakeAnkiConnectRequest[] = [];
    let attempts = 0;

    const server: Server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString("utf-8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as FakeAnkiConnectRequest;
        requests.push(parsed);
        attempts++;

        void (async () => {
          try {
            const output = await responder(parsed, attempts);
            if (output.status !== undefined) {
              res.statusCode = output.status;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ result: null, error: null }));
              return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                result: output.result ?? null,
                error: output.error ?? null,
              }),
            );
          } catch {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ result: null, error: "internal" }));
          }
        })();
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
