import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { invokeAnki } from "../testing/test-harness";

describe("loopx anki media", (): void => {
  test.each([
    ["media", "--help"],
    ["media", "list", "--help"],
    ["media", "get", "--help"],
    ["media", "store", "--help"],
    ["media", "delete", "--help"],
  ])("renders offline help for %s", async (...argv: string[]): Promise<void> => {
    const result = await invokeAnki(argv);
    expect([result.code, result.invocations.length]).toEqual([0, 0]);
  });

  test("lists and retrieves base64 media as queries", async (): Promise<void> => {
    const listed = await invokeAnki(["media", "list", "--pattern", "*.mp3"], (): string[] => [
      "a.mp3",
    ]);
    expect(listed.invocations[0]).toEqual({
      action: "getMediaFilesNames",
      params: { pattern: "*.mp3" },
    });
    const fetched = await invokeAnki(
      ["media", "get", "--filename", "../a.mp3"],
      (): string => "aGVsbG8=",
    );
    expect(fetched.invocations[0]?.params).toEqual({ filename: "a.mp3" });
    expect(JSON.parse(fetched.stdout)).toMatchObject({ found: true, data: "aGVsbG8=" });
  });

  test("writes retrieved media only outside dry-run and previews both effects", async (): Promise<void> => {
    const writes: Array<{ path: string; text: string }> = [];
    const writeFile = async (path: string, data: Uint8Array): Promise<void> => {
      writes.push({ path, text: Buffer.from(data).toString("utf8") });
    };
    const live = await invokeAnki(
      ["media", "get", "--filename", "a.mp3", "--out", "result.mp3"],
      (): string => "aGVsbG8=",
      { cwd: "C:\\work", writeFile },
    );
    expect(writes).toEqual([{ path: resolve("C:\\work", "result.mp3"), text: "hello" }]);
    expect(JSON.parse(live.stdout)).toMatchObject({ found: true, data: "aGVsbG8=" });
    expect(JSON.parse(live.stdout)).not.toHaveProperty("out");

    writes.length = 0;
    const dry = await invokeAnki(
      ["media", "get", "--filename", "a.mp3", "--out", "result.mp3", "--dry-run"],
      (): string => "aGVsbG8=",
      { cwd: "C:\\work", writeFile },
    );
    expect([dry.invocations.length, writes.length]).toEqual([1, 0]);
    expect(JSON.parse(dry.stdout).preview).toMatchObject({
      actions: [{ action: "retrieveMediaFile" }],
      files: [{ action: "write" }],
    });

    writes.length = 0;
    const missing = await invokeAnki(
      ["media", "get", "--filename", "missing.mp3", "--out", "result.mp3"],
      (): false => false,
      { writeFile },
    );
    expect([missing.code, JSON.parse(missing.stdout).found, writes.length]).toEqual([0, false, 0]);
  });

  test("stores a validated local media file and deletes the source after success", async (): Promise<void> => {
    const removed: string[] = [];
    const result = await invokeAnki(
      ["media", "store", "--file", "pic.png", "--filename", "../pic.png", "--delete-original"],
      (): string => "pic.png",
      {
        cwd: "C:\\work",
        accessFile: async (): Promise<void> => undefined,
        removeFile: async (path: string): Promise<void> => void removed.push(path),
      },
    );
    expect(result.invocations[0]).toEqual({
      action: "storeMediaFile",
      params: { filename: "pic.png", deleteExisting: true, path: resolve("C:\\work", "pic.png") },
    });
    expect(removed).toEqual([resolve("C:\\work", "pic.png")]);
  });

  test("validates unsafe inputs before connecting and dry-runs local deletion", async (): Promise<void> => {
    const blocked = await invokeAnki(["media", "store", "--url", "http://127.0.0.1/a.png"]);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("MEDIA_ALLOWED_HOSTS");
    expect((await invokeAnki(["media", "store", "--file", "secret.txt"])).code).toBe(2);
    expect((await invokeAnki(["media", "store", "--file", "a.png", "--data", "eA=="])).code).toBe(
      2,
    );
    const opaqueData = await invokeAnki(
      ["media", "store", "--data", "not-base64", "--filename", "a.png"],
      (): string => "a.png",
    );
    expect(opaqueData.invocations[0]?.params?.["data"]).toBe("not-base64");
    expect(
      (
        await invokeAnki([
          "media",
          "store",
          "--data",
          "eA==",
          "--filename",
          "a.png",
          "--delete-original",
        ])
      ).code,
    ).toBe(2);
    expect((await invokeAnki(["media", "delete", "--filename", "a.mp3"])).code).toBe(2);

    const deleted = await invokeAnki(
      ["media", "delete", "--filename", "../a.mp3", "--yes"],
      (): null => null,
    );
    expect(deleted.invocations[0]).toEqual({
      action: "deleteMediaFile",
      params: { filename: "a.mp3" },
    });

    const removed: string[] = [];
    const dry = await invokeAnki(
      ["media", "store", "--file", "a.png", "--delete-original", "--dry-run"],
      (): string => "a.png",
      {
        accessFile: async (): Promise<void> => undefined,
        removeFile: async (path: string): Promise<void> => void removed.push(path),
      },
    );
    expect([dry.invocations.length, removed.length]).toEqual([0, 0]);
    expect(JSON.parse(dry.stdout).preview.files[0].action).toBe("delete");
    const dryDelete = await invokeAnki([
      "media",
      "delete",
      "--filename",
      "a.mp3",
      "--yes",
      "--dry-run",
    ]);
    expect([dryDelete.invocations.length, JSON.parse(dryDelete.stdout).dryRun]).toEqual([0, true]);
    expect((await invokeAnki(["media", "get", "a.mp3"])).code).toBe(2);
    expect((await invokeAnki(["media", "delete", "a.mp3", "--yes"])).code).toBe(2);
  });

  test("honors media MIME, import directory, and host allowlists", async (): Promise<void> => {
    const mimeAllowed = await invokeAnki(
      ["media", "store", "--file", "secret.txt"],
      (): string => "secret.txt",
      {
        accessFile: async (): Promise<void> => undefined,
        env: { MEDIA_ALLOWED_TYPES: "text/plain" },
      },
    );
    expect(mimeAllowed.code).toBe(0);

    const outside = await invokeAnki(["media", "store", "--file", "a.png"], (): string => "a.png", {
      accessFile: async (): Promise<void> => undefined,
      cwd: "C:\\outside",
      env: { MEDIA_IMPORT_DIR: "C:\\allowed" },
    });
    expect([outside.code, outside.invocations.length]).toEqual([2, 0]);
    expect(outside.stderr).toContain("MEDIA_IMPORT_DIR");

    const hostAllowed = await invokeAnki(
      ["media", "store", "--url", "http://127.0.0.1/a.png"],
      (): string => "a.png",
      { env: { MEDIA_ALLOWED_HOSTS: "127.0.0.1" } },
    );
    expect(hostAllowed.invocations[0]?.action).toBe("storeMediaFile");
  });

  test("keeps structured media errors for local file effects", async (): Promise<void> => {
    const writeFailure = await invokeAnki(
      ["media", "get", "--filename", "a.mp3", "--out", "a.mp3"],
      (): string => "eA==",
      { writeFile: async (): Promise<void> => Promise.reject(new Error("disk full")) },
    );
    expect(JSON.parse(writeFailure.stderr)).toMatchObject({
      action: "retrieveMediaFile",
      hint: "Make sure Anki is running and the filename is valid",
    });

    const deleteFailure = await invokeAnki(
      ["media", "store", "--file", "a.png", "--delete-original"],
      (): string => "a.png",
      {
        accessFile: async (): Promise<void> => undefined,
        removeFile: async (): Promise<void> => Promise.reject(new Error("locked")),
      },
    );
    expect(JSON.parse(deleteFailure.stderr)).toMatchObject({
      action: "storeMediaFile",
      hint: "Make sure Anki is running and the source is valid",
    });
  });
});
