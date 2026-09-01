import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { JsonError } from "../errors";
import { scriptedPort, invokeAnki } from "../testing/test-harness";
import { deleteMedia, listMedia, retrieveMedia, storeMedia } from "./media-operations";

const directories: string[] = [];
afterEach(async (): Promise<void> => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("media command boundaries", (): void => {
  test.each([undefined, ""])(
    "lists without filter metadata for pattern %j",
    async (pattern): Promise<void> => {
      await expect(
        listMedia(
          scriptedPort((): null => null, []),
          pattern,
        ),
      ).resolves.toMatchObject({
        files: [],
        count: 0,
        message: "Found 0 media file(s)",
      });
    },
  );

  test("reports underscore-prefixed stored names", async (): Promise<void> => {
    await expect(
      storeMedia(
        scriptedPort((): string => "_safe.png", []),
        "_safe.png",
        { data: "eA==" },
      ),
    ).resolves.toMatchObject({ prefixedWithUnderscore: true });
  });

  test.each([
    [
      "list",
      (failure: unknown) => listMedia(scriptedPort(async () => Promise.reject(failure), [])),
    ],
    [
      "retrieve",
      (failure: unknown) =>
        retrieveMedia(
          scriptedPort(async () => Promise.reject(failure), []),
          "a.png",
        ),
    ],
    [
      "store",
      (failure: unknown) =>
        storeMedia(
          scriptedPort(async () => Promise.reject(failure), []),
          "a.png",
          { data: "x" },
        ),
    ],
    [
      "delete",
      (failure: unknown) =>
        deleteMedia(
          scriptedPort(async () => Promise.reject(failure), []),
          "a.png",
        ),
    ],
  ])("preserves structured %s operation errors", async (_name, operation): Promise<void> => {
    const error = new JsonError("structured", { action: "custom" });
    await expect(operation(error)).rejects.toBe(error);
  });

  test("requires exactly one store source and a derived data filename", async (): Promise<void> => {
    expect((await invokeAnki(["media", "store", "--dry-run"])).code).toBe(2);
    expect((await invokeAnki(["media", "store", "--data", "eA==", "--dry-run"])).code).toBe(2);
  });

  test("derives a URL filename from its host when the path has no basename", async (): Promise<void> => {
    const result = await invokeAnki(
      ["media", "store", "--url", "http://127.0.0.1/", "--dry-run"],
      (): undefined => undefined,
      { env: { MEDIA_ALLOWED_HOSTS: "127.0.0.1" } },
    );
    expect(JSON.parse(result.stdout).preview.actions[0].params.filename).toBe("127.0.0.1");
  });

  test("previews no output file when retrieved media is missing", async (): Promise<void> => {
    const result = await invokeAnki(
      ["media", "get", "--filename", "missing.png", "--out", "missing.png", "--dry-run"],
      (): false => false,
    );
    expect(JSON.parse(result.stdout).preview.files).toEqual([]);
  });

  test.each(["", "   "])("rejects empty required text %j", async (value): Promise<void> => {
    expect((await invokeAnki(["media", "get", `--filename=${value}`])).code).toBe(2);
  });

  test("uses real filesystem fallbacks for local access, output, and removal", async (): Promise<void> => {
    const root = await mkdtemp(path.join(tmpdir(), "nf-media-boundary-"));
    directories.push(root);
    const source = path.join(root, "source.png");
    const output = path.join(root, "output.png");
    await writeFile(source, "source");
    const stored = await invokeAnki(
      ["media", "store", "--file", "source.png", "--delete-original"],
      (): string => "source.png",
      { cwd: root },
    );
    expect(stored.code).toBe(0);
    await expect(readFile(source)).rejects.toThrow();

    const fetched = await invokeAnki(
      ["media", "get", "--filename", "a.png", "--out", "output.png"],
      (): string => "aGVsbG8=",
      { cwd: root },
    );
    expect(fetched.code).toBe(0);
    expect(await readFile(output, "utf8")).toBe("hello");
  });

  test.each([
    ["access", { accessFile: async (): Promise<never> => Promise.reject("denied") }],
    ["write", { writeFile: async (): Promise<never> => Promise.reject("full") }],
    ["remove", { removeFile: async (): Promise<never> => Promise.reject("locked") }],
  ])("normalizes primitive %s filesystem failures", async (kind, dependencies): Promise<void> => {
    const root = await mkdtemp(path.join(tmpdir(), "nf-media-failure-"));
    directories.push(root);
    await writeFile(path.join(root, "source.png"), "x");
    const argv =
      kind === "write"
        ? ["media", "get", "--filename", "a.png", "--out", "a.png"]
        : ["media", "store", "--file", "source.png", "--delete-original"];
    const result = await invokeAnki(
      argv,
      (): string => (kind === "write" ? "eA==" : "source.png"),
      {
        cwd: root,
        ...dependencies,
      },
    );
    expect(result.code).not.toBe(0);
  });
});
