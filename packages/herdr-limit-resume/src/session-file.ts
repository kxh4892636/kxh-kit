import { createHash } from "node:crypto";
import { join } from "node:path";

export const sessionFile = (
  stateDir: string,
  socketPath: string,
  name: string,
  extension: string,
): string => {
  return join(stateDir, `${name}-${sessionShard(socketPath)}.${extension}`);
};

export const sessionShard = (socketPath: string): string =>
  createHash("sha256").update(socketPath).digest("hex").slice(0, 16);
