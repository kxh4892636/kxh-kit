import { createHash } from "node:crypto";
import { join } from "node:path";

export const sessionFile = (
  stateDir: string,
  socketPath: string,
  name: string,
  extension: string,
): string => {
  const sessionHash = createHash("sha256").update(socketPath).digest("hex").slice(0, 16);
  return join(stateDir, `${name}-${sessionHash}.${extension}`);
};
