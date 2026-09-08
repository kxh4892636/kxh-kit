import { createConnection, createServer, type Server, type Socket } from "node:net";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { errorText, replySchema, requestSchema, type Reply, type Request } from "../contract.js";
const MAX_MESSAGE = 1024 * 1024;
const lineReader = (socket: Socket, onLine: (line: string) => void): void => {
  let text = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string): void => {
    text += chunk;
    if (Buffer.byteLength(text) > MAX_MESSAGE) {
      socket.destroy();
      return;
    }
    const end = text.indexOf("\n");
    if (end >= 0) {
      socket.removeAllListeners("data");
      onLine(text.slice(0, end));
    }
  });
};
const proof = (token: string, nonce: string): string =>
  createHmac("sha256", token).update(nonce).digest("hex");
export const request = async (
  pipe: string,
  message: Request,
  timeout: number = 720000,
  token: string = "",
): Promise<Reply> =>
  new Promise(
    (
      resolve: (value: Reply | PromiseLike<Reply>) => void,
      reject: (reason?: unknown) => void,
    ): void => {
      const socket = createConnection(pipe);
      let received = false;
      socket.setTimeout(timeout, (): void => {
        socket.destroy(new Error("Supervisor request timed out"));
      });
      socket.once("error", reject);
      const nonce = randomBytes(32).toString("hex");
      socket.once("connect", (): void => {
        socket.write(nonce + "\n");
      });
      lineReader(socket, (answer: string): void => {
        if (answer !== proof(token, nonce)) {
          socket.destroy(new Error("Supervisor identity verification failed"));
          return;
        }
        lineReader(socket, (line: string): void => {
          received = true;
          try {
            resolve(replySchema.parse(JSON.parse(line)));
          } catch (error) {
            reject(error);
          }
          socket.destroy();
        });
        socket.write(JSON.stringify({ token, message }) + "\n");
      });
      socket.once("close", (): void => {
        if (!received) reject(new Error("Supervisor connection closed"));
      });
    },
  );
export const serve = async (
  pipe: string,
  dispatch: (message: Request) => Promise<Reply>,
  token: string = "",
): Promise<Server> => {
  const server = createServer((socket: Socket): void => {
    socket.on("error", (): void => {});
    socket.setTimeout(720000, (): void => {
      socket.destroy();
    });
    lineReader(socket, (nonce: string): void => {
      if (!/^[a-f0-9]{64}$/.test(nonce)) {
        socket.end();
        return;
      }
      lineReader(socket, (line: string): void => {
        void (async (): Promise<void> => {
          let reply: Reply;
          try {
            const envelope = z
              .object({ token: z.literal(token), message: requestSchema })
              .parse(JSON.parse(line));
            reply = await dispatch(envelope.message);
          } catch (error) {
            reply = { ok: false, error: errorText(error) };
          }
          socket.end(JSON.stringify(reply) + "\n");
        })();
      });
      socket.write(proof(token, nonce) + "\n");
    });
  });
  await new Promise<void>(
    (
      resolve: (value: void | PromiseLike<void>) => void,
      reject: (reason?: unknown) => void,
    ): void => {
      server.once("error", reject);
      server.listen(pipe, resolve);
    },
  );
  return server;
};
