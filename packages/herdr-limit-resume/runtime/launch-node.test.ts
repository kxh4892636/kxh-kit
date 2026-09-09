import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const resources: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    resources.splice(0).map(async (path: string): Promise<void> => {
      await rm(path, { force: true, recursive: true });
    }),
  );
});

test.runIf(process.platform !== "win32")(
  "launches through an NVM Node when the remote server PATH omits Node",
  async (): Promise<void> => {
    const home = await mkdtemp(join(tmpdir(), "herdr-limit-resume-home-"));
    resources.push(home);
    const nodeDir = join(home, ".nvm", "versions", "node", "v24.0.0", "bin");
    await mkdir(nodeDir, { recursive: true });
    await symlink(process.execPath, join(nodeDir, "node"));
    const launcher = fileURLToPath(new URL("./launch-node.cmd", import.meta.url));

    const invocation = execFileAsync(launcher, ["unknown"], {
      env: {
        HERDR_PLUGIN_STATE_DIR: home,
        HERDR_SOCKET_PATH: join(home, "missing.sock"),
        HOME: home,
        PATH: "/usr/local/bin:/usr/bin:/bin",
        SHELL: "/missing-shell",
      },
    });

    await expect(invocation).rejects.toMatchObject({
      code: 1,
      stderr: "Unknown command: unknown\n",
    });
  },
);
