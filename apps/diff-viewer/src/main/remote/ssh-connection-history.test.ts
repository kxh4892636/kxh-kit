import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createSshConnectionHistory } from "./ssh-connection-history.js";

describe("ssh-connection-history", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "diff-viewer-ssh-history-"));
    filePath = join(dir, "ssh-connections.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("文件缺失时 load 返回空列表", async () => {
    const history = createSshConnectionHistory({ filePath });
    expect(await history.load()).toEqual([]);
  });

  it("record 落盘并 load 回读; 最近使用在前", async () => {
    let tick = 0;
    const history = createSshConnectionHistory({
      filePath,
      now: () => new Date(1_700_000_000_000 + tick++ * 1000),
    });

    await history.record("git@example.com", "/srv/a");
    const after = await history.record("my-alias", "/opt/b");

    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ target: "my-alias", path: "/opt/b" });
    expect(after[1]).toMatchObject({ target: "git@example.com", path: "/srv/a" });

    const reloaded = createSshConnectionHistory({ filePath });
    expect(await reloaded.load()).toEqual(after);
  });

  it("重复连接同 target+path 去重并提升为最近", async () => {
    let tick = 0;
    const history = createSshConnectionHistory({
      filePath,
      now: () => new Date(1_700_000_000_000 + tick++ * 1000),
    });

    await history.record("h1", "/a");
    await history.record("h2", "/b");
    const after = await history.record("h1", "/a");

    expect(after.map((entry) => entry.target)).toEqual(["h1", "h2"]);
    expect(after[0].lastUsedAt > after[1].lastUsedAt).toBe(true);
  });

  it("超出容量上限时裁剪最旧条目", async () => {
    let tick = 0;
    const history = createSshConnectionHistory({
      filePath,
      maxEntries: 3,
      now: () => new Date(1_700_000_000_000 + tick++ * 1000),
    });

    for (const target of ["h1", "h2", "h3", "h4"]) {
      await history.record(target, "/x");
    }

    const loaded = await history.load();
    expect(loaded.map((entry) => entry.target)).toEqual(["h4", "h3", "h2"]);
  });

  it("损坏文件隔离留证后回退空列表", async () => {
    await writeFile(filePath, "{ not json", "utf8");
    const history = createSshConnectionHistory({ filePath });

    expect(await history.load()).toEqual([]);
    const remaining = await readdir(dir);
    expect(remaining.some((name) => name.startsWith("ssh-connections.json.corrupt-"))).toBe(true);

    // 隔离后还能正常写入
    await history.record("h1", "/a");
    expect(await history.load()).toHaveLength(1);
  });

  it("形状非法的条目被丢弃而不是拖垮整个文件", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        connections: [
          { target: "h1", path: "/a", lastUsedAt: "2026-01-01T00:00:00.000Z" },
          { target: 42, path: "/b", lastUsedAt: "x" },
          "garbage",
        ],
      }),
      "utf8",
    );

    const history = createSshConnectionHistory({ filePath });
    const loaded = await history.load();
    expect(loaded).toEqual([{ target: "h1", path: "/a", lastUsedAt: "2026-01-01T00:00:00.000Z" }]);
  });
});
