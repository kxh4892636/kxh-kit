import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { deleteSessionLogs, nodeSessionLogIo } from "./purge.js";

const created: string[] = [];

const tempRoot = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "dsh-toolkit-logs-"));
  created.push(path);
  return path;
};

afterEach(async () => {
  for (const path of created.splice(0)) await rm(path, { recursive: true, force: true });
});

describe("nodeSessionLogIo", () => {
  it("lists only directories and ignores a missing root", async () => {
    const root = await tempRoot();
    await mkdir(join(root, "workspace-a"), { recursive: true });
    await writeFile(join(root, "note.txt"), "x", "utf8");
    await expect(nodeSessionLogIo.listDirs(root)).resolves.toEqual(["workspace-a"]);
    await expect(nodeSessionLogIo.listDirs(join(root, "missing"))).resolves.toEqual([]);
  });

  it("removes a directory tree and tolerates a missing one", async () => {
    const root = await tempRoot();
    const session = join(root, "workspace-a", "session-1");
    await mkdir(session, { recursive: true });
    await writeFile(join(session, "session.v4.jsonl.zstd"), "x", "utf8");
    await nodeSessionLogIo.removeDir(session);
    await expect(readdir(join(root, "workspace-a"))).resolves.toEqual([]);
    await expect(nodeSessionLogIo.removeDir(session)).resolves.toBeUndefined();
  });

  it("deletes a real session directory through deleteSessionLogs", async () => {
    const root = await tempRoot();
    const session = join(root, "workspace-a", "session-9");
    await mkdir(session, { recursive: true });
    await writeFile(join(session, "session.v4.jsonl.zstd"), "x", "utf8");
    const result = await deleteSessionLogs(root, ["session-9", "bad/id"]);
    expect(result).toEqual({ deleted: ["session-9"], retained: ["bad/id"] });
    await expect(readdir(join(root, "workspace-a"))).resolves.toEqual([]);
  });
});
