import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { userInfo } from "node:os";
import { randomUUID } from "node:crypto";
export interface Paths {
  root: string;
  directory: string;
  versions: string;
  log: string;
  state: string;
  pipe: string;
}
export const pathsFor = (port: number, root?: string): Paths => {
  const base = root ?? process.env.LOCALAPPDATA;
  if (!base) throw new Error("LOCALAPPDATA is required");
  const directoryRoot = root ? resolve(root) : join(base, "dsh-keep-alive");
  const directory = join(directoryRoot, String(port));
  const user = createHash("sha256")
    .update(userInfo().username + directoryRoot.toLowerCase())
    .digest("hex")
    .slice(0, 24);
  return {
    root: directoryRoot,
    directory,
    versions: join(directory, "versions"),
    log: join(directory, "dsh.log"),
    state: join(directory, "state.json"),
    pipe: `\\\\.\\pipe\\dsh-keep-alive-${user}-${port}`,
  };
};
export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));
export const saveJson = async (path: string, value: unknown): Promise<void> => {
  const temporary = path + "." + randomUUID() + ".tmp";
  await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temporary, path);
};
export const preparePaths = async (paths: Paths): Promise<void> => {
  await mkdir(paths.versions, { recursive: true });
};
