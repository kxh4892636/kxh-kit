import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileSystemLike } from "./contract.js";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHostFs, fsServiceHostFs, nodeHostFs } from "./boundary.js";

let cleanup: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-nested-skill-"));
  cleanup.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
  cleanup = [];
});

describe("nodeHostFs", () => {
  it("lists, reads, and probes real files", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "x"), { recursive: true });
    await writeFile(join(dir, "x", "SKILL.md"), "content", "utf8");
    const entries = await nodeHostFs.listDir(dir);
    expect(entries).toContainEqual({ name: "x", path: join(dir, "x"), kind: "directory" });
    expect(await nodeHostFs.readText(join(dir, "x", "SKILL.md"))).toBe("content");
    expect(await nodeHostFs.exists(join(dir, "x", "SKILL.md"))).toBe(true);
  });

  it("treats missing paths as empty or absent", async () => {
    const dir = await tempDir();
    expect(await nodeHostFs.listDir(join(dir, "missing"))).toEqual([]);
    expect(await nodeHostFs.readText(join(dir, "missing"))).toBeUndefined();
    expect(await nodeHostFs.exists(join(dir, "missing"))).toBe(false);
  });

  it("treats a file path as a missing directory listing", async () => {
    const dir = await tempDir();
    const file = join(dir, "file.txt");
    await writeFile(file, "x", "utf8");
    expect(await nodeHostFs.listDir(file)).toEqual([]);
  });

  it("skips directory junctions and broken links during the walk", async () => {
    const dir = await tempDir();
    const target = join(dir, "target");
    await mkdir(target);
    const junction = join(dir, "junction");
    await symlink(target, junction, "junction");
    const entries = await nodeHostFs.listDir(dir);
    expect(entries.find((entry) => entry.name === "junction")).toBeUndefined();
    const broken = join(dir, "broken");
    await symlink(join(dir, "nowhere"), broken, "junction");
    const after = await nodeHostFs.listDir(dir);
    expect(after.find((entry) => entry.name === "broken")).toBeUndefined();
  });
});

describe("fsServiceHostFs", () => {
  const fakeFs = (
    files: Record<string, string | { type: "file" | "directory" }>,
  ): FileSystemLike => {
    const resolve = async (path: string) =>
      path in files ? { targetKey: path, displayPath: path } : undefined;
    return {
      resolve,
      listDir: async (target: { targetKey: string }) => {
        const prefix = `${target.targetKey}/`;
        const children = new Map<string, { type: "file" | "directory" }>();
        for (const key of Object.keys(files)) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const [head] = rest.split("/");
          if (head === undefined || head.length === 0) continue;
          if (!children.has(head)) {
            children.set(head, { type: rest.includes("/") ? "directory" : "file" });
          }
        }
        return [...children.entries()].map(([name, value]) => ({
          name,
          type: value.type,
          target: { targetKey: `${prefix}${name}`, displayPath: `${prefix}${name}` },
        }));
      },
      stat: async (target: { targetKey: string }) => {
        if (!(target.targetKey in files)) return undefined;
        const value = files[target.targetKey] as { type: "file" | "directory" };
        return { version: { v: 1 } as never, type: value.type, size: 1 };
      },
      readText: async (target: { targetKey: string }) => files[target.targetKey] as string,
    } as unknown as FileSystemLike;
  };

  it("lists, reads, and probes through the service contract", async () => {
    const fs = fakeFs({
      "/root": { type: "directory" },
      "/root/x/SKILL.md": { type: "file" },
      "/root/x": { type: "directory" },
    });
    const host = fsServiceHostFs(fs);
    expect(await host.listDir("/root")).toContainEqual({
      name: "x",
      path: "/root/x",
      kind: "directory",
    });
    expect(await host.readText("/root/x")).toBeUndefined();
    expect(await host.exists("/root/x")).toBe(true);
  });

  it("treats missing service paths as empty or absent", async () => {
    const host = fsServiceHostFs(fakeFs({}));
    expect(await host.listDir("/nope")).toEqual([]);
    expect(await host.readText("/nope")).toBeUndefined();
    expect(await host.exists("/nope")).toBe(false);
  });

  it("treats service missing codes as absent at each layer", async () => {
    const missing = (code: string) => Object.assign(new Error(code), { code });
    const resolveThrows = {
      resolve: async () => {
        throw missing("FS_NOT_FOUND");
      },
      listDir: async () => [],
      stat: async () => undefined,
      readText: async () => undefined,
    } as unknown as FileSystemLike;
    const host = fsServiceHostFs(resolveThrows);
    expect(await host.listDir("/x")).toEqual([]);
    expect(await host.readText("/x")).toBeUndefined();
    expect(await host.exists("/x")).toBe(false);

    const listThrows = {
      resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
      listDir: async () => {
        throw missing("FS_NOT_DIRECTORY");
      },
      stat: async () => undefined,
      readText: async () => undefined,
    } as unknown as FileSystemLike;
    expect(await fsServiceHostFs(listThrows).listDir("/x")).toEqual([]);
  });

  it("propagates non-missing service errors", async () => {
    const boom = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const failing = {
      resolve: async () => {
        throw boom;
      },
      readText: async () => {
        throw boom;
      },
      stat: async () => {
        throw boom;
      },
      listDir: async () => {
        throw boom;
      },
    } as unknown as FileSystemLike;
    const host = fsServiceHostFs(failing);
    await expect(host.listDir("/x")).rejects.toThrow("EACCES");
    await expect(host.readText("/x")).rejects.toThrow("EACCES");
    await expect(host.exists("/x")).rejects.toThrow("EACCES");
  });
});

describe("defaultHostFs", () => {
  it("prefers the fs service when present", () => {
    const host = defaultHostFs({
      get: (key: string) => (key === "fs" ? { resolve: async () => undefined } : undefined),
    });
    expect(host).not.toBe(nodeHostFs);
  });

  it("falls back to node fs without a service", () => {
    const host = defaultHostFs({ get: () => undefined });
    expect(host).toBe(nodeHostFs);
  });
});
