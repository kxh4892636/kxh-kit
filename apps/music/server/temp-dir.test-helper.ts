import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Temp directories a test file creates under the OS temp root. Each file calls
 * `cleanupTempDirs` from its own `afterAll`, so a run leaves nothing behind
 * (the earlier helpers leaked 878 directories and 198 MB in one working week).
 */
const created: string[] = [];

export const tempDir = (prefix: string): string => {
  const dir: string = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
};

export const cleanupTempDirs = (): void => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
};
